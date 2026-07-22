# Regression Gate Result — Iteration 002

**Branch**: change/custom-reviewer-canon-binding-65199b12
**Date**: 2026-07-22

## Evidence

All 5 findings from the Iteration 001 review were verified as fixed.

---

### Finding 1 — [LOW] excludeChangeFolderPaths に @deprecated 注釈がない
**File**: src/core/pipeline/round-git-scope.ts:17–24
**Status**: Fixed

`@deprecated Use \`excludePipelineManagedChangePaths\` instead.` annotation is present at line 17. The JSDoc block (lines 17–24) explicitly explains the hazard: using this function in the invalidation path excludes canonical docs from `sourceTouched`, silently bypassing canon-binding invalidation, and references TC-005 / TC-016 as the regression path.

---

### Finding 2 — [LOW] state.error の 'sticky' 挙動がスキーマ層にドキュメント化されていない
**File**: src/state/helpers.ts:117–126
**Status**: Fixed

`NOTE (state.error sticky semantics)` comment is present at lines 117–126 in `pushStepResult`. The note explains that `state.error` is NOT automatically cleared on step success (spread semantics), that pipeline.ts relies on this sticky behavior for `ROUND_ALL_MEMBERS_SKIPPED` detection, and that callers needing to clear it must spread `{ error: null }` explicitly.

---

### Finding 3 — [MEDIUM] excludeChangeFolderPaths still exported alongside replacement — latent misuse path
**File**: src/core/pipeline/round-git-scope.ts:17–24
**Status**: Fixed

The `@deprecated` annotation now carries the full misuse hazard explanation: the function excludes ALL paths under the change folder including canonical documents, using it in the production invalidation path renders the D5 invalidation-diff path inoperable for canon-binding, and the function is retained only for test backward compatibility. The annotation directly names `excludePipelineManagedChangePaths` as the replacement.

---

### Finding 4 — [MEDIUM] Req 4 test description — old invariant "always invalidated even with empty sourceTouched" no longer holds in real runtime
**File**: src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts:403–470 (legacy path), 485–539 (real-runtime path)
**Status**: Fixed

Two changes observed:
1. The legacy-path describe block (lines 403–418) is now titled "always-activate reviewer is re-run in legacy path without digestArtifacts" with an accurate inline comment explaining that the guard does not fire when `digestArtifacts` is absent, so `computeInvalidations` runs and the always-activate reviewer IS re-run.
2. A new "real-runtime path" describe block (lines 485–539) covers `digestArtifacts` present + pipeline-output-only diff → `sourceTouched=[]` → guard fires → re-anchor → `selectPendingMembers` skips → executor NOT called. The previously missing test case for `always-activate + real runtime + findings-only listChangedFiles → executor NOT called` is now present and asserts `wasCalled() === false`.

---

### Finding 5 — [MEDIUM] Req 2a test description — "change-folder-path-only diff does not invalidate" only true for pipeline outputs, not canonical docs
**File**: src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts:248–257
**Status**: Fixed

The describe block title has been updated to "pipeline-output-only diff does not invalidate broad-activation reviewer (T-04 Req 2a)". The accompanying comment (lines 248–255) now explicitly distinguishes pipeline outputs (excluded → not activated) from canonical documents (preserved by `excludePipelineManagedChangePaths` → activated → re-run), and cross-references TC-005 / TC-016 as the enforcement tests. The test continues to use `alpha-result-001.md` (a pipeline output), which is the correct fixture for this scenario.
