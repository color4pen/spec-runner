/**
 * ParallelReviewRound — coordinator fan-out for parallel custom reviewer execution.
 *
 * Design D3 / D4 / D5 / D6 / D8 (reviewer-parallel-execution): encapsulates
 * the fan-out logic that was previously inline in Pipeline.runCoordinatorFanOut.
 * Pipeline delegates to this component for all coordinator-node execution.
 */

import type { Step } from "../step/types.js";
import type { ParallelReviewConfig } from "./types.js";
import type { JobState, StepRun } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import { StepExecutor } from "../step/executor.js";
import { logPipelineDiag } from "../lifecycle/diagnostic.js";
import {
  deriveReviewerStatuses,
  selectPendingMembers,
  applyRoundResults,
  aggregateVerdict,
  computeInvalidations,
} from "./reviewer-status.js";

/**
 * Merge parallel reviewer result states into a base state.
 *
 * Design D3 (reviewer-parallel-execution): each parallel member execution returns a
 * state with its own `steps[member]` updated and history delta appended. This function
 * merges all member states into base by:
 * - Updating each known member's StepRun array from the result (always overwrite,
 *   since result was built on top of base and contains the full up-to-date array)
 * - Adding any other new step keys not present in base
 * - Appending each member's history delta (entries added since base.history.length)
 *   in completion order (allSettled returns in submission order)
 *
 * Member step keys must always be copied from results because on re-runs (coordinator
 * iteration 2+) the member key already exists in base from the prior round. The result
 * state's version supersedes the base's version for that member.
 *
 * @param base        - Base state before parallel execution.
 * @param results     - Array of fulfilled member result states (from allSettled).
 * @param memberNames - Names of the pending member steps that ran in this round.
 *   Their step arrays are always copied from results regardless of base content.
 */
function mergeParallelReviewerStates(
  base: JobState,
  results: JobState[],
  memberNames: string[],
): JobState {
  const memberSet = new Set(memberNames);
  const baseHistoryLen = base.history.length;
  let merged = base;

  for (const result of results) {
    // Merge each member's steps into the accumulated state
    const mergedSteps = { ...(merged.steps ?? {}) };
    for (const [key, runs] of Object.entries(result.steps ?? {})) {
      // Known member steps: always copy (result has the full updated array for this member,
      // even when the key already existed in base from a prior coordinator round).
      // Other keys: only copy if absent from base (preserve base steps unchanged).
      if (memberSet.has(key) || !(key in (base.steps ?? {}))) {
        mergedSteps[key] = runs;
      }
    }

    // Append history delta from this result (entries added since base)
    const historyDelta = result.history.slice(baseHistoryLen);

    merged = {
      ...merged,
      steps: mergedSteps,
      history: [...merged.history, ...historyDelta],
      updatedAt: result.updatedAt,
    };
  }

  return merged;
}

export class ParallelReviewRound {
  private readonly executor: StepExecutor;
  private readonly steps: Map<string, Step>;
  private readonly parallelReview: ParallelReviewConfig;

  constructor(params: {
    executor: StepExecutor;
    steps: Map<string, Step>;
    parallelReview: ParallelReviewConfig;
  }) {
    this.executor = params.executor;
    this.steps = params.steps;
    this.parallelReview = params.parallelReview;
  }

  /**
   * Coordinator fan-out: execute pending member steps in parallel and produce an
   * aggregate verdict as a synthetic coordinator StepRun.
   *
   * Design D3 / D4 / D5 / D6 / D8 (reviewer-parallel-execution):
   *
   * 1. Derive/init reviewer statuses from state.
   * 2. Compute invalidations: for each approved member, check if fixer touched
   *    their activation paths (listChangedFiles from approvedAtCommit to HEAD).
   * 3. Select pending members (approved/skipped are excluded → resume skip D8).
   * 4. If no pending → all approved → synthetic "approved" StepRun (fast path).
   * 5. Fan-out: execute each pending member step via Promise.allSettled.
   * 6. Merge results (mergeParallelReviewerStates).
   * 7. Update reviewerStatuses (applyRoundResults) + compute aggregate verdict.
   * 8. Push synthetic coordinator StepRun with aggregate verdict.
   * 9. Persist merged state authoritatively.
   *
   * NOTE: coordinator is NOT in the steps Map (it's a virtual node).
   * NOTE: --from coordinator is not supported for explicit resume (coordinator is
   * a virtual injected node, not in the standard step name list). ResumePoint-based
   * auto-resume works normally since it routes to code-fixer (the paired fixer).
   *
   * Managed runtime: listChangedFiles returns [] → invalidation not fired (fail-safe).
   * Parallel custom reviewer managed support is a known limitation (Non-Goal).
   *
   * @param coordinatorName - Coordinator step name.
   * @param state           - Current job state.
   * @param deps            - Pipeline dependencies.
   * @returns Aggregate verdict and updated state.
   */
  async run(
    coordinatorName: string,
    state: JobState,
    deps: PipelineDeps,
  ): Promise<{ outcome: "approved" | "needs-fix" | "escalation"; state: JobState }> {
    const parallelReview = this.parallelReview;
    const memberNames = [...parallelReview.members];
    const cwd = deps.cwd ?? process.cwd();
    const requestType = deps.request.type;

    // --- 1. Derive / initialize reviewer statuses ---
    const snapshots = (state.reviewers ?? []).filter((s) => memberNames.includes(s.name));
    let statuses = deriveReviewerStatuses(state, snapshots);

    // --- 2. Compute invalidations (approved members whose paths were touched by fixer) ---
    // Design D6: for each approved member, call listChangedFiles(approvedAtCommit, cwd, branch)
    // and evaluate whether the fixer touched their activation paths.
    // New seam NOT introduced — reuse existing RuntimeStrategy.listChangedFiles.
    // Managed runtime: listChangedFiles returns [] → invalidation not fired (fail-safe).
    // NOTE: parallel custom reviewer managed support is a known limitation (Non-Goal).
    if (deps.runtimeStrategy) {
      // Capture HEAD SHA once for the invalidatedByCommit field
      const currentHeadSha = await deps.runtimeStrategy.captureHeadSha(cwd) ?? new Date().toISOString();

      // Per-member invalidation: each approved member has its own approvedAtCommit
      const updatedStatuses = [...statuses];
      for (let i = 0; i < updatedStatuses.length; i++) {
        const s = updatedStatuses[i]!;
        if (s.status !== "approved" || !s.approvedAtCommit) continue;

        const touched = await deps.runtimeStrategy.listChangedFiles(
          s.approvedAtCommit,
          cwd,
          state.branch ?? null,
        );

        // computeInvalidations evaluates a single member's touched files against its activation paths
        // We compute per-member by passing a single-element statuses array
        const [invalidated] = computeInvalidations([s], touched, requestType, currentHeadSha);
        if (invalidated) updatedStatuses[i] = invalidated;
      }
      statuses = updatedStatuses;
    }

    // --- 3. Select pending members ---
    const pending = selectPendingMembers(statuses, memberNames);
    logPipelineDiag("pipeline:coordinator:pending", `coordinator=${coordinatorName}, pending=[${pending.join(",")}]`);

    // --- 4. All approved fast path ---
    const now = new Date().toISOString();
    let aggregateVerdictResult: "approved" | "needs-fix" | "escalation";

    if (pending.length === 0) {
      // All approved / skipped → synthetic approved, skip to gate
      logPipelineDiag("pipeline:coordinator:all-approved", `coordinator=${coordinatorName}`);
      aggregateVerdictResult = "approved";
    } else {
      // --- 5. Fan-out: execute each pending member step in parallel ---
      const memberResults = await Promise.allSettled(
        pending.map(async (name) => {
          const memberStep = this.steps.get(name);
          if (!memberStep) {
            throw new Error(`Member step not found in pipeline: ${name}`);
          }
          return this.executor.execute(memberStep, state, deps);
        }),
      );

      // --- 6. Merge results ---
      const fulfilledStates: JobState[] = [];
      const memberVerdicts = new Map<string, string>();
      // Capture HEAD SHA after all members have committed (for approvedAtCommit)
      const headSha = deps.runtimeStrategy
        ? (await deps.runtimeStrategy.captureHeadSha(cwd)) ?? now
        : now;

      for (let i = 0; i < pending.length; i++) {
        const name = pending[i]!;
        const result = memberResults[i]!;

        if (result.status === "fulfilled") {
          fulfilledStates.push(result.value);
          const memberRuns = result.value.steps?.[name] ?? [];
          const lastRun = memberRuns[memberRuns.length - 1];
          memberVerdicts.set(name, lastRun?.outcome.verdict ?? "escalation");
        } else {
          // Rejected: extract state from attached error if available
          const errWithState = result.reason as { state?: JobState };
          if (errWithState.state) {
            fulfilledStates.push(errWithState.state);
          }
          memberVerdicts.set(name, "escalation");
        }
      }

      // Merge all fulfilled states (including error states) into base.
      // Pass `pending` so mergeParallelReviewerStates always copies member step arrays
      // (needed for re-runs where the member key already exists in base from prior rounds).
      state = mergeParallelReviewerStates(state, fulfilledStates, pending);

      // --- 7. Apply round results and compute aggregate ---
      statuses = applyRoundResults(statuses, memberVerdicts, headSha);
      aggregateVerdictResult = aggregateVerdict([...memberVerdicts.values()]);
    }

    // --- 8. Push synthetic coordinator StepRun ---
    const coordinatorRuns = state.steps?.[coordinatorName] ?? [];
    const syntheticRun: StepRun = {
      attempt: coordinatorRuns.length + 1,
      sessionId: null,
      outcome: {
        verdict: aggregateVerdictResult,
        findingsPath: null,
        error: null,
      },
      startedAt: now,
      endedAt: new Date().toISOString(),
    };

    state = {
      ...state,
      reviewerStatuses: statuses,
      steps: {
        ...(state.steps ?? {}),
        [coordinatorName]: [...coordinatorRuns, syntheticRun],
      },
      updatedAt: new Date().toISOString(),
    };

    // --- 9. Persist merged state authoritatively ---
    const store = deps.storeFactory(state.jobId);
    await store.persist(state);

    return { outcome: aggregateVerdictResult, state };
  }
}
