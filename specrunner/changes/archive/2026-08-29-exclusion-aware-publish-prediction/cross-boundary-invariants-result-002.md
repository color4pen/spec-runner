# Cross-boundary invariants review: exclusion-aware-publish-prediction

**Reviewer**: cross-boundary-invariants  
**Iteration**: 2  
**Date**: 2026-08-29

<!-- verdict は CLI が typed findings から導出するため、この file には記載しない。 -->

## Evidence summary

| Boundary | Invariant checked | Result |
|---|---|---|
| guarded commit → ordinary scoped commit | excluded non-canon dirt is ignored by residual enforcement | Preserved |
| worktree prediction → unpushed commits | exclusion applies only to worktree paths | Preserved |
| Layer 1 → Layer 2 | the same resolved exclusion patterns reach both checks | Preserved |
| custom-review fan-out → coordinator inspection | excluded non-canon dirt is neither staged nor classified as undeclared | Preserved; iteration-1 F-001 is fixed |
| halt → resume reconcile | excluded untracked dirt survives while the worktree exists, including inside the change folder | Preserved; iteration-1 F-002 is fixed |
| protected canon enforcement → scoped exclusion | exclusions must not bypass protected-canon checks | Broken (F-001) |
| protected canon enforcement → parallel-review exclusion | exclusions must not bypass protected-canon checks | Broken by the same ordering defect (F-001) |
| design/review/conformance prompt construction | one resolved delivery scope is communicated to agents | Preserved at the inspected call sites |

## Findings

### F-001 [HIGH] Scoped exclusion filters protected canon before the only check that can see unstaged changes

**File**: `src/core/step/commit-push.ts:584`  
**Resolution**: fixable

The scoped path now removes every exclusion match from `postStatus.paths` before `findScopedCommitViolations`. The adjacent protected-canon check receives only `postStatus.stagedOnly` at line 586. Because scoped staging adds only declared outputs, a forbidden canon modification that is excluded is normally unstaged: it is absent from both inputs and therefore bypasses write-scope enforcement. The comment claiming the unfiltered `stagedOnly` check prevents bypass relies on the unchanged but false assumption that every forbidden canon write is already staged.

Concrete execution sequence:

1. Configure `stagingExcludePatterns: ["specrunner/changes/job/spec.md"]`.
2. Run a scoped step whose declared output is its review result, not `spec.md`.
3. The agent modifies `specrunner/changes/job/spec.md` and writes its declared result.
4. Scoped `git add -A -- <declared outputs>` stages the result but leaves `spec.md` dirty and unstaged.
5. `applyStagingExclusions(postStatus.paths, ...)` removes `spec.md` before `findScopedCommitViolations`.
6. `findWriteScopeViolations(..., postStatus.stagedOnly, ...)` cannot see `spec.md`, so `allViolations` is empty; the result is committed and the pipeline continues while downstream steps can read the tampered canon.

The newly fixed parallel-review coordinator has the same boundary failure: `parallel-review-round.ts:401` filters the complete inspection before `partitionRoundChanges`, so the same excluded forbidden canon write is neither `offending` nor staged. This is a concrete violation of requirement 3 (protected-canon enforcement must run over all paths before exclusions), not merely a missing defense.

Keep exclusion filtering for ordinary residual dirt, but first run `findWriteScopeViolations` against the full changed-path set (or otherwise separate forbidden canon from exclusion-eligible residuals). Apply the same protected-canon-before-exclusion ordering to coordinator inspection. Add regression tests where an exclusion pattern exactly matches an undeclared protected canon path for both an ordinary scoped step and a parallel review round.

## Observations

None.

## Unverified

- Full test/typecheck execution was not required to establish F-001: the failing sequence follows directly from the disjoint `filteredResidualPaths` and `stagedOnly` inputs. Existing green tests do not cover an exclusion that matches a protected canon path in scoped or coordinator execution.
