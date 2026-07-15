/**
 * CommitOrchestrator — single-writer for sequential step state commits (B-13 / B-14).
 *
 * Design D1 (execution-ownership-model ADR):
 *   - StepExecutor (producer) runs the agent/CLI step and returns a StepExecutionResult value.
 *   - CommitOrchestrator (committer) is the sole owner of state persistence, history recording,
 *     transition application, and event emission for sequential steps.
 *
 * This separation ensures:
 *   - B-13: StepExecutor never calls store mutation APIs directly.
 *   - B-14: StepHalt application (transitionJob / attachStateAndRethrow) happens only here.
 *
 * Parallel round commits also flow through this orchestrator via commitRound (B-13 parallel extension).
 */

import * as path from "node:path";
import type { Step, AgentStep } from "./types.js";
import type { JobState, Verdict, ModelUsage, StepRun, ErrorInfo, HistoryEntry } from "../../state/schema.js";
import type { ReviewerStatus } from "../../kernel/reviewer-snapshot.js";
import type { PipelineDeps, StoreFactory } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import type { JobStateStore } from "../../store/job-state-store.js";
import type { LineageRecord } from "../../store/event-journal.js";
import type { CompletionReportDiagnostic } from "../port/agent-runner.js";
import type { PermissionScope } from "../pipeline/types.js";
import type { StepCompletion } from "./step-completion.js";
import type { StepHalt } from "./step-halt.js";
import { pushStepResult } from "../../state/helpers.js";
import { appendHistoryEntry } from "../../state/schema.js";
import {
  recordFailedStepResult,
  attachStateAndRethrow,
} from "./executor-helpers.js";
import { transitionJob } from "../../state/lifecycle.js";
import { appendInvocation } from "../usage/store.js";
import { usageJsonPath } from "../../util/paths.js";
import { getBranchPrefix } from "../../config/type-config.js";
import { logVerbose } from "../../logger/stdout.js";

// ---------------------------------------------------------------------------
// StepExecutionResult discriminated union
// ---------------------------------------------------------------------------

/**
 * StepExecutionResult: the value returned by the StepExecutor producer methods.
 *
 * - "success": step completed successfully; CommitOrchestrator applies StepCompletion.
 * - "halt": step hit a guard condition; CommitOrchestrator applies the StepHalt and throws.
 * - "skipped": step was skipped due to activation conditions; CommitOrchestrator records skip.
 *
 * Naming: "StepExecutionResult" avoids collision with the existing "StepOutcome" type
 * (used in StepRun.outcome) and "StepCompletion" (verdict derivation result).
 */
export type StepExecutionResult =
  | {
      kind: "success";
      completion: StepCompletion;
      completedAt: string;
      startedAt: string;
      session: { id: string; agentId: string; environmentId: string } | null;
      agentBranch?: string;
      modelUsage?: Record<string, ModelUsage>;
      followUpAttempts?: number;
      transientRetryAttempts?: number;
      completionReportDiagnostics?: CompletionReportDiagnostic[];
      /** Added-turn metrics by type. Only populated by ClaudeCodeRunner. */
      addedTurns?: { reportRetry: number; postWork: number; outputRepair: number };
    }
  | { kind: "halt"; halt: StepHalt }
  | { kind: "skipped"; skipReason: string };

// ---------------------------------------------------------------------------
// Pure projectors (module-level, non-exported)
// ---------------------------------------------------------------------------

/**
 * Pure in-memory projection for a successful step result: applies pushStepResult.
 * The {step}-verdict history entry is applied separately by the caller via
 * verdictHistoryEntry() — durably (store.appendHistory) in the sequential path,
 * in-memory (appendHistoryEntry) in the round path.
 * No store calls, no side effects.
 */
function projectSuccess(
  state: JobState,
  step: Step,
  result: StepExecutionResult & { kind: "success" },
  findingsPath: string | null,
): JobState {
  const { completion, completedAt, startedAt, session, followUpAttempts, transientRetryAttempts, completionReportDiagnostics, addedTurns } = result;
  const { verdict, persistToolResult } = completion;

  return pushStepResult(state, step.name, {
    session,
    verdict: verdict as Verdict | null,
    findingsPath,
    completedAt,
    startedAt,
    error: null,
    toolResult: persistToolResult,
    followUpAttempts: followUpAttempts ?? 0,
    transientRetryAttempts,
    completionReportDiagnostics,
    addedTurns,
  });
}

/** Pure builder for the {step}-verdict history entry (shared by sequential + round). */
function verdictHistoryEntry(step: Step, verdict: Verdict | null, now: string): HistoryEntry {
  return {
    ts: now,
    step: `${step.name}-verdict`,
    status: "ok",
    message: `${step.name} verdict: ${verdict}`,
  };
}

/**
 * Pure in-memory projection for a skipped step result: applies pushStepResult(verdict:"skipped").
 * The {step}-skipped history entry is applied separately by the caller via skipHistoryEntry()
 * — durably (store.appendHistory) in the sequential path, in-memory in the round path.
 * No store calls, no side effects.
 */
function projectSkip(
  state: JobState,
  step: AgentStep,
  skipReason: string,
  startedAt: string,
  now: string,
): JobState {
  return pushStepResult(state, step.name, {
    session: null,
    verdict: "skipped" as Verdict,
    findingsPath: null,
    completedAt: now,
    startedAt,
    error: null,
    skipReason,
  });
}

/** Pure builder for the {step}-skipped history entry (shared by sequential + round). */
function skipHistoryEntry(step: Step | AgentStep, skipReason: string, now: string): HistoryEntry {
  return {
    ts: now,
    step: `${step.name}-skipped`,
    status: "warning",
    message: `${step.name} skipped: ${skipReason}`,
  };
}

// ---------------------------------------------------------------------------
// CommitOrchestrator
// ---------------------------------------------------------------------------

/**
 * CommitOrchestrator is the single-writer for sequential step state commits.
 *
 * Methods:
 *   begin(step, state)             — record step start in state (before producer runs).
 *   commitSuccess(step, state, deps, result) — apply success result to state and persist.
 *   commitSkipped(step, state, skipReason)   — record skip and persist.
 *   commitHalt(step, state, halt)            — apply halt, persist, and throw.
 *   apply(step, state, deps, result)         — dispatch to the appropriate commit method.
 */
export class CommitOrchestrator {
  private storeCache: JobStateStore | undefined;
  private storeCacheJobId: string | undefined;

  constructor(
    private readonly storeFactory: StoreFactory,
    private readonly events: EventBus,
    /** Optional permission scope (unused currently; reserved for R6 parallel round). */
    private readonly _permissionScope?: PermissionScope,
  ) {}

  /** Get or create a cached JobStateStore for the given jobId. */
  private getStore(jobId: string): JobStateStore {
    if (!this.storeCache || this.storeCacheJobId !== jobId) {
      this.storeCache = this.storeFactory(jobId);
      this.storeCacheJobId = jobId;
    }
    return this.storeCache;
  }

  /**
   * Apply best-effort post-persist effects for a successful step result.
   * Shared by commitSuccess (sequential) and commitRound (parallel round post-persist loop).
   * Sequence: usage appendInvocation → lineage appendLineage → verdict:parsed emit.
   * Each of usage and lineage is individually wrapped in try/catch (best-effort).
   */
  private async applySuccessPostPersistEffects(
    store: JobStateStore,
    state: JobState,
    step: Step,
    result: StepExecutionResult & { kind: "success" },
    deps: PipelineDeps,
  ): Promise<void> {
    const { completion, completedAt, modelUsage, followUpAttempts } = result;
    const { verdict, persistToolResult } = completion;

    // usage (appendInvocation — best-effort)
    if (modelUsage && deps.cwd && deps.slug) {
      const usageAbsPath = path.join(deps.cwd, usageJsonPath(deps.slug));
      try {
        await appendInvocation(usageAbsPath, {
          command: "job",
          timestamp: completedAt,
          modelUsage,
          jobId: state.jobId,
          stepName: step.name,
        });
      } catch {
        // Best-effort: usage append failure must not block step completion
      }
    }

    // lineage (appendLineage — best-effort)
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

    // verdict:parsed emit (after persist — state is committed before handlers react)
    this.events.emit("verdict:parsed", {
      step: step.name,
      outcome: {
        verdict,
        toolResult: persistToolResult,
        followUpAttempts: followUpAttempts ?? 0,
      },
    });
  }

  /**
   * Record step start: update state.step and append a start history entry.
   * Called before the producer runs the agent/CLI step.
   * Matches the per-step begin behavior of the original runAgentStep / runCliStep.
   *
   * Agent step: `{step}-started` / status "started" / "Starting {step} step"
   * CLI step:   "step-transition" / status "ok" / "Transitioning to {step} step"
   */
  async begin(step: Step, state: JobState): Promise<JobState> {
    const store = this.getStore(state.jobId);
    let s = await store.update(state, { step: step.name });

    if (step.kind === "agent") {
      s = await store.appendHistory(s, {
        ts: new Date().toISOString(),
        step: `${step.name}-started`,
        status: "started",
        message: `Starting ${step.name} step`,
      });
    } else {
      s = await store.appendHistory(s, {
        ts: new Date().toISOString(),
        step: "step-transition",
        status: "ok",
        message: `Transitioning to ${step.name} step`,
      });
    }

    return s;
  }

  /**
   * Apply a successful step result to state and persist.
   * Sequence: projectSuccess → store.appendHistory({step}-verdict) → branch/pullRequest
   *           → store.persist → applySuccessPostPersistEffects (usage + lineage + verdict:parsed emit).
   */
  async commitSuccess(
    step: Step,
    state: JobState,
    deps: PipelineDeps,
    result: StepExecutionResult & { kind: "success" },
  ): Promise<JobState> {
    const store = this.getStore(state.jobId);
    const findingsPath = step.resultFilePath(state, deps);
    const now = new Date().toISOString();
    const { agentBranch, completion } = result;
    const { verdict } = completion;

    logVerbose("step", "verdict parsed", { step: step.name, verdict });

    // In-memory projection: pushStepResult
    let s = projectSuccess(state, step, result, findingsPath);

    // Durably record {step}-verdict history (write 1)
    s = await store.appendHistory(s, verdictHistoryEntry(step, verdict as Verdict | null, now));

    // Branch setting (agent-branch or setsBranch flag)
    if (agentBranch && !s.branch) {
      s = { ...s, branch: agentBranch };
    }
    if ("setsBranch" in step && (step as { setsBranch?: boolean }).setsBranch === true && !s.branch) {
      const prefix = getBranchPrefix(deps.request.type);
      s = { ...s, branch: `${prefix}${deps.slug}-${s.jobId.slice(0, 8)}` };
    }

    // pullRequest reflection
    if (completion.pullRequest) {
      s = { ...s, pullRequest: completion.pullRequest };
    }

    // Persist branch/pullRequest patch (write 2)
    await store.persist(s);

    // Post-persist effects: usage + lineage + verdict:parsed emit
    await this.applySuccessPostPersistEffects(store, s, step, result, deps);

    return s;
  }

  /**
   * Record a skipped step (activation conditions not met) and persist.
   * Sequence: projectSkip → store.appendHistory({step}-skipped) → verdict:parsed emit → persist.
   */
  async commitSkipped(
    step: AgentStep,
    state: JobState,
    skipReason: string,
  ): Promise<JobState> {
    const store = this.getStore(state.jobId);
    const now = new Date().toISOString();

    // In-memory projection: pushStepResult(verdict:"skipped")
    let s = projectSkip(state, step, skipReason, now, now);

    // Durably record {step}-skipped history (matches sequential appendHistory semantics)
    s = await store.appendHistory(s, skipHistoryEntry(step, skipReason, now));

    // Emit before final persist (sequential emit-before-persist order)
    this.events.emit("verdict:parsed", {
      step: step.name,
      outcome: {
        verdict: "skipped",
        toolResult: null,
        followUpAttempts: 0,
      },
    });

    await store.persist(s);
    return s;
  }

  /**
   * Apply a halt to state, persist, and throw.
   * Always throws — return type is Promise<never>.
   *
   * Sequence (mirrors current executor guard apply blocks):
   *   recordFailedStepResult → (failed: store.fail | awaiting-resume: transitionJob + appendInterruption)
   *   → history (if halt.history set) → store.persist → attachStateAndRethrow
   */
  async commitHalt(step: Step, state: JobState, halt: StepHalt): Promise<never> {
    const store = this.getStore(state.jobId);

    let s = recordFailedStepResult(state, step.name, halt.error, halt.recordOpts ?? {});

    if (halt.kind === "failed") {
      s = await store.fail(s, halt.error, step.name);
    } else {
      // awaiting-resume
      const { state: resumeState } = transitionJob(s, "awaiting-resume", {
        trigger: "executor",
        reason: halt.resumePoint.reason,
        patch: {
          resumePoint: halt.resumePoint,
          ...(halt.statePatch?.mainCheckoutDrift
            ? { mainCheckoutDrift: halt.statePatch.mainCheckoutDrift }
            : {}),
          error: halt.error,
        },
      });
      s = resumeState;
      await store.appendInterruption({
        ...halt.interruption,
        ts: new Date().toISOString(),
      });
    }

    if (halt.history) {
      s = await store.appendHistory(s, {
        ts: new Date().toISOString(),
        ...halt.history,
      });
    }

    await store.persist(s);
    attachStateAndRethrow(halt.thrownErr, s);
  }

  /**
   * Commit all member results and coordinator patch in a single atomic persist.
   * Called by ParallelReviewRound after all members have run via produceResult
   * (i.e. without persisting state individually).
   *
   * D1 (execution-ownership-model ADR, parallel round): coordinator is the sole
   * writer for parallel round state. This method is the single persist boundary.
   *
   * Sequence:
   *   1. Fold each member result into state in-memory (no store calls).
   *      Success: appendHistoryEntry({step}-started) → projectSuccess → appendHistoryEntry(verdictHistoryEntry).
   *      Skip:    appendHistoryEntry({step}-started) → projectSkip → appendHistoryEntry(skipHistoryEntry).
   *      Halt:    recordFailedStepResult + halt.history (in-memory only).
   *   2. Apply coordinator patch: reviewerStatuses, coordinator StepRun, error, updatedAt.
   *   3. store.persist(state) — exactly once.
   *   4. Best-effort post-persist: applySuccessPostPersistEffects per success member
   *      + verdict:parsed emit per skipped member.
   *
   * member halt: recordFailedStepResult only (records StepRun error in-memory).
   *   store.fail / transitionJob are NOT called — job lifecycle (failed transition)
   *   is handled by the pipeline after observing the escalation coordinator verdict.
   *
   * members: [] (fast path — all previously approved) is valid; only coordinator
   * patch + single persist occurs.
   *
   * @param params.coordinatorName   - Name of the coordinator step.
   * @param params.base              - Job state before member execution.
   * @param params.deps              - Pipeline dependencies (used for usage/lineage paths).
   * @param params.members           - Fan-out results in pending order.
   * @param params.reviewerStatuses  - Updated reviewer status records for the round.
   * @param params.coordinatorRun    - Synthetic coordinator StepRun to append.
   * @param params.roundError        - Error to set on state (null clears previous error).
   */
  async commitRound(params: {
    coordinatorName: string;
    base: JobState;
    deps: PipelineDeps;
    members: ReadonlyArray<{ step: Step; startedAt: string; result: StepExecutionResult }>;
    reviewerStatuses: ReviewerStatus[];
    coordinatorRun: StepRun;
    roundError: ErrorInfo | null;
  }): Promise<JobState> {
    const { coordinatorName, base, deps, members, reviewerStatuses, coordinatorRun, roundError } = params;
    const store = this.getStore(base.jobId);
    const now = new Date().toISOString();

    // Track success member entries for best-effort post-persist work
    const successEntries: Array<{ step: Step; result: StepExecutionResult & { kind: "success" } }> = [];
    const skippedEntries: Array<{ step: Step; result: StepExecutionResult & { kind: "skipped" } }> = [];

    // --- 1. Fold members in-memory (no store calls) ---
    let state = base;

    for (const { step, startedAt, result } of members) {
      if (result.kind === "success") {
        const findingsPath = step.resultFilePath(base, deps);

        // Round-only: {step}-started history (sequential path uses begin() instead)
        state = appendHistoryEntry(state, {
          ts: startedAt,
          step: `${step.name}-started`,
          status: "started",
          message: `Starting ${step.name} step`,
        });

        // Shared projector: pushStepResult
        state = projectSuccess(state, step, result, findingsPath);
        // {step}-verdict history (in-memory; round batches into a single persist)
        state = appendHistoryEntry(state, verdictHistoryEntry(step, result.completion.verdict as Verdict | null, now));

        successEntries.push({ step, result });
      } else if (result.kind === "skipped") {
        // Round-only: {step}-started history (sequential path uses begin() instead)
        state = appendHistoryEntry(state, {
          ts: startedAt,
          step: `${step.name}-started`,
          status: "started",
          message: `Starting ${step.name} step`,
        });

        // Shared projector: pushStepResult(skipped)
        state = projectSkip(state, step as AgentStep, result.skipReason, startedAt, now);
        // {step}-skipped history (in-memory; round batches into a single persist)
        state = appendHistoryEntry(state, skipHistoryEntry(step, result.skipReason, now));

        skippedEntries.push({ step, result });
      } else {
        // halt — recordFailedStepResult only (no store.fail / transitionJob)
        state = recordFailedStepResult(state, step.name, result.halt.error, result.halt.recordOpts ?? {});

        // history from halt.history (in-memory append)
        if (result.halt.history) {
          state = appendHistoryEntry(state, {
            ts: now,
            ...result.halt.history,
          });
        }
      }
    }

    // --- 2. Apply coordinator patch ---
    const coordinatorRuns = state.steps?.[coordinatorName] ?? [];
    state = {
      ...state,
      reviewerStatuses,
      steps: {
        ...(state.steps ?? {}),
        [coordinatorName]: [...coordinatorRuns, coordinatorRun],
      },
      error: roundError,
      updatedAt: new Date().toISOString(),
    };

    // --- 3. Persist exactly once ---
    await store.persist(state);

    // --- 4. Best-effort post-persist: usage + lineage + verdict:parsed ---
    for (const { step, result } of successEntries) {
      await this.applySuccessPostPersistEffects(store, state, step, result, deps);
    }

    // verdict:parsed for skipped members (skipped entries have no usage or lineage)
    for (const { step } of skippedEntries) {
      this.events.emit("verdict:parsed", {
        step: step.name,
        outcome: { verdict: "skipped", toolResult: null, followUpAttempts: 0 },
      });
    }

    return state;
  }

  /**
   * Dispatch to commitSuccess / commitSkipped / commitHalt based on result.kind.
   * halt path always throws; success / skipped path returns the updated state.
   */
  async apply(
    step: Step,
    state: JobState,
    deps: PipelineDeps,
    result: StepExecutionResult,
  ): Promise<JobState> {
    if (result.kind === "success") {
      return this.commitSuccess(step, state, deps, result);
    }
    if (result.kind === "skipped") {
      return this.commitSkipped(step as AgentStep, state, result.skipReason);
    }
    // kind === "halt" — always throws
    return this.commitHalt(step, state, result.halt);
  }
}
