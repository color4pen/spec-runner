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
import { quarantineRoundHeadAdvanceEvidence } from "../step/commit-push.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import type { StepExecutionResult } from "../step/commit-orchestrator.js";
import { CommitOrchestrator } from "../step/commit-orchestrator.js";
import { StepExecutor } from "../step/executor.js";
import { defaultSpawnFn, gitExecResult } from "../../util/git-exec.js";
import { logPipelineDiag } from "../lifecycle/diagnostic.js";
import {
  deriveReviewerStatuses,
  selectPendingMembers,
  applyRoundResults,
  aggregateVerdict,
  computeInvalidations,
  computeCanonHash,
  verdictOfResult,
} from "./reviewer-status.js";
import { partitionRoundChanges, excludePipelineManagedChangePaths } from "./round-git-scope.js";
import { canonicalDocPaths } from "../../util/paths.js";

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

    // --- 1b. Compute currentCanonHash for canonical doc binding (T-05) ---
    // Compute once per round: hash of canonical docs (request.md / spec.md / design.md /
    // tasks.md / test-cases.md) under specrunner/changes/<slug>/. Used by selectPendingMembers
    // and applyRoundResults to detect changes to design documents between rounds.
    // undefined = digestArtifacts not available (managed runtime / legacy caller) → no canon check.
    // null = digestArtifacts returned all-null hashes (files missing) → fail-closed.
    let currentCanonHash: string | null | undefined = undefined;
    if (deps.runtimeStrategy?.digestArtifacts) {
      const canonRefs = await deps.runtimeStrategy.digestArtifacts(
        canonicalDocPaths(deps.slug).map((p) => ({ path: p })),
        cwd,
        state.branch ?? null,
      );
      currentCanonHash = computeCanonHash(canonRefs);
    }

    // --- 2. Compute invalidations (approved members whose paths were touched by fixer) ---
    // Design D6: for each approved member, call listChangedFiles(approvedAtCommit, cwd, branch)
    // and evaluate whether the fixer touched their activation paths.
    // New seam NOT introduced — reuse existing RuntimeStrategy.listChangedFiles.
    // Managed runtime: listChangedFiles returns [] → invalidation not fired (fail-safe).
    // NOTE: parallel custom reviewer managed support is a known limitation (Non-Goal).
    //
    // T-04 (approval-revision-binding): baselineCommit is the raw captureHeadSha result with
    // no timestamp fallback. null → revision check disabled in selectPendingMembers (managed
    // fail-safe). currentHeadSha retains the timestamp fallback for invalidatedByCommit only.
    let baselineCommit: string | null = null;
    if (deps.runtimeStrategy) {
      // baselineCommit: nullable raw SHA — used for revision binding (T-04).
      // currentHeadSha: with timestamp fallback — used for invalidatedByCommit field only.
      baselineCommit = await deps.runtimeStrategy.captureHeadSha(cwd);
      const currentHeadSha = baselineCommit ?? new Date().toISOString();

      // Per-member invalidation: each approved member has its own approvedAtCommit
      const updatedStatuses = [...statuses];
      for (let i = 0; i < updatedStatuses.length; i++) {
        const s = updatedStatuses[i]!;
        if (s.status !== "approved" || !s.approvedAtCommit) continue;

        const result = await deps.runtimeStrategy.listChangedFiles(
          s.approvedAtCommit,
          cwd,
          state.branch ?? null,
        );

        // Behavior preservation: unavailable (managed runtime, local transient failure) is
        // treated as empty (no-signal). This keeps managed invalidation non-firing (Non-Goal).
        // managed runtime: canDeriveChangedFiles()=false → unavailable → empty → invalidation
        // not fired. This is intentional fail-safe behavior for managed, not a bug.
        const touched = result.kind === "success" ? result.files : [];

        // Exclude pipeline-managed change folder paths (specrunner/changes/<slug>/...) from
        // the invalidation diff, but PRESERVE canonical documents (request.md / spec.md / design.md /
        // tasks.md / test-cases.md). This ensures:
        //   - Reviewer's own findings commit does not spuriously invalidate it (existing goal).
        //   - Changes to canonical docs appear in sourceTouched → trigger reviewer re-run.
        // Replaces old excludeChangeFolderPaths (which excluded ALL change folder paths).
        // Destruction confirmation (TC-047): reverting to excludeChangeFolderPaths causes
        // TC-005/TC-016 to fail (canonical docs excluded → canonical change not detected).
        const sourceTouched = excludePipelineManagedChangePaths(touched);

        // Canon-binding guard (T-05): when sourceTouched is empty AND canon binding is active
        // (currentCanonHash !== undefined), skip computeInvalidations entirely and only re-anchor.
        // Rationale: when no source-level files changed (sourceTouched=[]), canonical doc changes
        // (if any) are detected by selectPendingMembers via the currentCanonHash comparison, NOT
        // by computeInvalidations (which only checks activation paths against touched files).
        // Without this guard, always-activate reviewers (activationPaths=undefined) would be
        // spuriously invalidated by computeInvalidations even when no source files changed and
        // canonical docs are unchanged (TC-002, TC-044 would fail).
        //
        // When currentCanonHash=undefined (no digestArtifacts — legacy path, Req 4 tests):
        //   guard does NOT fire → computeInvalidations runs as before → always-activate
        //   reviewers are still invalidated for any fixer run (backward compat preserved).
        if (sourceTouched.length === 0 && currentCanonHash !== undefined) {
          // No source-level changes. Re-anchor approvedAtCommit to current baseline when possible
          // so the next round's revision check passes without re-running.
          // canonHash is preserved (spread from s) — only approvedAtCommit is updated.
          if (result.kind === "success" && baselineCommit !== null) {
            updatedStatuses[i] = { ...s, approvedAtCommit: baselineCommit };
          }
          // result unavailable → no re-anchor (fail-closed); status stays with old approvedAtCommit.
          continue;
        }

        // computeInvalidations evaluates a single member's touched files against its activation paths.
        // We compute per-member by passing a single-element statuses array.
        const [invalidated] = computeInvalidations([s], sourceTouched, requestType, currentHeadSha);
        if (invalidated) {
          // T-04 re-anchor: when listChangedFiles returned positive evidence (kind === "success")
          // and the member was NOT invalidated (stays approved), update approvedAtCommit to the
          // current baseline. This keeps the revision binding valid for the next round without
          // requiring a fresh re-approval run.
          // evidence unavailable (result.kind !== "success") → no re-anchor (fail-closed).
          if (result.kind === "success" && invalidated.status === "approved" && baselineCommit !== null) {
            updatedStatuses[i] = { ...invalidated, approvedAtCommit: baselineCommit };
          } else {
            updatedStatuses[i] = invalidated;
          }
        }
      }
      statuses = updatedStatuses;
    }

    // --- 3. Select pending members ---
    // T-04: pass baselineCommit for revision binding. null → disable revision check (managed).
    // T-05: pass currentCanonHash for canon-hash binding. undefined → no canon check (legacy/managed).
    const pending = selectPendingMembers(statuses, memberNames, baselineCommit, currentCanonHash);
    logPipelineDiag("pipeline:coordinator:pending", `coordinator=${coordinatorName}, pending=[${pending.join(",")}]`);

    // --- 4. All approved fast path ---
    const now = new Date().toISOString();
    let aggregateVerdictResult: "approved" | "needs-fix" | "escalation" = "escalation";
    // Member results for commitRound (empty for fast path)
    const members: Array<{ step: Step; startedAt: string; result: StepExecutionResult }> = [];
    // Round error (set when git effects detect non-declared changes)
    let roundError: ErrorInfo | null = null;
    // Round commit OID for synthesizedCommits ledger (T-08, D4); null when no commit was made.
    let roundCommitOid: string | null = null;

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

      // --- 5b. HEAD guard: detect reviewer self-commit (D3 / T-07) ---
      // Compare HEAD against baselineCommit immediately after fan-out.
      // If HEAD advanced, a reviewer self-committed during the round:
      //   quarantine the diff, reset HEAD to baselineCommit, halt the round.
      // inspectionEscalated: declared here so HEAD guard and git-effects check share it.
      let inspectionEscalated = false;
      if (deps.runtimeStrategy) {
        const headAfterFanOut = await deps.runtimeStrategy.captureHeadSha(cwd);
        if (headAfterFanOut !== null && baselineCommit !== null && headAfterFanOut !== baselineCommit) {
          aggregateVerdictResult = "escalation";
          inspectionEscalated = true;
          const guardSpawnFn = deps.gitTransportSpawn ?? defaultSpawnFn;
          // Best-effort quarantine via commit-push (node:fs lives there, not here).
          await quarantineRoundHeadAdvanceEvidence(
            guardSpawnFn,
            cwd,
            deps.slug,
            baselineCommit,
            headAfterFanOut,
          );
          // D3 / D5: reset --mixed failure → fail-closed halt (do NOT continue with stale HEAD).
          // If the reset fails, HEAD remains at the reviewer's commit — any subsequent push
          // would publish the unauthorized reviewer commit. Throw to prevent that path.
          const resetResult = await gitExecResult(guardSpawnFn, cwd, ["reset", "--mixed", baselineCommit]);
          if (!resetResult.ok || resetResult.exitCode !== 0) {
            throw new SpecRunnerError(
              ERROR_CODES.COMMIT_AND_PUSH_FAILED,
              "Check for index.lock conflicts, disk issues, or worktree corruption. Retry with specrunner job resume to continue.",
              `HEAD guard: git reset --mixed ${baselineCommit} failed on branch '${state.branch ?? ""}': exit ${resetResult.exitCode}`,
            );
          }
          roundError = {
            code: "ROUND_HEAD_ADVANCED",
            message: `Reviewer self-committed: HEAD advanced from ${baselineCommit} to ${headAfterFanOut}`,
            hint: "A reviewer committed changes during the round. The commit has been removed. Investigate which reviewer self-committed.",
          };
          logPipelineDiag(
            "pipeline:coordinator:head-guard-halt",
            `coordinator=${coordinatorName}, base=${baselineCommit}, head=${headAfterFanOut}`,
          );
        }
      }

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
      // Skip if HEAD guard (step 5b) already set escalation — aggregateVerdictResult
      // must remain "escalation" and not be overwritten by member verdicts.
      if (!inspectionEscalated) {
        aggregateVerdictResult = aggregateVerdict([...memberVerdicts.values()]);
      }

      // --- 7a. Detect all-members-skipped (round-all-skip-pass-through) ---
      // When all members return "skipped", the round is a structural skip.
      // aggregateVerdict returns "approved" for all-skip (gate pass-through, not escalation).
      // We track allMembersSkipped separately to suppress applyRoundResults (D3 guard):
      //   Suppress applyRoundResults: keep members PENDING (not "skipped") so the next round
      //   re-evaluates them with fresh conditions. "skipped" would become a permanent free-pass,
      //   bypassing the fan-out on resume (requirement 5).
      // roundError is NOT set for all-skip — structural skip is green (approved).
      //
      // Destruction confirmation (TC-009 gate): removing this flag causes members to be set to
      // "skipped", permanently excluding them from future rounds (free-pass violation).
      const allMembersSkipped =
        memberVerdicts.size > 0 && [...memberVerdicts.values()].every((v) => v === "skipped");

      // --- 7b. Round-owned git effects: detect non-declared changes, then stage+commit ---
      // D3 (round-owned-git-effects): after all members have run (without committing),
      // the coordinator checks what changed in the worktree and compares against the
      // declared outputs union. Undeclared changes (excluding pipeline-managed paths) halt
      // the round; declared changes are committed via scoped staging.
      // roundError is passed to commitRound (not applied to state directly).
      // inspectionEscalated: declared at step 5b (HEAD guard) so HEAD guard and this
      // git-effects check share the same flag. Already true if HEAD guard fired.
      // roundCommitOid is declared above (outer scope) for use in commitRound call.
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
          // First error wins: when the HEAD guard (5b) already set ROUND_HEAD_ADVANCED,
          // that is the root cause and must not be overwritten by this consequence.
          roundError = roundError ?? {
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
            // First error wins: after the HEAD guard (5b) fires, the mixed reset leaves the
            // reviewer's committed changes in the worktree, so this branch is reached with the
            // same root cause. ROUND_HEAD_ADVANCED must survive as the recorded error — the
            // offending paths here are a consequence of the reset, not an independent cause.
            roundError = roundError ?? {
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
            // Wrap in try-catch: if push fails AFTER the commit is created, HEAD has already
            // advanced. We capture the OID regardless so synthesizedCommits stays consistent
            // on resume and EGRESS_UNKNOWN_COMMIT deadlock is prevented. (regression-gate finding)
            let commitArtifactError: unknown = null;
            try {
              await deps.runtimeStrategy.commitRoundArtifacts?.(
                toStage,
                cwd,
                branch,
                coordinatorName,
                deps.slug,
                infra,
                // D4 backstop: pass egress params so LocalRuntime can verify publish range.
                { synthesizedCommits: state.synthesizedCommits ?? [] },
              );
            } catch (err) {
              commitArtifactError = err;
            }
            // Capture round commit OID for synthesizedCommits ledger (T-08, D4).
            // Captured even on push failure: commit may already exist locally.
            roundCommitOid = deps.runtimeStrategy
              ? ((await deps.runtimeStrategy.captureHeadSha(cwd)) ?? null)
              : null;
            if (commitArtifactError !== null) {
              // Push failed (or commit failed) — record as escalation so commitRound still
              // persists the OID, preventing EGRESS_UNKNOWN_COMMIT on the next resume attempt.
              aggregateVerdictResult = "escalation";
              inspectionEscalated = true;
              roundError = roundError ?? {
                code: "ROUND_COMMIT_PUSH_FAILED",
                message: `Round artifact push failed: ${commitArtifactError instanceof Error ? commitArtifactError.message : String(commitArtifactError)}`,
                hint: "The round commit was created locally but push failed. Resolve the push issue and resume — the commit OID has been recorded in synthesizedCommits to prevent egress deadlock.",
              };
            }
          }
          // toStage empty and no offending → nothing changed in declared paths; no-op.
        }
      }
      // listWorktreeChanges absent (test fake without the method) → skip detection + commit.

      // --- 7c. Apply member results (fail-closed) ---
      // Apply approved/skipped member statuses ONLY if the round was not halted by a
      // fail-closed inspection escalation AND all members did not skip.
      //
      // inspectionEscalated: git effects inspection found issues → members stay pending
      //   for resume so the fan-out re-runs and re-inspects (ROUND_NONDECLARED_CHANGE bypass fix).
      //
      // allMembersSkipped: all members returned "skipped" → structural skip (approved, green).
      //   Members stay PENDING (not "skipped") so the next round re-evaluates them with fresh
      //   conditions. "skipped" status would become a permanent free-pass, bypassing the fan-out.
      //   roundError is NOT set — structural skip is not an error (round-all-skip-pass-through).
      //
      // Destruction confirmation (TC-009 gate): removing the allMembersSkipped guard causes TC-009 to
      // fail (members would be set to "skipped" instead of staying "pending", creating free-pass).
      if (!inspectionEscalated && !allMembersSkipped) {
        statuses = applyRoundResults(statuses, memberVerdicts, headSha, currentCanonHash);
      }
      // All-skip structural skip: diagnostic log for observability only (D-journal).
      // roundError is NOT set — structural skip is green (approved, gate pass-through).
      // per-member skip evidence is in members[] → journal via commitRound.
      if (allMembersSkipped && !inspectionEscalated) {
        logPipelineDiag(
          "pipeline:coordinator:all-members-skipped",
          `coordinator=${coordinatorName}, members=[${[...memberVerdicts.keys()].join(",")}]`,
        );
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
    // roundCommitOid (T-08): OID of the round's synthesized commit, appended to the
    // synthesizedCommits ledger inside commitRound before persist.
    state = await orchestrator.commitRound({
      coordinatorName,
      base: state,
      deps,
      members,
      reviewerStatuses: statuses,
      coordinatorRun: syntheticRun,
      roundError,
      roundCommitOid,
    });

    return { outcome: aggregateVerdictResult, state };
  }
}
