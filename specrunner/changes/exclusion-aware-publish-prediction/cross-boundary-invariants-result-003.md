# Cross-boundary invariants review: exclusion-aware-publish-prediction

**Reviewer**: cross-boundary-invariants  
**Iteration**: 3  
**Date**: 2026-08-29

<!-- verdict は CLI が typed findings から導出するため、この file には記載しない。 -->

## Evidence summary

| Boundary | Invariant checked | Result |
|---|---|---|
| worktree prediction → unpushed commits | exclusions affect worktree dirt but never already-committed paths | Preserved |
| Layer 1 → both Layer 2 call paths | the same resolved exclusions reach validation, ordinary commits, and review-round commits | Preserved |
| guarded commit → scoped residual check | excluded non-canon dirt remains harmless and is not restored | Preserved |
| halt → resume reconcile | excluded untracked artifacts survive while the worktree exists | Preserved |
| scoped write-scope → protected canon | exclusions cannot hide undeclared canonical documents | Preserved; iteration-2 F-001 is fixed for canonical documents |
| scoped write-scope → judge artifacts | exclusions cannot hide undeclared review evidence | Broken (F-001) |
| parallel-review inspection → judge artifacts | exclusions cannot hide undeclared review evidence | Broken by the same incomplete protected-set projection (F-001) |
| design/review/conformance prompt construction | the resolved delivery scope is communicated consistently | Preserved |

## Findings

### F-001 [HIGH] Exclusion filtering still bypasses write-scope enforcement for undeclared judge artifacts

**File**: `src/core/step/commit-push.ts:589`  
**Resolution**: fixable

The iteration-2 fix correctly exempts `protectedCanonPaths(slug)` from exclusion filtering, but the unchanged write-scope invariant is broader than that list. `findWriteScopeViolations` also protects every undeclared `isJudgeArtifact` path (review result and `review-feedback-*` files). Because the new pre-filter preserves only `protectedCanonPaths`, an exclusion such as `specrunner/changes/job/**` removes a dirty prior-review result before `findScopedCommitViolations`; the adjacent `findWriteScopeViolations` still receives only `postStatus.stagedOnly`, so an unstaged judge artifact is invisible to both checks.

Concrete execution sequence:

1. Configure `stagingExcludePatterns: ["specrunner/changes/job/**"]`.
2. A scoped reviewer writes its declared current result and also modifies an undeclared prior result such as `review-feedback-001.md`.
3. Pathspec staging stages only the declared current result; the prior result remains unstaged.
4. The `canonSet` projection does not contain the prior result, and `applyStagingExclusions` removes it from `filteredResidualPaths`.
5. `postStatus.stagedOnly` also omits it, so `allViolations` is empty and the current result can be committed while downstream convergence/regression logic reads tampered review evidence.

`parallel-review-round.ts:407` repeats the same projection before `partitionRoundChanges`, so an excluded undeclared judge artifact is neither `offending` nor staged there either. This is a concrete cross-boundary integrity failure: adding delivery exclusions silently narrows the pre-existing protected write boundary defined by `findWriteScopeViolations`, even though staging exclusions are not allowed to bypass scope enforcement.

Preserve all paths protected by the existing write-scope predicate before applying exclusions—not only `protectedCanonPaths`. Apply the same rule in parallel-round inspection, and add regression tests using an undeclared `review-feedback-*.md` or `*-result-*.md` path matching the exclusion pattern in both flows.

## Observations

None.

## Unverified

- Full test/typecheck execution was not repeated for this review. The failing path follows from the disjoint inputs visible in the current implementation; existing new regression tests cover `spec.md` but not judge artifacts.
