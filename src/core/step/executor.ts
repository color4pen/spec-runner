import * as path from "node:path";
import { readdir as fsReaddir, readFile as fsReadFile } from "node:fs/promises";
import type { Step, AgentStep, CliStep } from "./types.js";
import type { JobState, Verdict } from "../../state/schema.js";
import type { PipelineDeps, StoreFactory } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import type { DomainEvent } from "../event/types.js";
import type { AgentRunner } from "../port/agent-runner.js";
import type { RequiredInput } from "../port/runtime-strategy.js";
import {
  buildAllOutputContracts,
  partitionByPolicy,
} from "./output-verify.js";
import { logVerbose } from "../../logger/stdout.js";
import { logPipelineDiag } from "../lifecycle/diagnostic.js";
import { evaluateActivation } from "../reviewers/activation.js";
import { defaultSpawnFn, gitExec, type SpawnFn } from "../../util/git-exec.js";
import { detectNoOp } from "./no-op-detect.js";
import { codeReviewFindingsRoutingActive } from "../pipeline/reviewer-chain.js";
import type { CommitPushInfra } from "./commit-push.js";
import type { PermissionScope } from "../pipeline/types.js";
import { diffGuardSnapshots } from "./main-checkout-guard.js";
import { buildStepContext } from "./step-context-builder.js";
import {
  makeAgentThrowHalt,
  makeTimeoutHalt,
  makeNonSuccessHalt,
  makeDriftHalt,
  makeOutputGateHalt,
  makeCommitFailHalt,
  makeInputMissingHalt,
  makeCliStepFailHalt,
} from "./step-halt.js";
import type { StepHalt } from "./step-halt.js";
import { deriveStepCompletion } from "./step-completion.js";
import {
  CommitOrchestrator,
  type StepExecutionResult,
} from "./commit-orchestrator.js";

/**
 * StepExecutor encapsulates the I/O lifecycle for any Step.
 * Receives injected EventBus and AgentRunner (port interface).
 * Delegates all agent session logic to the runner (Design D1).
 *
 * Design D3: StepExecutor is the executor; Step is the declaration.
 * Design D5: verifyBranch / requiresCommit guard run inside the adapter (runner).
 *
 * B-13: StepExecutor (executor.ts) does not call store mutation APIs. It returns
 * a StepExecutionResult value; CommitOrchestrator owns all state persistence.
 * B-14: StepHalt application (transitionJob / attachStateAndRethrow) is owned
 * exclusively by CommitOrchestrator — executor.ts has no such call-sites.
 */
export class StepExecutor {
  private readonly spawnFn: SpawnFn;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly commitPushInfra: CommitPushInfra;
  /**
   * Optional permission scope from the pipeline descriptor.
   * undefined = no scope checking (default behavior, existing behavior preserved).
   * When set, scope breach synthesis activates only at the declared checkpoint step.
   */
  private readonly permissionScope: PermissionScope | undefined;
  /**
   * Single-writer orchestrator for sequential step state commits (B-13 / B-14).
   * Owns all calls to store.persist / store.fail / store.update / store.appendHistory /
   * store.appendInterruption / store.appendLineage.
   */
  private readonly orchestrator: CommitOrchestrator;
  /**
   * Commit serialization mutex for parallel reviewer execution.
   *
   * Design D3 (reviewer-parallel-execution): when multiple member steps execute in
   * parallel via Promise.allSettled, each one calls finalizeStepArtifacts (which runs
   * `git add -A && commit && push`). Running these concurrently causes `index.lock`
   * conflicts and state write races.
   *
   * This promise-chain acts as a simple FIFO mutex: each finalizeStepArtifacts call
   * appends to the chain and awaits the previous one before starting.
   *
   * - Single-step (non-parallel) path: the chain always has length 1 → zero overhead.
   * - Parallel path: commits are queued and executed one at a time.
   * - commit/push is seconds-order; FIFO is sufficient (no priority needed).
   *
   * NOTE: session execution, activation listChangedFiles, prepareStepArtifacts, and
   * verdict derivation are all still concurrent — only the commit/push is serialized.
   */
  private commitMutex: Promise<void> = Promise.resolve();

  constructor(
    private readonly events: EventBus,
    private readonly runner: AgentRunner,
    storeFactory: StoreFactory | undefined,
    spawnFn?: SpawnFn,
    sleepFn?: (ms: number) => Promise<void>,
    permissionScope?: PermissionScope,
  ) {
    this.spawnFn = spawnFn ?? defaultSpawnFn;
    this.sleepFn = sleepFn ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.commitPushInfra = { spawnFn: this.spawnFn, sleepFn: this.sleepFn, events: this.events };
    this.permissionScope = permissionScope;
    // storeFactory may be undefined in test contexts that don't exercise store-dependent paths.
    // CommitOrchestrator throws at runtime if store operations are attempted without a factory.
    this.orchestrator = new CommitOrchestrator(storeFactory!, events, permissionScope);
  }

  /**
   * Execute a step in producer-only mode: run the step and return a StepExecutionResult
   * WITHOUT persisting state. Called by ParallelReviewRound fan-out so that the
   * coordinator (CommitOrchestrator.commitRound) can atomically commit all member
   * results after the round completes.
   *
   * B-13: Does not call store.persist / store.update / store.appendHistory / store.fail.
   * D1 (execution-ownership-model): coordinator owns all state persistence for the round.
   *
   * Event fidelity:
   *   - step:start emitted before execution.
   *   - step:complete emitted for success / skipped results.
   *   - step:error emitted for halt results (including outer-throw normalization).
   *   - payload.state uses the base state argument (no persisted state available).
   *
   * Outer throws (e.g. buildStepContext failure) are caught and normalized to
   * { kind: "halt" } — this method never rejects.
   */
  async produceResult(
    step: Step,
    state: JobState,
    deps: PipelineDeps,
  ): Promise<StepExecutionResult> {
    this.events.emit("step:start", { step: step.name, state });

    try {
      const result = await this.produce(step, state, deps);
      if (result.kind === "halt") {
        this.events.emit("step:error", {
          step: step.name,
          error: result.halt.thrownErr,
          state,
        });
      } else {
        // success or skipped
        this.events.emit("step:complete", { step: step.name, state });
      }
      return result;
    } catch (err) {
      // Outer throw (e.g. buildStepContext failure) — normalize to halt, never reject
      const halt = makeAgentThrowHalt(
        err as Error & { code?: string; hint?: string },
        step.name,
        {},
      );
      this.events.emit("step:error", {
        step: step.name,
        error: err as Error,
        state,
      });
      return { kind: "halt", halt };
    }
  }

  /**
   * Execute a single step, driving the full I/O lifecycle:
   * 1. emit step:start
   * 2. begin (record start in state via CommitOrchestrator)
   * 3. produce (run agent/CLI step, return StepExecutionResult)
   * 4. apply (CommitOrchestrator commits result to state)
   * 5. emit step:complete or step:error
   *
   * Error semantics: on failure, attaches `err.state` and rethrows.
   */
  async execute(
    step: Step,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    this.events.emit("step:start", { step: step.name, state: jobState });
    logVerbose("step", "step started", { step: step.name, jobId: jobState.jobId });

    try {
      const begun = await this.orchestrator.begin(step, jobState);
      const result = await this.produce(step, begun, deps);
      const out = await this.orchestrator.apply(step, begun, deps, result);
      logVerbose("step", "step completed", { step: step.name, jobId: jobState.jobId });
      this.events.emit("step:complete", { step: step.name, state: out });
      return out;
    } catch (err) {
      const errState = (err as Record<string, unknown>)["state"] as JobState | undefined;
      logVerbose("step", "step error", { step: step.name, jobId: jobState.jobId, error: (err as Error).message });
      this.events.emit("step:error", {
        step: step.name,
        error: err as Error,
        state: errState ?? jobState,
      });
      throw err;
    }
  }

  /** Dispatch to CLI or Agent producer based on step.kind. Never dispatch on name. */
  private async produce(
    step: Step,
    state: JobState,
    deps: PipelineDeps,
  ): Promise<StepExecutionResult> {
    if (step.kind === "cli") {
      logPipelineDiag("executor:step:dispatch", `step=${step.name}, kind=${step.kind}`);
      return this.runCliStep(step, state, deps);
    }
    // kind === "agent" — delegate to AgentRunner port (Design D1)
    logPipelineDiag("executor:step:dispatch", `step=${step.name}, kind=${step.kind}`);
    return this.runAgentStep(step, state, deps);
  }

  /**
   * Pre-validate required step inputs before execution (D3, step-io-contracts).
   * Projects step.reads() → RequiredInput[] and delegates existence checks to the
   * RuntimeStrategy. Returns a StepHalt when a required input is absent;
   * returns null when validation passes.
   *
   * B-13: store mutation APIs removed — caller handles the returned halt via apply().
   */
  private async validateRequiredInputs(
    step: Step,
    state: JobState,
    deps: PipelineDeps,
    cwd: string,
    recordOpts: { startedAt?: string },
  ): Promise<StepHalt | null> {
    if (!deps.runtimeStrategy || !step.reads) return null;
    const reads = step.reads(state, deps);
    const required: RequiredInput[] = reads
      .filter((r) => r.required !== false)
      .map((r) => ({ path: r.path, artifact: r.artifact ?? "file" }));
    if (required.length === 0) return null;

    try {
      await deps.runtimeStrategy.validateStepInputs(required, cwd, state.branch ?? null);
      return null;
    } catch (thrownErr: unknown) {
      const err = thrownErr as Error & { code?: string; hint?: string };
      return makeInputMissingHalt(err, step.name, recordOpts);
    }
  }

  /**
   * Agent step producer: run the agent and return a StepExecutionResult.
   * Does NOT persist state — all state mutation is delegated to CommitOrchestrator.
   *
   * TC-012: store.update (begin) is handled by CommitOrchestrator.begin() before this runs.
   */
  private async runAgentStep(
    step: AgentStep,
    state: JobState,
    deps: PipelineDeps,
  ): Promise<StepExecutionResult> {
    const cwd = deps.cwd ?? process.cwd();

    // ---------------------------------------------------------------------------
    // Activation gate (reviewer-activation-conditions D5)
    // Only evaluated when step.activation is set (custom reviewers with conditions).
    // Standard pipeline steps and unconstrained reviewers are unaffected (no-op path).
    //
    // Fail-closed: when the runtime explicitly declares it cannot derive changed files
    // (managed runtime — no local git worktree), listChangedFiles returns [] structurally,
    // not because nothing changed. Evaluating a `paths` condition against that empty list
    // would silently skip the reviewer (fail-open). Mirror scope-check (scope-check.ts):
    // consult canDeriveChangedFiles() first and, when non-derivable, skip listChangedFiles
    // entirely and let evaluateActivation activate paths-conditioned reviewers (fail-closed)
    // rather than dropping them.
    // ---------------------------------------------------------------------------
    if (step.activation) {
      const baseBranch = deps.request.baseBranch ?? "main";
      // Structural short-circuit: if the runtime explicitly declares it cannot derive
      // changed files, skip listChangedFiles entirely and activate fail-closed.
      const structurallyDerivable =
        deps.runtimeStrategy?.canDeriveChangedFiles?.() !== false;
      let changedFiles: string[] = [];
      let changedFilesDerivable = structurallyDerivable;
      if (deps.runtimeStrategy && structurallyDerivable) {
        const result = await deps.runtimeStrategy.listChangedFiles(baseBranch, cwd, state.branch ?? null);
        if (result.kind === "success") {
          changedFiles = result.files;
        } else {
          // Per-call derivation failure: treat same as structural non-derivability.
          changedFilesDerivable = false;
        }
      }
      const decision = evaluateActivation(step.activation, {
        changedFiles,
        requestType: deps.request.type,
        changedFilesDerivable,
      });
      if (!decision.activated) {
        return { kind: "skipped", skipReason: decision.reason };
      }
    }

    // ---------------------------------------------------------------------------
    // skipWhen gate (reduce-added-agent-turns T-02)
    // Separate axis from activation: evaluates state/deps-dependent predicates for
    // steps whose outcome is deterministically fixed before the agent runs.
    // Short-circuits before buildStepContext / prepareStepArtifacts (no side effects).
    // ---------------------------------------------------------------------------
    if (step.skipWhen) {
      const skipReason = step.skipWhen(state, deps);
      if (skipReason !== null) {
        return { kind: "skipped", skipReason };
      }
    }

    // ---------------------------------------------------------------------------
    // Build agent run context — pure assembly, no control flow, no exceptions.
    // ---------------------------------------------------------------------------
    const ctx = await buildStepContext(step, state, deps, cwd, (event: DomainEvent, payload: Record<string, unknown>) => {
      this.events.emit(event, payload as never);
    }, {
      readFile: (p: string, _enc: string) => fsReadFile(p, "utf-8"),
      readdir: (dir: string) => fsReaddir(dir),
    });

    // Capture main-checkout guard snapshot before agent executes (D2, D4).
    const guardBefore: import("../port/runtime-strategy.js").MainCheckoutGuardSnapshot | null =
      deps.runtimeStrategy?.snapshotMainCheckoutGuard
        ? await deps.runtimeStrategy.snapshotMainCheckoutGuard(cwd, deps.config)
        : null;

    // Capture HEAD SHA before agent executes (for no-op detection and finalize).
    // Uses raw git spawn rather than runtimeStrategy.captureHeadSha so that only the
    // post-finalize captureHeadSha call (for commitOid, below) goes through the port.
    // TC-012: the ordering invariant is asserted in executor-oid-capture.test.ts.
    const headBeforeStep: string | null = deps.runtimeStrategy
      ? await gitExec(this.spawnFn, cwd, ["rev-parse", "HEAD"])
      : null;

    // Place step output templates in the change folder before the agent runs.
    await deps.runtimeStrategy?.prepareStepArtifacts(cwd, deps.slug, step.name, state);

    const startedAt = new Date().toISOString();

    // Pre-validate required step inputs (D3, step-io-contracts).
    const inputHalt = await this.validateRequiredInputs(step, state, deps, cwd, { startedAt });
    if (inputHalt) {
      return { kind: "halt", halt: inputHalt };
    }

    logPipelineDiag("executor:agent:pre-run", `step=${step.name}`);

    // ---------------------------------------------------------------------------
    // Run agent session
    // ---------------------------------------------------------------------------
    let runResult: import("../port/agent-runner.js").AgentRunResult;
    try {
      runResult = await this.runner.run(ctx);
    } catch (thrownErr: unknown) {
      const halt = makeAgentThrowHalt(
        thrownErr as Error & { code?: string; hint?: string },
        step.name,
        { startedAt },
      );
      return { kind: "halt", halt };
    }

    const completedAt = new Date().toISOString();
    logPipelineDiag("executor:agent:post-run", `step=${step.name}, reason=${runResult.completionReason}`);

    if (runResult.completionReason === "timeout") {
      // Poll timeout — transition to awaiting-resume (not a hard failure)
      const halt = makeTimeoutHalt(runResult, step.name, {
        completedAt,
        startedAt,
        transientRetryAttempts: runResult.transientRetryAttempts,
      });
      return { kind: "halt", halt };
    }

    if (runResult.completionReason !== "success") {
      // Agent step failed — non-success completionReason
      const halt = makeNonSuccessHalt(runResult, step.name, {
        completedAt,
        startedAt,
        transientRetryAttempts: runResult.transientRetryAttempts,
      });
      return { kind: "halt", halt };
    }

    // T-02 (outcome-cutover R3): no-tool-call → proceed instead of halt.

    // ---------------------------------------------------------------------------
    // Main-checkout drift detection (D2, D5)
    // Runs after all failure guards, before output contract gate.
    // ---------------------------------------------------------------------------
    if (guardBefore !== null) {
      const guardAfter: import("../port/runtime-strategy.js").MainCheckoutGuardSnapshot | null =
        deps.runtimeStrategy?.snapshotMainCheckoutGuard
          ? await deps.runtimeStrategy.snapshotMainCheckoutGuard(cwd, deps.config)
          : null;

      if (guardAfter !== null) {
        const drift = diffGuardSnapshots(guardBefore, guardAfter);
        if (drift.drifted) {
          const halt = makeDriftHalt(drift, step.name, deps.slug, { startedAt });
          return { kind: "halt", halt };
        }
      }
    }

    // Output contract gate (D3: step-completion-verification).
    if (deps.runtimeStrategy) {
      const allContracts = buildAllOutputContracts(step, state, deps);

      if (allContracts.length > 0) {
        const checkResult = await deps.runtimeStrategy.validateStepOutputs(
          allContracts, cwd, state.branch ?? null,
        );
        const { followUp, halt: haltViolations } = partitionByPolicy(checkResult);

        if (haltViolations.length > 0 || followUp.length > 0) {
          const allViolations = [...haltViolations, ...followUp];
          const halt = makeOutputGateHalt(allViolations, step.name, state.branch ?? null, { startedAt });
          return { kind: "halt", halt };
        }
      }
    }

    // ---------------------------------------------------------------------------
    // Finalize step artifacts (git commit/push) — serialized via commitMutex.
    // Remains in producer (git side effects are R5, not state writes — B-13 scope).
    //
    // Design D3 (reviewer-parallel-execution): finalizeStepArtifacts is serialized via a
    // FIFO promise-chain mutex to prevent git index.lock conflicts when multiple member steps
    // execute concurrently (Promise.allSettled fan-out in pipeline.ts).
    //
    // D3 (round-owned-git-effects): when deps.roundOwnsGitEffects is true, the executor
    // is running inside a coordinator round. The coordinator owns all git side effects for
    // this round, so finalizeStepArtifacts (cleanupOutputTemplates + commitAndPush) must
    // NOT be called here. The coordinator will call commitRoundArtifacts after all members
    // complete, staging only the declared outputs.
    // ---------------------------------------------------------------------------
    if (!deps.roundOwnsGitEffects) {
      const stateForFinalize = state;
      const headForFinalize = headBeforeStep;
      let finalizeError: unknown;

      const myFinalize = this.commitMutex
        .catch(() => {}) // Absorb any previous chain error; each call handles its own
        .then(async () => {
          if (!deps.runtimeStrategy) return;
          await deps.runtimeStrategy.finalizeStepArtifacts(step, stateForFinalize, deps, headForFinalize, this.commitPushInfra)
            .catch((err: unknown) => { finalizeError = err; });
        });
      this.commitMutex = myFinalize;
      await myFinalize;

      if (finalizeError !== undefined) {
        const halt = makeCommitFailHalt(
          finalizeError as Error & { code?: string; hint?: string },
          step.name,
          { startedAt },
        );
        return { kind: "halt", halt };
      }
    }

    // Capture HEAD OID after the per-node commit (bite-evidence-forward R4, T-02).
    // Only for sequential steps that own their own git commit (roundOwnsGitEffects === false).
    const commitOid: string | undefined =
      !deps.roundOwnsGitEffects && deps.runtimeStrategy
        ? (await deps.runtimeStrategy.captureHeadSha(cwd)) ?? undefined
        : undefined;

    // T-03 (no-op detection): delegate to sibling no-op-detect.ts.
    const noOpVerdictOverride: Verdict | undefined =
      deps.runtimeStrategy && headBeforeStep !== null
        ? await detectNoOp(step, deps.runtimeStrategy, {
            headBeforeStep,
            cwd,
            branch: state.branch ?? null,
            completionReason: runResult.completionReason,
            findingsRoutingApproved: step.noOpDetect === true ? codeReviewFindingsRoutingActive(state) : false,
          })
        : undefined;

    // Derive completion (verdict + persistToolResult) — pure computation, no I/O.
    const completion = await deriveStepCompletion(
      step, state, deps, {
        resultContent: runResult.resultContent,
        sessionId: runResult.sessionId,
        agentBranch: runResult.agentBranch,
        modelUsage: runResult.modelUsage,
        toolResult: runResult.toolResult,
        followUpAttempts: runResult.followUpAttempts,
        transientRetryAttempts: runResult.transientRetryAttempts,
        completionReportDiagnostics: runResult.completionReportDiagnostics,
        verdictOverride: noOpVerdictOverride,
      },
      this.permissionScope,
    );

    const session = runResult.sessionId
      ? { id: runResult.sessionId, agentId: "", environmentId: "" }
      : null;

    return {
      kind: "success",
      completion,
      completedAt,
      startedAt,
      session,
      agentBranch: runResult.agentBranch ?? undefined,
      modelUsage: runResult.modelUsage,
      followUpAttempts: runResult.followUpAttempts,
      transientRetryAttempts: runResult.transientRetryAttempts,
      completionReportDiagnostics: runResult.completionReportDiagnostics,
      addedTurns: runResult.addedTurns,
      ...(commitOid !== undefined ? { commitOid } : {}),
    };
  }

  /**
   * CLI step producer: run step.run() and return a StepExecutionResult.
   * Does NOT persist state — all state mutation is delegated to CommitOrchestrator.
   *
   * TC-012: store.update (begin) is handled by CommitOrchestrator.begin() before this runs.
   */
  private async runCliStep(
    step: CliStep,
    state: JobState,
    deps: PipelineDeps,
  ): Promise<StepExecutionResult> {
    const cwd = deps.cwd ?? process.cwd();
    const startedAt = new Date().toISOString();

    // Pre-validate required step inputs (D3, step-io-contracts).
    const inputHalt = await this.validateRequiredInputs(step, state, deps, cwd, { startedAt });
    if (inputHalt) {
      return { kind: "halt", halt: inputHalt };
    }

    // Run the CLI step
    try {
      await step.run(state, deps);
    } catch (err) {
      const halt = makeCliStepFailHalt(
        err as Error & { code?: string; hint?: string },
        step.name,
        { startedAt },
      );
      return { kind: "halt", halt };
    }

    const completedAt = new Date().toISOString();

    // Read the result file from disk (not GitHub — CLI steps write locally)
    const resultFilePath = step.resultFilePath(state, deps);
    let fileContent: string | null = null;
    try {
      const { readFile } = await import("node:fs/promises");
      fileContent = await readFile(
        path.resolve(cwd, resultFilePath),
        "utf-8",
      );
    } catch {
      // File may not exist yet — treat as null verdict
    }

    // Derive completion
    const completion = await deriveStepCompletion(
      step, state, deps, { resultContent: fileContent },
      this.permissionScope,
    );

    return {
      kind: "success",
      completion,
      completedAt,
      startedAt,
      session: null,
    };
  }
}
