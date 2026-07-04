import * as path from "node:path";
import { readdir, readFile } from "node:fs/promises";
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
  buildOutputFollowUpPrompt,
  partitionByPolicy,
  OUTPUT_FOLLOWUP_MAX_ATTEMPTS,
} from "./output-verify.js";
import type { OutputContract } from "../port/output-contract.js";
import { pushStepResult } from "../../state/helpers.js";
import { stderrWrite, logVerbose, isLevelEnabled } from "../../logger/stdout.js";
import { getAgentLogDir } from "../../util/xdg.js";
import * as nodePath from "node:path";
import { logPipelineDiag } from "../lifecycle/diagnostic.js";
import { toStepName } from "./step-names.js";
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
import { projectMdPath } from "../../util/paths.js";
import { resolveStepRules } from "./rules-resolve.js";
import { buildRulesFollowUpPrompts } from "./rules-followup-prompts.js";
import { defaultSpawnFn, type SpawnFn } from "../../util/git-exec.js";
import { FIXER_STEP_NAMES, getPreviousSessionId } from "./fixer-helpers.js";
import { detectNoOp } from "./no-op-detect.js";
import { codeReviewFindingsRoutingActive } from "../pipeline/reviewer-chain.js";
import type { CommitPushInfra } from "./commit-push.js";
import { DEFAULT_TOOL_RETRY } from "../../core/port/report-result.js";
import type { JudgeReportResult, ProducerReportResult, RequestReviewReportResult } from "../../core/port/report-result.js";
import type { PermissionScope } from "../pipeline/types.js";
import { computeExtraScopeFindings } from "./scope-check.js";

import { JUDGE_REPORT_TOOL, CODE_REVIEW_REPORT_TOOL, REQUEST_REVIEW_REPORT_TOOL, CONFORMANCE_REPORT_TOOL } from "./report-tool.js";
import { deriveJudgeVerdict, deriveRequestReviewVerdict, deriveConformanceVerdict, collectVerdictAffectingFindings } from "./judge-verdict.js";
import type { FindingRef } from "./judge-verdict.js";
import { filterUndecidedFindings } from "../decision/decision-ledger.js";
import { buildResumePrompt } from "../resume/resume-context.js";

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

    let projectContext: string | undefined;
    if (step.needsProjectContext === true) {
      const pmPath = path.join(cwd, projectMdPath());
      try {
        projectContext = await readFile(pmPath, "utf-8");
      } catch {
        // File not found — projectContext remains undefined
      }
    }

    // Resolve project rules for this step and build follow-up prompt list.
    const ruleContents = await resolveStepRules(step.name, cwd, {
      readdir: (dir: string) => readdir(dir),
      readFile: async (filePath: string, _enc: string): Promise<string> => readFile(filePath, "utf-8"),
    });
    const rulesPrompts = buildRulesFollowUpPrompts(ruleContents);
    const existingFollowUp = step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt;
    const allFollowUpPrompts = [
      ...(existingFollowUp ? [existingFollowUp] : []),
      ...rulesPrompts,
    ];

    // For fixer steps, pass the previous session ID so adapters can continue the session.
    // Non-fixer steps always get undefined (new session).
    const resumeSessionId = FIXER_STEP_NAMES.has(step.name)
      ? getPreviousSessionId(state, step.name) ?? undefined
      : undefined;

    // Compute session log path if debug level and repoRoot is available
    let sessionLogPath: string | undefined;
    if (isLevelEnabled("debug") && deps.repoRoot) {
      const attempt = (state.steps?.[step.name]?.length ?? 0) + 1;
      const agentLogDir = getAgentLogDir(deps.repoRoot, state.jobId);
      sessionLogPath = nodePath.join(agentLogDir, `${step.name}-${attempt}.jsonl`);
    }

    // Build outputVerification policy for follow-up-class contracts.
    // Only constructed when runtimeStrategy is available and step declares follow-up contracts.
    // Bound to (followUpContracts, cwd, branch) so detect() has no free parameters.
    let outputVerification: import("../port/output-contract.js").OutputVerificationPolicy | undefined;
    if (deps.runtimeStrategy) {
      const followUpContracts: OutputContract[] = (step.outputContracts?.(state, deps) ?? [])
        .filter((c) => c.policy === "follow-up");
      if (followUpContracts.length > 0) {
        const strategy = deps.runtimeStrategy;
        const branch = state.branch ?? null;
        outputVerification = {
          detect: () => strategy.validateStepOutputs(followUpContracts, cwd, branch),
          maxAttempts: OUTPUT_FOLLOWUP_MAX_ATTEMPTS,
          buildPrompt: (violations, _attempt) => buildOutputFollowUpPrompt(violations),
        };
      }
    }

    const effectiveResumePrompt = buildResumePrompt({
      state,
      stepName: step.name,
      resumeContext: deps.resumeContext,
      humanResumePrompt: deps.resumePrompt,
    });

    const ctx = {
      step,
      state,
      branch: state.branch ?? "",
      slug: deps.slug,
      cwd,
      requestType: deps.request.type,
      config: deps.config,
      input: {
        requestContent: deps.request.content,
        requestAdr: deps.request.adr,
        requestBaseBranch: deps.request.baseBranch,
        dynamicContext: deps.dynamicContext,
        projectContext,
      },
      session: {
        resumeSessionId,
        resumePrompt: effectiveResumePrompt,
        logPath: sessionLogPath,
      },
      policy: {
        postWorkPrompts: allFollowUpPrompts.length > 0 ? allFollowUpPrompts : undefined,
        reportTool: step.reportTool,
        toolReportRetry: step.reportTool ? DEFAULT_TOOL_RETRY : undefined,
        outputVerification,
      },
      emit: (event: DomainEvent, payload: Record<string, unknown>) => {
        // Forward adapter events to the event bus
        this.events.emit(event, payload as never);
      },
    };

    // One-shot: resume-related inputs are consumed by the first agent step that sees them.
    // This clears unmatched snapshots too, so stale resume context cannot leak into a later step.
    if (deps.resumePrompt !== undefined || deps.resumeContext !== undefined) {
      deps.resumePrompt = undefined;
      deps.resumeContext = undefined;
    }

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
      const err = thrownErr as Error & { code?: string; hint?: string };
      const errorInfo: ErrorInfo = {
        code: err.code ?? "AGENT_STEP_FAILED",
        message: err.message,
        hint: err.hint ?? "",
      };
      state = recordFailedStepResult(state, step.name, errorInfo, { startedAt });
      state = await store.fail(state, errorInfo, step.name);
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: `${step.name}-failed`,
        status: "error",
        message: `${step.name} failed: ${errorInfo.code} — ${errorInfo.message}`,
      });
      await store.persist(state);
      attachStateAndRethrow(err, state);
      // Never reached — attachStateAndRethrow always throws
      return null as never;
    });

    const completedAt = new Date().toISOString();
    logPipelineDiag("executor:agent:post-run", `step=${step.name}, reason=${runResult.completionReason}`);

    if (runResult.completionReason === "timeout") {
      // Poll timeout — transition to awaiting-resume (not a hard failure)
      const err = runResult.error ?? new Error(`Agent step '${step.name}' timed out`);
      const errorInfo: ErrorInfo = {
        code: (err as Error & { code?: string }).code ?? "POLL_TIMEOUT",
        message: err.message,
        hint: (err as Error & { hint?: string }).hint ?? "",
      };
      state = recordFailedStepResult(state, step.name, errorInfo, {
        completedAt,
        startedAt,
        transientRetryAttempts: runResult.transientRetryAttempts,
      });
      const { state: timeoutState } = transitionJob(state, "awaiting-resume", {
        trigger: "executor",
        reason: "timeout",
        patch: {
          resumePoint: { step: toStepName(step.name), reason: "timeout", iterationsExhausted: 0 },
          error: errorInfo,
        },
      });
      state = timeoutState;
      // T-11: Record interruption event in journal
      await store.appendInterruption({
        type: "interruption",
        reason: "timeout",
        ts: new Date().toISOString(),
      });
      state = await store.appendHistory(state, {
        ts: new Date().toISOString(),
        step: `${step.name}-timeout`,
        status: "error",
        message: `${step.name} timed out: ${errorInfo.message}`,
      });
      await store.persist(state);
      attachStateAndRethrow(err, state);
    }

    if (runResult.completionReason !== "success") {
      // Agent step failed — record error and rethrow
      const err = runResult.error ?? new Error(`Agent step '${step.name}' failed`);
      const errorInfo: ErrorInfo = {
        code: (err as Error & { code?: string }).code ?? "AGENT_STEP_FAILED",
        message: err.message,
        hint: (err as Error & { hint?: string }).hint ?? "",
      };
      state = recordFailedStepResult(state, step.name, errorInfo, {
        completedAt,
        startedAt,
        transientRetryAttempts: runResult.transientRetryAttempts,
      });
      state = await store.fail(state, errorInfo, step.name);
      await store.persist(state);
      attachStateAndRethrow(err, state);
    }

    // T-02 (outcome-cutover R3): no-tool-call → proceed instead of halt.
    // When reportTool is set but agent did not call it (toolResult === null),
    // executor proceeds to finalizeStep. Verdict is determined by step-class:
    //   judge  → "needs-fix"  (conservative; fixer loop → loop exhaustion = grounded halt)
    //   producer → completionVerdict (downstream grounded step verifies correctness)

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
        const { followUp, halt } = partitionByPolicy(checkResult);

        // Gate: halt violations OR remaining follow-up violations → STEP_OUTPUT_MISSING
        if (halt.length > 0 || followUp.length > 0) {
          const allViolations = [...halt, ...followUp];
          const violationPaths = allViolations.map((v) =>
            v.kind === "tasks-complete"
              ? `${v.path} (incomplete tasks: ${v.detail.join(", ") || "see file"})`
              : v.path,
          );
          const pathList = violationPaths.map((p) => `  - ${p}`).join("\n");
          const branchNote = state.branch ? ` on branch '${state.branch}'` : "";
          const errorInfo: ErrorInfo = {
            code: "STEP_OUTPUT_MISSING",
            message: `Step '${step.name}' output contract(s) not satisfied${branchNote}: ${violationPaths.join(", ")}`,
            hint: `Required step output(s) missing or incomplete${branchNote}.\nViolations:\n${pathList}`,
          };
          state = recordFailedStepResult(state, step.name, errorInfo, { startedAt });
          state = await store.fail(state, errorInfo, step.name);
          state = await store.appendHistory(state, {
            ts: new Date().toISOString(),
            step: `${step.name}-failed`,
            status: "error",
            message: `${step.name} failed: STEP_OUTPUT_MISSING — ${errorInfo.message}`,
          });
          await store.persist(state);
          const gateErr = Object.assign(
            new Error(errorInfo.message),
            { code: "STEP_OUTPUT_MISSING", hint: errorInfo.hint },
          );
          attachStateAndRethrow(gateErr, state);
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
        const err = finalizeError as Error & { code?: string; hint?: string };
        const errorInfo: ErrorInfo = {
          code: err.code ?? "COMMIT_AND_PUSH_FAILED",
          message: err.message,
          hint: err.hint ?? "",
        };
        state = recordFailedStepResult(state, step.name, errorInfo, { startedAt });
        state = await store.fail(state, errorInfo, step.name);
        await store.persist(state);
        attachStateAndRethrow(err, state);
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

    return this.finalizeStep(step, state, deps, runResult.resultContent, completedAt, startedAt, {
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

    return this.finalizeStep(step, state, deps, fileContent, completedAt, startedAt);
  }

  /** Shared success path: parse verdict, persist result, set branch, and emit events. */
  private async finalizeStep(
    step: Step,
    state: JobState,
    deps: PipelineDeps,
    resultContent: string | null,
    completedAt: string,
    startedAt: string,
    agentResult?: {
      sessionId?: string;
      agentBranch?: string;
      modelUsage?: Record<string, ModelUsage>;
      toolResult?: import("../port/report-result.js").BaseReportResult | null;
      followUpAttempts?: number;
      transientRetryAttempts?: number;
      completionReportDiagnostics?: import("../port/agent-runner.js").CompletionReportDiagnostic[];
      /**
       * T-03 (no-op detection): when set, overrides the derived verdict after all
       * normal computation completes. Used by runAgentStep to inject "needs-fix"
       * when code-fixer produced no source changes.
       */
      verdictOverride?: Verdict;
    },
  ): Promise<JobState> {
    const store = this.getStore(state.jobId);
    const findingsPath = step.resultFilePath(state, deps);
    let verdict: Verdict | string | null = null;
    let parsed: import("./types.js").ParsedStepResult | null = null;

    // T-01 (outcome-cutover R3): typed outcome takes priority over prose parse.
    // Determine if this is a judge step (spec-review / code-review) by reportTool identity.
    const stepReportTool = "reportTool" in step ? step.reportTool : undefined;
    const isConformanceStep = stepReportTool === CONFORMANCE_REPORT_TOOL;
    // isJudgeStep: include conformance so that verifyFindingRefs and no-tool-call escalation apply
    const isJudgeStep = stepReportTool === JUDGE_REPORT_TOOL || stepReportTool === CODE_REVIEW_REPORT_TOOL || isConformanceStep;
    const isRequestReviewStep = stepReportTool === REQUEST_REVIEW_REPORT_TOOL;

    // Track effective toolResult for persistence. Updated to include scope findings when a breach
    // is synthesized; otherwise equals agentResult.toolResult (unchanged, byte-equivalent).
    let persistToolResult: (import("../port/report-result.js").BaseReportResult & { findings?: import("../../kernel/report-result.js").Finding[] }) | null =
      (agentResult?.toolResult as (import("../port/report-result.js").BaseReportResult & { findings?: import("../../kernel/report-result.js").Finding[] }) | null | undefined) ?? null;

    if (agentResult !== undefined && stepReportTool !== undefined) {
      // Agent step with reportTool — use typed outcome exclusively.
      const toolResult = agentResult.toolResult;
      if (toolResult !== null && toolResult !== undefined) {
        // Non-null toolResult: derive verdict from findings (judge steps) or fields (producer).

        // Scope breach synthesis: delegate to sibling scope-check.ts (executor-bloat guard).
        // Returns [] when permissionScope absent / step not checkpoint / no breach.
        // Only meaningful for judge/conformance steps; guard in computeExtraScopeFindings.
        const extraScopeFindings = (isJudgeStep || isConformanceStep)
          ? await computeExtraScopeFindings(step.name, this.permissionScope, state, deps)
          : [];

        if (isRequestReviewStep) {
          // request-review: derive from findings using pure function
          // Filter already-decided findings before verdict derivation (D8)
          const tr = toolResult as RequestReviewReportResult;
          const allFindings = tr.findings ?? [];
          const undecidedFindings = filterUndecidedFindings(step.name, allFindings, state.decisions);
          verdict = deriveRequestReviewVerdict(undecidedFindings, tr.ok);
        } else if (isConformanceStep) {
          // conformance: derive routed needs-fix verdict (needs-fix:<target>)
          // Filter already-decided findings before verdict derivation (D8)
          // extraScopeFindings (if any) merged before filtering
          const tr = toolResult as JudgeReportResult;
          const allFindings = [...(tr.findings ?? []), ...extraScopeFindings];
          const undecidedFindings = filterUndecidedFindings(step.name, allFindings, state.decisions);
          verdict = deriveConformanceVerdict(undecidedFindings, tr.ok);
        } else if (isJudgeStep) {
          // judge: derive from findings using pure function (approved boolean ignored)
          // Filter already-decided findings before verdict derivation (D8)
          // extraScopeFindings (if any) merged before filtering
          const tr = toolResult as JudgeReportResult;
          const allFindings = [...(tr.findings ?? []), ...extraScopeFindings];
          const undecidedFindings = filterUndecidedFindings(step.name, allFindings, state.decisions);
          // T-01: use step-specific judgeVerdictFn if available (e.g. regression-gate),
          // otherwise fall back to the standard deriveJudgeVerdict.
          const verdictFn = ("judgeVerdictFn" in step && step.judgeVerdictFn)
            ? step.judgeVerdictFn
            : deriveJudgeVerdict;
          verdict = verdictFn(undecidedFindings, tr.ok);
        } else {
          // producer: status "error" → "error", else completionVerdict (fallback "success")
          const completionVerdict =
            "completionVerdict" in step
              ? (step as { completionVerdict?: Verdict }).completionVerdict
              : undefined;
          verdict =
            (toolResult as ProducerReportResult).status === "error"
              ? "error"
              : (completionVerdict ?? "success");
        }

        // Build the effective toolResult for persistence.
        // When scope findings were synthesized, merge them into findings so that
        // getOpenDecisionFindings() can read them for escalation comment rendering.
        // When no scope findings, effectiveToolResult === toolResult (unchanged).
        const effectiveToolResult: import("../port/report-result.js").BaseReportResult & { findings?: import("../../kernel/report-result.js").Finding[] } =
          extraScopeFindings.length > 0
            ? {
                ...(toolResult as JudgeReportResult),
                findings: [
                  ...((toolResult as JudgeReportResult).findings ?? []),
                  ...extraScopeFindings,
                ],
              }
            : (toolResult as import("../port/report-result.js").BaseReportResult & { findings?: import("../../kernel/report-result.js").Finding[] });
        persistToolResult = effectiveToolResult;

        // Post-verdict: verify finding refs exist for judge/request-review steps
        // Use undecided findings only — decided findings should not re-trigger escalation (D8)
        // For judge/conformance steps, effectiveToolResult includes scope findings.
        if ((isJudgeStep || isRequestReviewStep) && deps.runtimeStrategy) {
          const tr = effectiveToolResult as JudgeReportResult | RequestReviewReportResult;
          const allFindings = tr.findings ?? [];
          const undecidedFindings = filterUndecidedFindings(step.name, allFindings, state.decisions);
          const affectingFindings = collectVerdictAffectingFindings(undecidedFindings);
          if (affectingFindings.length > 0) {
            const refs: FindingRef[] = affectingFindings.map((f) => ({ file: f.file, line: f.line }));
            const cwd = deps.cwd ?? process.cwd();
            const nonExistent = await deps.runtimeStrategy.verifyFindingRefs(refs, cwd, state.branch ?? null);
            if (nonExistent.length > 0) {
              verdict = "escalation";
            }
          }
        }
      } else {
        // Null toolResult (no-tool-call proceed path) — step-class based fallback.
        if (isRequestReviewStep) {
          verdict = "needs-discussion";
        } else if (isJudgeStep) {
          // D7: no-tool-call judge verdict is escalation (conservative)
          verdict = "escalation";
        } else {
          const completionVerdict =
            "completionVerdict" in step
              ? (step as { completionVerdict?: Verdict }).completionVerdict
              : undefined;
          verdict = completionVerdict ?? "success";
        }
      }
    } else {
      // Prose parse path: grounded CLI steps or agent steps without reportTool.
      if (resultContent !== null) {
        parsed = step.parseResult(resultContent, deps);
        verdict = parsed.verdict;
      } else if ("completionVerdict" in step) {
        verdict = (step as { completionVerdict?: Verdict | null }).completionVerdict ?? null;
      }
    }

    if (verdict === null) {
      stderrWrite(`Warning: Could not parse verdict from ${step.kind} step '${step.name}'. Treating as escalation.`);
    }
    verdict = verdict ?? "escalation";

    // T-03 (no-op detection): override verdict when runAgentStep detected no source changes.
    // Guard: do not override a producer status:error verdict — error takes precedence over no-op.
    if (agentResult?.verdictOverride !== undefined && verdict !== "error") {
      verdict = agentResult.verdictOverride;
    }
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
    if (parsed?.pullRequest) {
      state = { ...state, pullRequest: parsed.pullRequest };
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
