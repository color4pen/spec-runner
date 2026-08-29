# Cross-boundary invariants review: exclusion-aware-publish-prediction

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Date**: 2026-08-29

<!-- verdict は CLI が typed findings から導出するため、この file には記載しない。 -->

## Evidence summary

| Boundary | Invariant checked | Result |
|---|---|---|
| guarded commit → ordinary scoped commit | excluded dirt is ignored by residual enforcement | Preserved by pre-filtering `postStatus.paths` |
| worktree prediction → unpushed commits | exclusion applies only to worktree paths | Preserved by filtering before commit-derived paths are added |
| Layer 1 → Layer 2 | the same resolved exclusion patterns reach both checks | Preserved for ordinary step execution |
| custom-review fan-out → coordinator git-effects inspection | pre-existing excluded dirt must not become a round-owned undeclared write | Broken (F-001) |
| halt → resume reconcile | excluded untracked dirt must survive while the worktree exists | Broken for exclusions inside the change folder (F-002) |
| protected canon enforcement → staging exclusion | exclusions must not bypass protected-canon checks | Preserved: guarded checks the full set; scoped staged-canon check remains unfiltered |
| design/review/conformance prompt construction | one delivery scope is communicated to agents | Preserved at the inspected prompt call sites |

## Findings

### F-001 [HIGH] Parallel review halts on excluded dirt before the exclusion-aware commit backstop runs

**File**: `src/core/pipeline/parallel-review-round.ts:397`  
**Resolution**: fixable

`ParallelReviewRound` feeds the complete result of `listWorktreeChanges()` to `partitionRoundChanges`. The unchanged partitioner classifies every path outside the reviewers' declared outputs and the small pipeline-managed allowlist as `offending`. The newly forwarded `excludeWorktreePatterns` is only consumed later by `commitRoundArtifacts`, and that call is unreachable when `offending` is non-empty.

Concrete execution sequence:

1. Configure `stagingExcludePatterns: ["vendor/**"]`.
2. A guarded implementer creates untracked `vendor/generated.js`; guarded staging correctly leaves it in the worktree and continues.
3. The pipeline enters a custom-review parallel round. Review members write only their declared result files.
4. Coordinator `listWorktreeChanges()` returns both the result files and the still-dirty `vendor/generated.js`.
5. `partitionRoundChanges` places `vendor/generated.js` in `offending` because it is neither declared nor in `pipelineManagedPaths`.
6. Lines 399-415 set `ROUND_NONDECLARED_CHANGE` and escalate the round. `commitRoundArtifacts` (where this change passes exclusion patterns) is never invoked.

This breaks the requested guarded → scoped review → PR completion story while the focused guarded/scoped commit tests remain green. Filter the coordinator inspection's changed-path input with the resolved staging exclusions before `partitionRoundChanges` (while retaining the existing independent protected-canon/write-scope guarantees), and cover the full coordinator path rather than only parameter propagation into `commitScopedPaths`.

### F-002 [HIGH] Resume reconcile deletes excluded untracked files when the configured pattern covers the change folder

**File**: `src/core/command/resume.ts:521`  
**Resolution**: fixable

Resume calls the unchanged `reconcileWorktreeArtifacts(slug, worktree, spawnFn)` without configuration. Its predicate treats every non-canon, non-managed path under `specrunner/changes/<slug>/` as interrupted residue and the reconcile core removes untracked matches with `git clean -f`. The new tests establish preservation only for `.github/**` and `vendor/**`, which happen to be outside the reconciler's fixed directory boundary; they do not establish the stated exclusion invariant.

Concrete execution sequence:

1. Configure `stagingExcludePatterns: ["specrunner/changes/exclusion-aware-publish-prediction/generated/**"]`.
2. A guarded step creates untracked `specrunner/changes/exclusion-aware-publish-prediction/generated/output.txt`; the new staging and residual logic correctly leaves it uncommitted in the worktree.
3. The job halts for an unrelated reason, then the operator resumes it with the same worktree.
4. Resume invokes `reconcileWorktreeArtifacts` without exclusion patterns.
5. `isReconcilableArtifact` returns true because the file is inside the change folder and is neither protected canon nor pipeline-managed.
6. Reconcile quarantines it and executes `git clean -f -- <path>`, destroying the worktree copy before the next step starts.

This violates the explicit contract that any matching untracked path survives halt/resume while the worktree exists. Pass the single resolved exclusion scope into reconcile (or an equivalent predicate) and exclude matching paths from quarantine/removal; add a test using an excluded non-canon path inside the change folder so the behavior is not accidentally proven only by directory placement.

## Unverified

- No dynamic test run was needed to establish either finding: both failures occur deterministically before the newly tested exclusion-aware seams.
- Managed runtime execution of Layer 1 remains unchanged and intentionally does not perform local git inspection; no new cross-boundary violation was identified there.
