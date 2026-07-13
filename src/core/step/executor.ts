import * as path from "node:path";
import { readdir as fsReaddir, readFile as fsReadFile } from "node:fs/promises";
import type { Step, AgentStep, CliStep } from "./types.js";
import type { JobState, Verdict, ModelUsage } from "../../state/schema.js";
import type { PipelineDeps, StoreFactory } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import type { DomainEvent } from "../event/types.js";
import type { AgentRunner } from "../port/agent-runner.js";
import type { RequiredInput } from "../port/runtime-strategy.js";
import type { JobStateStore } from "../../store/job-state-store.js";
import {
  buildAllOutputContracts,
  partitionByPolicy,
} from "./output-verify.js";
import { pushStepResult } from "../../state/helpers.js";
import { logVerbose } from "../../logger/stdout.js";
import { logPipelineDiag } from "../lifecycle/diagnostic.js";
import { appendInvocation } from "../usage/store.js";
import type { LineageRecord } from "../../store/event-journal.js";
import { usageJsonPath } from "../../util/paths.js";
import {
  recordFailedStepResult,
  attachStateAndRethrow,
} from "./executor-helpers.js";
import { evaluateActivation } from "../reviewers/activation.js";
import type { ErrorInfo } from "../../state/schema.js";
import { getBranchPrefix } from "../../config/type-config.js";
import { transitionJob } from "../../state/lifecycle.js";
import { defaultSpawnFn, type SpawnFn } from "../../util/git-exec.js";
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
} from "./step-halt.js";
import { deriveStepCompletion } from "./step-completion.js";
import type { StepCompletionInput } from "./step-completion.js";

/**
 * StepExecutor encapsulates the I/O lifecycle for any Step.
 * Receives injected EventBus and AgentRunner (port interface).
 * Delegates all agent session logic to the runner (Design D1).
 *
 * Design D3: StepExecutor is the executor; Step is the declaration.
 * Design D5: verifyBranch / requiresCommit guard run inside the adapter (runner).
 */
export class StepExecutor {
  private readonly spawnFn: SpawnFn;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly storeFactory: StoreFactory;
  private readonly commitPushInfra: CommitPushInfra;
  /**
   * Optional permission scope from the pipeline descriptor.
   * undefined = no scope checking (default behavior, existing behavior preserved).
   * When set, scope breach synthesis activates only at the declared checkpoint step.
   */
  private readonly permissionScope: PermissionScope | undefined;
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
    storeFactory: StoreFactory,
    spawnFn?: SpawnFn,
    sleepFn?: (ms: number) => Promise<void>,
    permissionScope?: PermissionScope,
  ) {
    this.storeFactory = storeFactory;
    this.spawnFn = spawnFn ?? defaultSpawnFn;
    this.sleepFn = sleepFn ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    this.commitPushInfra = { spawnFn: this.spawnFn, sleepFn: this.sleepFn, events: this.events };
    this.permissionScope = permissionScope;
  }

  /**
   * Execute a single step, driving the full I/O lifecycle:
   * 1. emit step:start
   * 2. Delegate to CLI or Agent runner
   * 3. emit step:complete or step:error
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
      const result = await this.runStepInternal(step, jobState, deps);
      logVerbose("step", "step completed", { step: step.name, jobId: jobState.jobId });
      this.events.emit("step:complete", { step: step.name, state: result });
      return result;
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

  /** Dispatch to CLI or Agent runner based on step.kind. Never dispatch on name. */
  private async runStepInternal(
    step: Step,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    if (step.kind === "cli") {
      logPipelineDiag("executor:step:dispatch", `step=${step.name}, kind=${step.kind}`);
      return this.runCliStep(step, jobState, deps);
    }
    // kind === "agent" — delegate to AgentRunner port (Design D1)
    logPipelineDiag("executor:step:dispatch", `step=${step.name}, kind=${step.kind}`);
    return this.runAgentStep(step, jobState, deps);
  }

  /**
   * Agent step: delegate to AgentRunner.run(). Executor owns all state persistence.
   * TC-012: store.update before runner.run so `specrunner ps` shows current step.
   */
  /**
   * Pre-validate required step inputs before execution (D3, step-io-contracts).
   * Projects step.reads() → RequiredInput[] and delegates existence checks to the
   * RuntimeStrategy. Records a failed step result and rethrows (with state attached)
   * when a required input is absent.
   */
  private async validateRequiredInputs(
    step: Step,
    state: JobState,
    deps: PipelineDeps,
    store: JobStateStore,
    cwd: string,
    startedAt: string,
  ): Promise<void> {
    if (!deps.runtimeStrategy || !step.reads) return;
    const reads = step.reads(state, deps);
    const required: RequiredInput[] = reads
      .filter((r) => r.required !== false)
      .map((r) => ({ path: r.path, artifact: r.artifact ?? "file" }));
    if (required.length === 0) return;
    await deps.runtimeStrategy.validateStepInputs(required, cwd, state.branch ?? null)
      .catch(async (thrownErr: unknown) => {
        const err = thrownErr as Error & { code?: string; hint?: string };
        const errorInfo: ErrorInfo = {
          code: err.code ?? "STEP_INPUT_MISSING",
          message: err.message,
          hint: (err as { hint?: string }).hint ?? "",
        };
        let failed = recordFailedStepResult(state, step.name, errorInfo, { startedAt });
        failed = await store.fail(failed, errorInfo, step.name);
        failed = await store.appendHistory(failed, {
          ts: new Date().toISOString(),
          step: `${step.name}-failed`,
          status: "error",
          message: `${step.name} failed: ${errorInfo.code} — ${errorInfo.message}`,
        });
        await store.persist(failed);
        attachStateAndRethrow(err, failed);
        return null as never;
      });
  }

  private async runAgentStep(
    step: AgentStep,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    const store = this.getStore(jobState.jobId);
    let state = await store.update(jobState, { step: step.name });
    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: `${step.name}-started`,
      status: "started",
      message: `Starting ${step.name} step`,
    });

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
      // Fail-closed: when the runtime explicitly declares it cannot derive changed
      // files (managed runtime — no local git worktree), listChangedFiles returns []
      // *structurally*, not because nothing changed. Evaluating a `paths` condition
      // against that empty list would silently skip the reviewer (fail-open). Mirror
      // scope-check (scope-check.ts): treat non-derivable as "paths unverifiable" and
      // let evaluateActivation activate instead of skip.
      const changedFilesDerivable =
        deps.runtimeStrategy?.canDeriveChangedFiles?.() !== false;
      const changedFiles =
        deps.runtimeStrategy && changedFilesDerivable
          ? await deps.runtimeStrategy.listChangedFiles(baseBranch, cwd, state.branch ?? null)
          : [];
      const decision = evaluateActivation(step.activation, {
        changedFiles,
        requestType: deps.request.type,
        changedFilesDerivable,
      });
      if (!decision.activated) {
        return this.finalizeSkippedStep(step, state, decision.reason);
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

    // One-shot: resume-related inputs are consumed by the first agent step that sees them.
    // This clears unmatched snapshots too, so stale resume context cannot leak into a later step.
    if (deps.resumePrompt !== undefined || deps.resumeContext !== undefined) {
      deps.resumePrompt = undefined;
      deps.resumeContext = undefined;
    }

    // Capture main-checkout guard snapshot before agent executes (D2, D4).
    // LocalRuntime (worktree mode): git status + content hash of guarded paths.
    // LocalRuntime (no-worktree) / ManagedRuntime / absent strategy: null (skip).
    const guardBefore: import("../port/runtime-strategy.js").MainCheckoutGuardSnapshot | null =
      deps.runtimeStrategy?.snapshotMainCheckoutGuard
        ? await deps.runtimeStrategy.snapshotMainCheckoutGuard(cwd, deps.config)
        : null;

    // Capture HEAD SHA before agent executes (delegated to RuntimeStrategy seam).
    // LocalRuntime: git rev-parse HEAD. ManagedRuntime / no strategy: null (safe).
    const headBeforeStep: string | null = deps.runtimeStrategy
      ? await deps.runtimeStrategy.captureHeadSha(cwd)
      : null;

    // Place step output templates in the change folder before the agent runs (delegated to RuntimeStrategy).
    await deps.runtimeStrategy?.prepareStepArtifacts(cwd, deps.slug, step.name, state);

    const startedAt = new Date().toISOString();

    // Pre-validate required step inputs (D3, step-io-contracts).
    // Runs before runner.run() so the agent session is never started on missing inputs.
    await this.validateRequiredInputs(step, state, deps, store, cwd, startedAt);

    logPipelineDiag("executor:agent:pre-run", `step=${step.name}`);
    const runResult = await this.runner.run(ctx).catch(async (thrownErr: unknown) => {
      const halt = makeAgentThrowHalt(thrownErr as Error & { code?: string; hint?: string }, step.name);
      state = recordFailedStepResult(state, step.name, halt.error, { startedAt });
      state = await store.fail(state, halt.error, step.name);
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: `${step.name}-failed`,
        status: "error",
        message: `${step.name} failed: ${halt.error.code} — ${halt.error.message}`,
      });
      await store.persist(state);
      attachStateAndRethrow(halt.thrownErr, state);
      // Never reached — attachStateAndRethrow always throws
      return null as never;
    });

    const completedAt = new Date().toISOString();
    logPipelineDiag("executor:agent:post-run", `step=${step.name}, reason=${runResult.completionReason}`);

    if (runResult.completionReason === "timeout") {
      // Poll timeout — transition to awaiting-resume (not a hard failure)
      const halt = makeTimeoutHalt(runResult, step.name);
      state = recordFailedStepResult(state, step.name, halt.error, {
        completedAt,
        startedAt,
        transientRetryAttempts: runResult.transientRetryAttempts,
      });
      const { state: timeoutState } = transitionJob(state, "awaiting-resume", {
        trigger: "executor",
        reason: "timeout",
        patch: {
          resumePoint: halt.resumePoint,
          error: halt.error,
        },
      });
      state = timeoutState;
      // T-11: Record interruption event in journal
      await store.appendInterruption({
        ...halt.interruption,
        ts: new Date().toISOString(),
      });
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: `${step.name}-timeout`,
        status: "error",
        message: `${step.name} timed out: ${halt.error.message}`,
      });
      await store.persist(state);
      attachStateAndRethrow(halt.thrownErr, state);
    }

    if (runResult.completionReason !== "success") {
      // Agent step failed — record error and rethrow
      const halt = makeNonSuccessHalt(runResult, step.name);
      state = recordFailedStepResult(state, step.name, halt.error, {
        completedAt,
        startedAt,
        transientRetryAttempts: runResult.transientRetryAttempts,
      });
      state = await store.fail(state, halt.error, step.name);
      await store.persist(state);
      attachStateAndRethrow(halt.thrownErr, state);
    }

    // T-02 (outcome-cutover R3): no-tool-call → proceed instead of halt.
    // When reportTool is set but agent did not call it (toolResult === null),
    // executor proceeds to finalizeStep. Verdict is determined by step-class:
    //   judge  → "needs-fix"  (conservative; fixer loop → loop exhaustion = grounded halt)
    //   producer → completionVerdict (downstream grounded step verifies correctness)

    // ---------------------------------------------------------------------------
    // Main-checkout drift detection (D2, D5)
    // Runs after all failure guards, before output contract gate.
    // Only active in worktree mode (guardBefore non-null) and only when the
    // after-snapshot is also obtainable (fail-open: skip on git error).
    // ---------------------------------------------------------------------------
    if (guardBefore !== null) {
      const guardAfter: import("../port/runtime-strategy.js").MainCheckoutGuardSnapshot | null =
        deps.runtimeStrategy?.snapshotMainCheckoutGuard
          ? await deps.runtimeStrategy.snapshotMainCheckoutGuard(cwd, deps.config)
          : null;

      if (guardAfter !== null) {
        const drift = diffGuardSnapshots(guardBefore, guardAfter);
        if (drift.drifted) {
          const halt = makeDriftHalt(drift, step.name, deps.slug);
          const pathSummary = drift.changes.map((c) => `${c.kind}: ${c.path}`).join(", ");
          state = recordFailedStepResult(state, step.name, halt.error, { startedAt });
          const { state: driftState } = transitionJob(state, "awaiting-resume", {
            trigger: "executor",
            reason: "main checkout write detected",
            patch: {
              resumePoint: halt.resumePoint,
              mainCheckoutDrift: halt.statePatch?.mainCheckoutDrift,
              error: halt.error,
            },
          });
          state = driftState;
          await store.appendInterruption({
            ...halt.interruption,
            ts: new Date().toISOString(),
          });
          state = await store.appendHistory(state, {
            ts: new Date().toISOString(),
            step: `${step.name}-main-checkout-write-detected`,
            status: "error",
            message: `${step.name}: main checkout write detected — ${pathSummary}`,
          });
          await store.persist(state);
          attachStateAndRethrow(halt.thrownErr, state);
        }
      }
    }

    // Output contract gate (D3: step-completion-verification).
    // Runs after runner.run() succeeds, before finalizeStepArtifacts (commit).
    // Only active when runtimeStrategy is available and step declares contracts.
    // runtimeStrategy 未注入 / 契約 0 件 / violation 0 件 → 素通り。
    if (deps.runtimeStrategy) {
      const allContracts = buildAllOutputContracts(step, state, deps);

      if (allContracts.length > 0) {
        const checkResult = await deps.runtimeStrategy.validateStepOutputs(
          allContracts, cwd, state.branch ?? null,
        );
        const { followUp, halt: haltViolations } = partitionByPolicy(checkResult);

        // Gate: halt violations OR remaining follow-up violations → STEP_OUTPUT_MISSING
        if (haltViolations.length > 0 || followUp.length > 0) {
          const allViolations = [...haltViolations, ...followUp];
          const halt = makeOutputGateHalt(allViolations, step.name, state.branch ?? null);
          state = recordFailedStepResult(state, step.name, halt.error, { startedAt });
          state = await store.fail(state, halt.error, step.name);
          state = await store.appendHistory(state, {
            ts: new Date().toISOString(),
            step: `${step.name}-failed`,
            status: "error",
            message: `${step.name} failed: ${halt.error.code} — ${halt.error.message}`,
          });
          await store.persist(state);
          attachStateAndRethrow(halt.thrownErr, state);
        }
      }
    }

    // Delete B-group templates and commit-push (delegated to RuntimeStrategy seam).
    // LocalRuntime: cleanupOutputTemplates() + commitAndPush(). ManagedRuntime / no strategy: no-op.
    // commitAndPush errors are recorded in state here (executor owns state), then rethrown.
    //
    // Design D3 (reviewer-parallel-execution): finalizeStepArtifacts is serialized via a
    // FIFO promise-chain mutex to prevent git index.lock conflicts when multiple member steps
    // execute concurrently (Promise.allSettled fan-out in pipeline.ts).
    //
    // Pattern:
    //   const myFinalize = this.commitMutex.catch(() => {}).then(async () => { ... });
    //   this.commitMutex = myFinalize;   // next call waits for this one
    //   await myFinalize;                // this call waits only for itself (not future calls)
    //
    // Single-step (non-parallel) path: mutex is always immediately resolved → zero overhead.
    // The .catch(() => {}) absorbs prior chain failures so each call gets its own error handling.
    {
      const stateForFinalize = state;
      const headForFinalize = headBeforeStep;
      let finalizeError: unknown;

      const myFinalize = this.commitMutex
        .catch(() => {}) // Absorb any previous chain error; each call handles its own
        .then(async () => {
          if (!deps.runtimeStrategy) return;
          // errors are caught below to capture in finalizeError for the outer scope
          await deps.runtimeStrategy.finalizeStepArtifacts(step, stateForFinalize, deps, headForFinalize, this.commitPushInfra)
            .catch((err: unknown) => { finalizeError = err; });
        });
      this.commitMutex = myFinalize;
      await myFinalize;

      if (finalizeError !== undefined) {
        const halt = makeCommitFailHalt(finalizeError as Error & { code?: string; hint?: string }, step.name);
        state = recordFailedStepResult(state, step.name, halt.error, { startedAt });
        state = await store.fail(state, halt.error, step.name);
        await store.persist(state);
        attachStateAndRethrow(halt.thrownErr, state);
        return null as never;
      }
    }

    // T-03 (no-op detection): delegate to sibling no-op-detect.ts (executor-bloat guard).
    // Returns "needs-fix" when step.noOpDetect is true and no source files changed;
    // undefined otherwise (no override).
    // findingsRoutingApproved: true suppresses escalation for approved findings-routing
    // path no-ops (e.g. all fixable findings are LOW — prompt intentionally ignores them).
    // Guard with step.noOpDetect === true so we only compute reviewer-chain state for
    // code-fixer; non-noOpDetect steps pass false and skip the reviewer-chain logic.
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

    return this.finalizeStep(step, state, deps, completedAt, startedAt, {
      resultContent: runResult.resultContent,
      sessionId: runResult.sessionId,
      agentBranch: runResult.agentBranch,
      modelUsage: runResult.modelUsage,
      toolResult: runResult.toolResult,
      followUpAttempts: runResult.followUpAttempts,
      transientRetryAttempts: runResult.transientRetryAttempts,
      completionReportDiagnostics: runResult.completionReportDiagnostics,
      verdictOverride: noOpVerdictOverride,
    });
  }

  /**
   * Finalize a step that was skipped due to activation conditions not being met.
   *
   * Contract:
   * - Agent is NOT started.
   * - No commit or push is performed.
   * - No output template is placed.
   * - A StepRun with verdict: "skipped" + skipReason is recorded in state.
   * - A warning history entry is appended.
   * - verdict:parsed is emitted for pipeline transition routing.
   * - State is persisted.
   */
  private async finalizeSkippedStep(
    step: AgentStep,
    state: JobState,
    skipReason: string,
  ): Promise<JobState> {
    const store = this.getStore(state.jobId);
    const now = new Date().toISOString();

    state = pushStepResult(state, step.name, {
      session: null,
      verdict: "skipped" as import("../../state/schema.js").Verdict,
      findingsPath: null,
      completedAt: now,
      startedAt: now,
      error: null,
      skipReason,
    });

    state = await store.appendHistory(state, {
      ts: now,
      step: `${step.name}-skipped`,
      status: "warning",
      message: `${step.name} skipped: ${skipReason}`,
    });

    this.events.emit("verdict:parsed", {
      step: step.name,
      outcome: {
        verdict: "skipped",
        toolResult: null,
        followUpAttempts: 0,
      },
    });

    await store.persist(state);
    return state;
  }

  /**
   * Get or create a JobStateStore for the given job ID.
   * Cached on the executor instance to avoid redundant constructions within a step.
   */
  private getStore(jobId: string): JobStateStore {
    if (!this.storeCache || this.storeCacheJobId !== jobId) {
      this.storeCache = this.storeFactory(jobId);
      this.storeCacheJobId = jobId;
    }
    return this.storeCache;
  }

  private storeCache: JobStateStore | undefined;
  private storeCacheJobId: string | undefined;

  /** CLI step: run directly (no session), read result file, delegate to finalizeStep. */
  private async runCliStep(
    step: CliStep,
    jobState: JobState,
    deps: PipelineDeps,
  ): Promise<JobState> {
    const store = this.getStore(jobState.jobId);
    let state = await store.update(jobState, { step: step.name });
    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: "step-transition",
      status: "ok",
      message: `Transitioning to ${step.name} step`,
    });

    const startedAt = new Date().toISOString();

    // Pre-validate required step inputs (D3, step-io-contracts).
    await this.validateRequiredInputs(step, state, deps, store, deps.cwd ?? process.cwd(), startedAt);

    try {
      await step.run(state, deps);
    } catch (err) {
      const errMsg = (err as Error).message;
      const errorInfo = {
        code: "CLI_STEP_FAILED",
        message: `${step.name} failed: ${errMsg}`,
        hint: `Check the ${step.name} output for details.`,
      };
      state = await store.fail(state, errorInfo, step.name);
      state = recordFailedStepResult(state, step.name, errorInfo, {
        startedAt,
      });
      await store.persist(state);
      attachStateAndRethrow(err, state);
    }

    const completedAt = new Date().toISOString();

    // Read the result file from disk (not GitHub — CLI steps write locally)
    const resultFilePath = step.resultFilePath(state, deps);
    let fileContent: string | null = null;
    try {
      const { readFile } = await import("node:fs/promises");
      const cwd = deps.cwd ?? process.cwd();
      fileContent = await readFile(
        path.resolve(cwd, resultFilePath),
        "utf-8",
      );
    } catch {
      // File may not exist yet — treat as null verdict
    }

    return this.finalizeStep(step, state, deps, completedAt, startedAt, { resultContent: fileContent });
  }

  /** Shared success path: derive completion, persist result, set branch, and emit events. */
  private async finalizeStep(
    step: Step,
    state: JobState,
    deps: PipelineDeps,
    completedAt: string,
    startedAt: string,
    agentResult?: StepCompletionInput & {
      sessionId?: string;
      agentBranch?: string;
      modelUsage?: Record<string, ModelUsage>;
      followUpAttempts?: number;
      transientRetryAttempts?: number;
      completionReportDiagnostics?: import("../port/agent-runner.js").CompletionReportDiagnostic[];
    },
  ): Promise<JobState> {
    const store = this.getStore(state.jobId);
    const findingsPath = step.resultFilePath(state, deps);

    // Derive verdict and persistToolResult via extracted completion module.
    const completion = await deriveStepCompletion(
      step, state, deps, agentResult, this.permissionScope,
    );
    const { verdict, persistToolResult } = completion;

    logVerbose("step", "verdict parsed", { step: step.name, verdict });
    this.events.emit("verdict:parsed", {
      step: step.name,
      outcome: {
        verdict,
        toolResult: persistToolResult,
        followUpAttempts: agentResult?.followUpAttempts ?? 0,
      },
    });
    const sessionEntry = agentResult?.sessionId
      ? { id: agentResult.sessionId, agentId: "", environmentId: "" }
      : null;
    state = pushStepResult(state, step.name, {
      session: sessionEntry,
      verdict: verdict as Verdict | null,
      findingsPath,
      completedAt,
      startedAt,
      error: null,
      toolResult: persistToolResult,
      followUpAttempts: agentResult?.followUpAttempts ?? 0,
      transientRetryAttempts: agentResult?.transientRetryAttempts,
      completionReportDiagnostics: agentResult?.completionReportDiagnostics,
    });
    state = await store.appendHistory(state, {
      ts: new Date().toISOString(),
      step: `${step.name}-verdict`,
      status: "ok",
      message: `${step.name} verdict: ${verdict}`,
    });
    if (agentResult?.agentBranch && !state.branch) {
      state = { ...state, branch: agentResult.agentBranch };
    }
    if ("setsBranch" in step && (step as { setsBranch?: boolean }).setsBranch === true && !state.branch) {
      const prefix = getBranchPrefix(deps.request.type);
      state = { ...state, branch: `${prefix}${deps.slug}-${state.jobId.slice(0, 8)}` };
    }
    if (completion.pullRequest) {
      state = { ...state, pullRequest: completion.pullRequest };
    }
    // T-10: Append per-step usage to changes/<slug>/usage.json before step commit
    if (agentResult?.modelUsage && deps.cwd && deps.slug) {
      const usageAbsPath = path.join(deps.cwd, usageJsonPath(deps.slug));
      try {
        await appendInvocation(usageAbsPath, {
          command: "job",
          timestamp: completedAt,
          modelUsage: agentResult.modelUsage,
          jobId: state.jobId,
          stepName: step.name,
        });
      } catch {
        // Best-effort: usage append failure must not block step completion
      }
    }
    await store.persist(state);

    // D1/D5 (artifact-observability): record lineage for steps that declare writes().
    // Best-effort: any failure is swallowed — step completion must not be blocked.
    if (deps.runtimeStrategy && step.writes && deps.cwd) {
      try {
        const cwd = deps.cwd;
        const writes = step.writes(state, deps);
        if (writes.length > 0) {
          const reads = step.reads ? step.reads(state, deps) : [];
          const [outputRefs, inputRefs] = await Promise.all([
            deps.runtimeStrategy.digestArtifacts(writes.map((r) => ({ path: r.path })), cwd, state.branch ?? null),
            deps.runtimeStrategy.digestArtifacts(reads.map((r) => ({ path: r.path })), cwd, state.branch ?? null),
          ]);
          // Merge required field from IoRef into input ArtifactRef
          const inputArtifactRefs = inputRefs.map((r, i) => {
            const ioRef = reads[i];
            if (ioRef?.required !== undefined) return { ...r, required: ioRef.required };
            return r;
          });
          const lineageRecord: LineageRecord = {
            type: "lineage",
            step: step.name,
            ts: completedAt,
            outputs: outputRefs,
            inputs: inputArtifactRefs,
          };
          await store.appendLineage(lineageRecord);
        }
      } catch {
        // Best-effort: lineage recording failure must not affect step completion
      }
    }

    return state;
  }
}
