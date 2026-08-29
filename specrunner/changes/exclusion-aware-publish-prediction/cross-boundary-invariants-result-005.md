# Cross-boundary invariants review: exclusion-aware-publish-prediction

**Reviewer**: cross-boundary-invariants  
**Iteration**: 5  
**Date**: 2026-08-29

<!-- verdict は CLI が typed findings から導出するため、この file には記載しない。 -->

## Evidence summary

| Boundary | Invariant checked | Result |
|---|---|---|
| worktree prediction → unpushed commits | exclusions affect worktree dirt but never already-committed paths | Preserved |
| Layer 1 → ordinary/round Layer 2 | the same resolved exclusions reach validation and both commit paths | Preserved |
| guarded output → scoped residual check | excluded ordinary dirt survives without halt or restore | Preserved |
| scoped residual → protected canon/judge evidence | exclusions cannot hide protected canon or undeclared judge artifacts | Preserved |
| halt → resume reconcile | excluded artifacts survive while the worktree exists, after the separate canon gate has run | Preserved |
| parallel member output → coordinator commit → next step | declared reviewer evidence is committed before ownership transfers | Preserved; iteration-4 F-001 is fixed |
| parallel round inspection → write-scope enforcement | ordinary excluded dirt is ignored, while undeclared canon/judge changes still halt | Preserved |
| design/review/conformance prompt construction | resolved delivery exclusions are communicated consistently | Preserved |

## Findings

None.

## Observations

None.

## Boundary reconstruction

The iteration-4 failure is resolved in the current file contents. In a parallel review round whose declared result also matches `stagingExcludePatterns`, `parallel-review-round.ts` now puts every declared path into the exclusion-bypass set. The path therefore reaches `partitionRoundChanges`, enters `toStage`, and is passed to `commitRoundArtifacts`. It no longer remains dirty across the ownership transition into the following step, so unchanged `isJudgeArtifact` enforcement cannot reinterpret and destroy it as undeclared evidence.

The same inspection path keeps the operator-adjudicated protection ordering: `findWriteScopeViolations` identifies undeclared protected canon and judge artifacts before ordinary exclusion filtering. Such paths reach `partitionRoundChanges` and halt as `ROUND_NONDECLARED_CHANGE`; only non-declared ordinary dirt matching an exclusion is omitted and left intact.

For ordinary scoped commits, `commit-push.ts` applies the equivalent ordering before `findScopedCommitViolations`. Protected canon and undeclared judge artifacts bypass exclusions and remain violations, while excluded ordinary dirt never enters the restore set. Layer 1, ordinary Layer 2, and round Layer 2 all pass the resolved patterns only to the worktree component of `collectPublishablePaths`; the unchanged unpushed-commit enumeration runs afterward and can re-add the same path, preserving the invariant that an already-created commit is judged by what push will actually publish.

Resume preserves excluded residue only in the general reconcile phase. The pre-existing dirty-canon gate runs earlier and retains authority over partial canonical output, so passing exclusions into `reconcileWorktreeArtifacts` does not create a route around canon recovery policy.

## Verification evidence

- `git diff main...HEAD --stat` reviewed: 41 files changed, including the iteration-5 parallel-round fix and regression tests.
- Read `design.md`, `tasks.md`, the reviewer definition, the current implementations around all affected boundaries, and iteration-4 evidence.
- Targeted Vitest run: 5 files, 92 tests passed:
  - `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts`
  - `src/core/step/__tests__/commit-push-exclusion.test.ts`
  - `src/core/resume/__tests__/reconcile-worktree-exclusion.test.ts`
  - `src/core/step/__tests__/exclusion-aware-validation.test.ts`
  - `src/git/__tests__/push-capability.test.ts`
- The GitHub Actions summary reporter emitted an `EROFS` warning after the run, but Vitest exited 0 and all selected tests passed.

## Unverified

- The full repository test/typecheck suite was not rerun in this review; the change folder's verification evidence records the broader green run, and this review reran the five boundary-focused suites above.
