/**
 * ParallelReviewRound — coordinator fan-out for parallel custom reviewer execution.
 *
 * Design D3 / D4 / D5 / D6 / D8 (reviewer-parallel-execution): encapsulates
 * the fan-out logic that was previously inline in Pipeline.runCoordinatorFanOut.
 * Pipeline delegates to this component for all coordinator-node execution.
 */

import type { Step } from "../step/types.js";
import type { ParallelReviewConfig } from "./types.js";
import type { JobState, StepRun, ErrorInfo } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import type { CommitPushInfra } from "../step/commit-push.js";
import type { StepExecutionResult } from "../step/commit-orchestrator.js";
import { CommitOrchestrator } from "../step/commit-orchestrator.js";
import { StepExecutor } from "../step/executor.js";
import { defaultSpawnFn } from "../../util/git-exec.js";
import { logPipelineDiag } from "../lifecycle/diagnostic.js";
import {
  deriveReviewerStatuses,
  selectPendingMembers,
  applyRoundResults,
  aggregateVerdict,
  computeInvalidations,
  verdictOfResult,
} from "./reviewer-status.js";
import { partitionRoundChanges } from "./round-git-scope.js";

export class ParallelReviewRound {
  private readonly executor: StepExecutor;
  private readonly steps: Map<string, Step>;
  private readonly parallelReview: ParallelReviewConfig;
  private readonly events: EventBus;

  constructor(params: {
    executor: StepExecutor;
    steps: Map<string, Step>;
    parallelReview: ParallelReviewConfig;
    events: EventBus;
  }) {
    this.executor = params.executor;
    this.steps = params.steps;
    this.parallelReview = params.parallelReview;
    this.events = params.events;
  }

  /**
   * Coordinator fan-out: execute pending member steps in parallel and produce an
   * aggregate verdict as a synthetic coordinator StepRun.
   *
   * Design D1/D3/D4/D5/D6/D8 (round-owned-state-commit / reviewer-parallel-execution):
   *
   * 1. Derive/init reviewer statuses from state.
   * 2. Compute invalidations: for each approved member, check if fixer touched
   *    their activation paths (listChangedFiles from approvedAtCommit to HEAD).
   * 3. Select pending members (approved/skipped are excluded → resume skip D8).
   * 4. If no pending → all approved → synthetic "approved" coordinator StepRun (fast path).
   * 5. Fan-out: execute each pending member via executor.produceResult (no persist).
   * 6. Derive per-member verdicts from StepExecutionResult via verdictOfResult (T-01).
   * 7. Update reviewerStatuses (applyRoundResults) + compute aggregate verdict.
   * 7b. Round-owned git effects: detect non-declared changes, then stage+commit.
   * 8. Build synthetic coordinator StepRun with aggregate verdict.
   * 9. commitRound: coordinator persists all member results + coordinator patch in one write.
   *
   * State commit ownership (D1): CommitOrchestrator.commitRound is the single writer.
   * Members do not persist state (produceResult, not execute). Round boundary is atomic.
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
   * @param state           - Current job state (base; not mutated during fan-out).
   * @param deps            - Pipeline dependencies.
   * @returns Aggregate verdict and updated state (post-commitRound).
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

    // D4: coordinator constructs its own CommitOrchestrator for single-writer round commit.
    // Pipeline / executor constructors are not changed.
    const orchestrator = new CommitOrchestrator(deps.storeFactory, this.events);

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
    // Member results for commitRound (empty for fast path)
    const members: Array<{ step: Step; startedAt: string; result: StepExecutionResult }> = [];
    // Round error (set when git effects detect non-declared changes)
    let roundError: ErrorInfo | null = null;

    if (pending.length === 0) {
      // All approved / skipped → synthetic approved, skip to gate
      logPipelineDiag("pipeline:coordinator:all-approved", `coordinator=${coordinatorName}`);
      aggregateVerdictResult = "approved";
      // members stays []
    } else {
      // --- 5. Fan-out: execute each pending member via produceResult (no persist) ---
      // D4: construct a per-round readonly execution input from the received deps.
      // This shallow clone is what all members receive; the shared orchestration
      // deps object is never mutated in-place (B-16).
      //
      // D3 (round-owned-git-effects): roundOwnsGitEffects=true skips finalizeStepArtifacts
      // (git stage/commit/push) in the executor. Coordinator owns all git effects via
      // commitRoundArtifacts after the fan-out.
      const roundDeps: PipelineDeps = { ...deps, roundOwnsGitEffects: true };

      // Compute declared output union from pending members BEFORE fan-out
      // (base state is used so all members see the same pre-round state).
      const declaredSet = new Set<string>();
      for (const name of pending) {
        const memberStep = this.steps.get(name);
        const writes = memberStep?.writes?.(state, roundDeps) ?? [];
        for (const ref of writes) declaredSet.add(ref.path);
      }
      const declared = [...declaredSet];

      // Capture per-member startedAt before allSettled (used for history entries in commitRound)
      const memberStartTimes = new Map<string, string>();

      const memberResults = await Promise.allSettled(
        pending.map(async (name) => {
          const memberStep = this.steps.get(name);
          if (!memberStep) {
            throw new Error(`Member step not found in pipeline: ${name}`);
          }
          memberStartTimes.set(name, new Date().toISOString());
          // produceResult: run the member without persisting state (D1 / T-02)
          return this.executor.produceResult(memberStep, state, roundDeps);
        }),
      );

      // --- 6. Derive per-member verdicts (no state merge needed) ---
      // Capture HEAD SHA after all members have run (for approvedAtCommit).
      // Under roundOwnsGitEffects, members do not commit, so HEAD should not have
      // advanced — but we capture it here for consistency with the non-round path.
      const headSha = deps.runtimeStrategy
        ? (await deps.runtimeStrategy.captureHeadSha(cwd)) ?? now
        : now;

      const memberVerdicts = new Map<string, string>();

      for (let i = 0; i < pending.length; i++) {
        const name = pending[i]!;
        const result = memberResults[i]!;
        const memberStep = this.steps.get(name);
        const startedAt = memberStartTimes.get(name) ?? now;

        if (result.status === "fulfilled") {
          // verdictOfResult: pure derivation from StepExecutionResult (T-01)
          memberVerdicts.set(name, verdictOfResult(result.value));
          if (memberStep) {
            members.push({ step: memberStep, startedAt, result: result.value });
          }
        } else {
          // produceResult normalizes all throws to halt, so rejection is only possible
          // if the step was not found (pre-produceResult throw). Treat as escalation.
          memberVerdicts.set(name, "escalation");
        }
      }

      // --- 7. Compute aggregate verdict from member results ---
      // Member statuses are applied AFTER git-effects inspection (step 7c) so that a
      // fail-closed inspection escalation leaves members pending rather than approved.
      aggregateVerdictResult = aggregateVerdict([...memberVerdicts.values()]);

      // --- 7b. Round-owned git effects: detect non-declared changes, then stage+commit ---
      // D3 (round-owned-git-effects): after all members have run (without committing),
      // the coordinator checks what changed in the worktree and compares against the
      // declared outputs union. Undeclared changes (excluding pipeline-managed paths) halt
      // the round; declared changes are committed via scoped staging.
      // roundError is passed to commitRound (not applied to state directly).
      // inspectionEscalated: true when the round is halted by a fail-closed inspection
      // outcome (git status unavailable, or undeclared changes). Consumed at step 7c to
      // keep members pending so resume re-runs the fan-out and re-inspects.
      let inspectionEscalated = false;
      if (deps.runtimeStrategy?.listWorktreeChanges) {
        const branch = state.branch ?? "";
        const defaultSleepFn = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
        const infra: CommitPushInfra = {
          spawnFn: deps.gitTransportSpawn ?? defaultSpawnFn,
          sleepFn: deps.sleepFn ?? defaultSleepFn,
          events: this.events,
        };

        const inspection = await deps.runtimeStrategy.listWorktreeChanges(cwd);

        if (inspection.kind === "unavailable") {
          // Worktree inspection failed — fail-closed: do not approve an uninspected worktree.
          aggregateVerdictResult = "escalation";
          inspectionEscalated = true;
          roundError = {
            code: "ROUND_INSPECTION_UNAVAILABLE",
            message: `Worktree inspection unavailable: ${inspection.reason}`,
            hint: "Check that git is available in the worktree and that the working directory is a valid git repository. Retry the round after resolving the git issue.",
          };
          logPipelineDiag(
            "pipeline:coordinator:round-halt",
            `coordinator=${coordinatorName}, reason=${inspection.reason}`,
          );
        } else {
          // inspection.kind === "success"
          const { toStage, offending } = partitionRoundChanges({ changed: inspection.paths, declared, slug: deps.slug });

          if (offending.length > 0) {
            // Non-declared changes detected — halt the entire round.
            aggregateVerdictResult = "escalation";
            inspectionEscalated = true;
            roundError = {
              code: "ROUND_NONDECLARED_CHANGE",
              message: `Round produced undeclared file changes: ${offending.join(", ")}`,
              hint: "Inspect the worktree to identify the source of the non-declared changes and fix the member step's writes() declaration.",
            };
            logPipelineDiag(
              "pipeline:coordinator:round-halt",
              `coordinator=${coordinatorName}, offending=[${offending.join(",")}]`,
            );
          } else if (toStage.length > 0) {
            // All changes are within declared outputs — scoped stage + commit + push.
            await deps.runtimeStrategy.commitRoundArtifacts?.(
              toStage,
              cwd,
              branch,
              coordinatorName,
              deps.slug,
              infra,
            );
          }
          // toStage empty and no offending → nothing changed in declared paths; no-op.
        }
      }
      // listWorktreeChanges absent (test fake without the method) → skip detection + commit.

      // --- 7c. Apply member results (fail-closed) ---
      // Apply approved/skipped member statuses ONLY if the round was not halted by a
      // fail-closed inspection escalation. On inspection escalation, members stay pending
      // (as selected at step 3) so resume re-runs the fan-out and re-inspects — a round
      // must never finalize approved without a successful worktree inspection. This also
      // closes the resume bypass for ROUND_NONDECLARED_CHANGE.
      if (!inspectionEscalated) {
        statuses = applyRoundResults(statuses, memberVerdicts, headSha);
      }
    }

    // --- 8. Build synthetic coordinator StepRun ---
    // Built after git operations so that the verdict reflects the final outcome.
    // Uses base state for coordinator runs count (members did not modify coordinator).
    const coordinatorRuns = state.steps?.[coordinatorName] ?? [];
    const syntheticRun: StepRun = {
      attempt: coordinatorRuns.length + 1,
      sessionId: null,
      outcome: {
        verdict: aggregateVerdictResult,
        findingsPath: null,
        error: aggregateVerdictResult === "escalation" ? roundError : null,
      },
      startedAt: now,
      endedAt: new Date().toISOString(),
    };

    // --- 9. Commit round: single atomic persist via CommitOrchestrator ---
    // D1 (round-owned-state-commit): coordinator is the sole writer for this round.
    // All member results + coordinator patch are applied in-memory and persisted once.
    state = await orchestrator.commitRound({
      coordinatorName,
      base: state,
      deps,
      members,
      reviewerStatuses: statuses,
      coordinatorRun: syntheticRun,
      roundError,
    });

    return { outcome: aggregateVerdictResult, state };
  }
}
