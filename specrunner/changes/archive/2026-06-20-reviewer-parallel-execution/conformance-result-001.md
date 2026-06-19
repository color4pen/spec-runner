# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✅ | All 13 tasks (T-01〜T-13) checked [x]. All acceptance criteria per task addressed in implementation. |
| design.md | ✅ | D1〜D9 fully implemented. See detail below. |
| spec.md | ✅ | All 7 Requirements and 10 Scenarios implemented and covered by tests. |
| request.md | ✅ | All 9 acceptance criteria satisfied. typecheck && test green (406 files, 5479 tests). |

---

## Detail by Design Decision

### D1 — per-reviewer status in `JobState.reviewerStatuses`
`ReviewerStatus` interface defined in `src/kernel/reviewer-snapshot.ts` with `name / status / approvedAtCommit / activationPaths / invalidatedByCommit`. `JobState.reviewerStatuses?: ReviewerStatus[]` added to `src/state/schema.ts` with JSDoc noting state.json projection / event-journal threading 不要. `validateJobState` enforces: array when present, each entry has non-empty `name` and valid `status`. Absence is OK (backward compat).

### D2 — coordinator virtual node
`CUSTOM_REVIEWERS_STEP_NAME = "custom-reviewers"` and `ParallelReviewConfig` added to `src/core/pipeline/types.ts`. `PipelineDescriptor.parallelReview?` field wired. `composeReviewerDescriptor` returns `base` reference-identical when `snapshots` is empty (zero-overhead invariant). Coordinator not in steps Map; engine detects via `parallelReview`.

### D3 — parallel execution + commit mutex + state merge
`runCoordinatorFanOut` in `pipeline.ts` uses `Promise.allSettled` to fan-out pending members. `StepExecutor.commitMutex` (promise-chain FIFO) serializes `finalizeStepArtifacts` calls to prevent `index.lock` conflicts. `mergeParallelReviewerStates` pure function merges member step arrays and history deltas. Engine persists merged state once authoritatively.

### D4 — coordinator as loop step + synthetic StepRun
Coordinator registered in `loopNames`, `loopFixerPairs[coordinator]=code-fixer`, `maxIterationsByStep[coordinator]=max(member.maxIterations)`, `roles[coordinator]={role:"gate",phase:"impl"}`. Synthetic StepRun (verdict = aggregate, sessionId: null) pushed to `steps[coordinator]` after each round. `LOOP_ERROR_CODES["custom-reviewers"]` entry added. `resolveActiveReviewer` kept for standard path and exhaustion attribution.

### D5 — aggregate verdict + findings aggregation
`aggregateVerdict` in `reviewer-status.ts`: escalation > needs-fix > approved; skipped counts as approved. `collectParallelFixerFindings` in `findings-ledger.ts`: collects fixable findings from needs-fix members, deduped. `code-fixer.ts` `isCoordinatorLoopActive` detects composed-path coordinator loop and uses aggregated findings. `collectFindingsLedger` (regression-gate) unchanged (D9).

### D6 — invalidation via `approvedAtCommit` × `activationPaths`
`computeInvalidations` in `reviewer-status.ts` calls `evaluateActivation({paths: activationPaths}, {changedFiles, requestType})`; activated → pending + `invalidatedByCommit`. Engine calls `listChangedFiles(approvedAtCommit, cwd, branch)` per approved member in `runCoordinatorFanOut`. paths undefined (always-activate) → always invalidated. Managed runtime: `listChangedFiles` returns `[]` → path-constrained reviewers not invalidated (fail-safe). No new seam introduced.

### D7 — deterministic code-fixer routing predicates
Three predicates in `reviewer-chain.ts`: `conformanceFixInProgress`, `regressionGateActive`, `codeReviewLoopActive`. `buildParallelReviewerTransitions` generates priority-ordered `when`-guarded rows (conformance > regression-gate > code-review > coordinator). `resolveActiveReviewer` kept for standard path. Standard `buildReviewerChainTransitions` unchanged.

### D8 — resume skip via pending selection
`selectPendingMembers` excludes approved/skipped. `deriveReviewerStatuses` returns existing statuses unchanged if non-empty. No separate resume branch; coordinator entry re-derives pending members from persisted `reviewerStatuses`. Resume skip is a natural projection of status.

### D9 — regression-gate / findings ledger unchanged
`collectFindingsLedger` untouched. Coordinator name excluded from reviewer chain (chain uses member names). Regression-gate runs after coordinator returns `approved`. Transition: `coordinator approved → regression-gate`.

---

## Detail by Spec Requirement

### R1: per-reviewer status in state
`deriveReviewerStatuses` initializes all members pending when `reviewerStatuses` absent. `applyRoundResults` updates approved + `approvedAtCommit`. Scenario "approved reviewer の status が approvedAtCommit 付きで記録される": covered by `applyRoundResults` + TC-050/TC-051 assertions on `reviewerStatuses`. Scenario "reviewerStatuses 不在の state が pending で初期化される": covered by `deriveReviewerStatuses` (empty/absent → all pending) + `tests/schema.test.ts` TC-RS-01.

### R2: parallel review execution
`Promise.allSettled` fan-out verified in `runCoordinatorFanOut`. code-review converges first (separate transition row: `code-review approved → coordinator`). TC-041 verifies both members ran and approved. Parallelism mechanism validated in `executor-commit-mutex.test.ts` (2 concurrent executes → serialized finalize).

### R3: findings aggregation → 1 fixer session
`collectParallelFixerFindings` + `isCoordinatorLoopActive` in code-fixer. All-approved fast path: coordinator returns `approved` → `regression-gate` (fixer skipped). TC-044/TC-047 verify needs-fix → fixer cycle.

### R4: invalidation
`computeInvalidations` + `evaluateActivation`. activationPaths match → pending. activationPaths no-match → approved maintained. paths undefined → always pending. TC-051 verifies activation-path-based invalidation firing.

### R5: resume skip
`selectPendingMembers` excludes approved. Pre-populated `reviewerStatuses` (approved A + pending B) → A skipped, B runs. TC-050 verifies this scenario end-to-end.

### R6: regression-gate after all approved
Transition `coordinator approved → regression-gate` in `buildParallelReviewerTransitions`. `collectFindingsLedger` uses member names (not coordinator). TC-RG-01/TC-RG-02/TC-RG-03 cover gate behavior.

### R7: reviewer 0 backward compat
`composeReviewerDescriptor` returns `base` unchanged for empty snapshots. All 406 test files (including prior E2E) green.

---

## Observations (non-blocking)

1. **TC-041 test name** is "multiple reviewers run in declaration order" — a legacy name from before the parallel design. The test correctly verifies both reviewers ran and approved; the name is slightly misleading but harmless.

2. **always-activate invalidation in managed runtime** — `evaluateActivation` with `paths: undefined` returns `activated: true` regardless of `changedFiles`, so always-activate reviewers are still invalidated even when `listChangedFiles` returns `[]`. This is the correct and documented behavior (path-constrained reviewers get the fail-safe; always-activate reviewers do not, which is safe-side).

3. **`deriveReviewerStatuses` edge case** — If `reviewerStatuses = []` (empty array, e.g., job with no reviewers that somehow got the field), it re-initializes. Harmless given that coordinator only runs when `parallelReview` is set (i.e., snapshots non-empty).
