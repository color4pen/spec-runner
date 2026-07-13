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
 * Parallel round commits (R6) will reuse this orchestrator in a future request.
 */

import * as path from "node:path";
import type { Step, AgentStep } from "./types.js";
import type { JobState, Verdict, ModelUsage } from "../../state/schema.js";
import type { PipelineDeps, StoreFactory } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import type { JobStateStore } from "../../store/job-state-store.js";
import type { LineageRecord } from "../../store/event-journal.js";
import type { CompletionReportDiagnostic } from "../port/agent-runner.js";
import type { PermissionScope } from "../pipeline/types.js";
import type { StepCompletion } from "./step-completion.js";
import type { StepHalt } from "./step-halt.js";
import { pushStepResult } from "../../state/helpers.js";
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
    }
  | { kind: "halt"; halt: StepHalt }
  | { kind: "skipped"; skipReason: string };

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
   * Mirrors finalizeStep (:628-741) side-effect sequence:
   *   pushStepResult → {step}-verdict history → branch → pullRequest →
   *   usage → store.persist → lineage → verdict:parsed emit
   */
  async commitSuccess(
    step: Step,
    state: JobState,
    deps: PipelineDeps,
    result: StepExecutionResult & { kind: "success" },
  ): Promise<JobState> {
    const store = this.getStore(state.jobId);
    const findingsPath = step.resultFilePath(state, deps);
    const {
      completion,
      completedAt,
      startedAt,
      session,
      agentBranch,
      modelUsage,
      followUpAttempts,
      transientRetryAttempts,
      completionReportDiagnostics,
    } = result;
    const { verdict, persistToolResult } = completion;

    logVerbose("step", "verdict parsed", { step: step.name, verdict });

    // pushStepResult
    let s = pushStepResult(state, step.name, {
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
    });

    // {step}-verdict history
    s = await store.appendHistory(s, {
      ts: new Date().toISOString(),
      step: `${step.name}-verdict`,
      status: "ok",
      message: `${step.name} verdict: ${verdict}`,
    });

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

    // T-10: Append per-step usage to changes/<slug>/usage.json (best-effort)
    if (modelUsage && deps.cwd && deps.slug) {
      const usageAbsPath = path.join(deps.cwd, usageJsonPath(deps.slug));
      try {
        await appendInvocation(usageAbsPath, {
          command: "job",
          timestamp: completedAt,
          modelUsage,
          jobId: s.jobId,
          stepName: step.name,
        });
      } catch {
        // Best-effort: usage append failure must not block step completion
      }
    }

    // Persist state
    await store.persist(s);

    // D1/D5 (artifact-observability): record lineage (best-effort)
    if (deps.runtimeStrategy && step.writes && deps.cwd) {
      try {
        const cwd = deps.cwd;
        const writes = step.writes(s, deps);
        if (writes.length > 0) {
          const reads = step.reads ? step.reads(s, deps) : [];
          const [outputRefs, inputRefs] = await Promise.all([
            deps.runtimeStrategy.digestArtifacts(writes.map((r) => ({ path: r.path })), cwd, s.branch ?? null),
            deps.runtimeStrategy.digestArtifacts(reads.map((r) => ({ path: r.path })), cwd, s.branch ?? null),
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

    return s;
  }

  /**
   * Record a skipped step (activation conditions not met) and persist.
   * Mirrors finalizeSkippedStep (:518-554):
   *   pushStepResult(verdict:"skipped") → {step}-skipped warning → verdict:parsed emit → persist
   */
  async commitSkipped(
    step: AgentStep,
    state: JobState,
    skipReason: string,
  ): Promise<JobState> {
    const store = this.getStore(state.jobId);
    const now = new Date().toISOString();

    let s = pushStepResult(state, step.name, {
      session: null,
      verdict: "skipped" as Verdict,
      findingsPath: null,
      completedAt: now,
      startedAt: now,
      error: null,
      skipReason,
    });

    s = await store.appendHistory(s, {
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
