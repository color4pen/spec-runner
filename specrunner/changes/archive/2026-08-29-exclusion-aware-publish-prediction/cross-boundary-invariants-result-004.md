# Cross-boundary invariants review: exclusion-aware-publish-prediction

**Reviewer**: cross-boundary-invariants  
**Iteration**: 4  
**Date**: 2026-08-29

<!-- verdict は CLI が typed findings から導出するため、この file には記載しない。 -->

## Evidence summary

| Boundary | Invariant checked | Result |
|---|---|---|
| worktree prediction → unpushed commits | exclusions affect worktree dirt but never already-committed paths | Preserved |
| Layer 1 → ordinary/round Layer 2 | the same resolved exclusions reach validation and both commit paths | Preserved |
| guarded output → scoped residual check | excluded ordinary dirt survives without halt or restore | Preserved |
| halt → resume reconcile | excluded artifacts survive while the worktree exists | Preserved |
| scoped/round write-scope → protected canon and undeclared judge artifacts | exclusions cannot hide either protected class | Preserved; iteration-3 F-001 is fixed |
| parallel member output → coordinator commit → next step | a declared reviewer result must be committed or otherwise cease being dirty before it becomes undeclared to the next step | Broken (F-001) |
| design/review/conformance prompt construction | resolved delivery exclusions are communicated consistently | Preserved |

## Findings

### F-001 [HIGH] Excluding a declared parallel-review result leaves it dirty, then the next step destroys it as an undeclared judge artifact

**File**: `src/core/pipeline/parallel-review-round.ts:415`  
**Resolution**: fixable

The iteration-3 fix correctly preserves undeclared judge artifacts from exclusion filtering, but it introduces a cross-step ownership transition that the unchanged write-scope code cannot tolerate. `findWriteScopeViolations(..., declared)` deliberately does not classify the current round's declared result as a violation. The code then applies exclusions to that path and removes it from `filteredPaths`, so `partitionRoundChanges` cannot put it in `toStage`. Once the round ends, the same dirty result is no longer declared by the next step; the corrected `commitAndPush` predicate then necessarily classifies it as an undeclared judge artifact and quarantines/restores it with `WRITE_SCOPE_VIOLATION`.

Concrete execution sequence:

1. Configure `stagingExcludePatterns: ["specrunner/changes/**"]` (the existing regression tests explicitly exercise this supported overlap).
2. A parallel custom-review member writes its declared result, for example `specrunner/changes/job/cross-boundary-invariants-result-001.md`.
3. At `parallel-review-round.ts:414`, `findWriteScopeViolations` omits that path because it is in the round's `declared` set.
4. At lines 415-419, `applyStagingExclusions` removes the result from `filteredPaths`; therefore `toStage` is empty for that result and `commitRoundArtifacts` does not commit it. The round nevertheless completes. The positive-control test at `parallel-review-round-git-effects.test.ts:1185` asserts only the approved outcome and does not assert the claimed `toStage` behavior; its line 1191 comment is contradicted by the filter order.
5. The following scoped step (for example conformance) sees the still-dirty `*-result-*.md`. It is not declared by conformance, so `commit-push.ts:595` now includes it in `potentialViolations`; lines 596-603 preserve it from exclusion, report `WRITE_SCOPE_VIOLATION`, and restore/delete the result. A guarded code-fixer takes the equivalent undeclared-judge-artifact halt path before guarded staging.

This breaks the pre-existing boundary invariant that a round member's declared evidence is committed by the coordinator before ownership moves to the next step. It also makes sequential code-review and parallel custom-review behavior inconsistent: the sequential scoped path still commits a declared result matching the same exclusion (as asserted at `commit-push-exclusion.test.ts:904-958`), while the parallel path strands it.

Keep declared round outputs eligible for `toStage` (as the current comment and sequential behavior assume), while applying exclusions only to non-declared, non-write-scope paths; alternatively define an explicit lifecycle for excluded declared evidence that removes the dirty file without causing the next step to treat it as tampering. Add a two-step regression test that runs a round producing an excluded declared result and then executes the next scoped/guarded write-scope check.

## Observations

None.

## Verification evidence

- `bunx vitest run src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts src/core/step/__tests__/commit-push-exclusion.test.ts`: 2 files, 52 tests passed. The passing positive-control tests demonstrate the coverage gap above; they do not execute the ownership transition into the following step.
- The GitHub Actions summary reporter emitted an `EROFS` warning after the run, but Vitest itself exited 0 and all selected tests passed.

## Unverified

- The full repository test/typecheck suite was not rerun in this review; the targeted boundary suites above were run.
