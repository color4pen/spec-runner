# cross-boundary-invariants Review — custom-reviewer-canon-binding

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Scope**: `git diff main...HEAD` — 29 files, 4365 insertions, 47 deletions  

---

## Summary

The implementation correctly wires the two-layer defense (D5 `excludePipelineManagedChangePaths` + D4 canon hash check in `selectPendingMembers`) and the overall logic is sound. Four cross-boundary issues were identified. No blocker-level issue; two are medium-severity residue left by the old-function coexistence pattern.

---

## Findings

### F-001 · MEDIUM — `excludeChangeFolderPaths` still exported alongside replacement

**Location**: `src/core/pipeline/round-git-scope.ts` lines 37–41; `src/core/pipeline/__tests__/round-git-scope.test.ts` line 16  

**Observation**  
T-02 specifies "改称し" (rename), but the implementation adds `excludePipelineManagedChangePaths` without removing `excludeChangeFolderPaths`. Both are exported. `parallel-review-round.ts` correctly imports only the new function, but the old function remains as live exported API.

The old function's JSDoc still asserts the OLD philosophy:
> "findings files are also pipeline-managed from the perspective of source diff" → all change folder paths excluded.

The test file `round-git-scope.test.ts` imports and tests `excludeChangeFolderPaths` across ~15 test cases, validating a behavior that is no longer used in production.

**Cross-boundary risk**  
A future caller (or import autocomplete) can pick `excludeChangeFolderPaths` instead of `excludePipelineManagedChangePaths`. This bypasses the canonical-doc preservation that is the entire point of the change: the old function would exclude `design.md` from `sourceTouched`, rendering the D5 path of the canon-binding inoperable for `activationPaths`-based reviewers. The compiler would not catch the mistake because both functions have identical signatures `(files: string[]): string[]`.

The test suite reinforces the false impression by providing green signal for the old function's all-exclusion behavior.

**Invariant broken**: The implicit contract between `round-git-scope.ts` (exporting the canonical-doc-preserving filter) and `parallel-review-round.ts` (consuming it for invalidation diffs) is not enforced at the module boundary. Either function can be imported with no type-level error, but only one produces the correct invariant.

---

### F-002 · MEDIUM — `Req 2a`/`Req 4` test descriptions assert an invariant that no longer holds in real runtime

**Location**: `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` lines 248–251, 400–403, 429

**Observation**  
`Req 2a` (line 248–251):
```
// Req 2a: change-folder-path-only diff, broad-activation ["specrunner/changes/**"]
// After excludeChangeFolderPaths, sourceTouched is empty → not activated → NOT re-run.
```

`Req 4` (lines 400–403, 429):
```
// Req 4 (behavior preservation): always-activate reviewer (activationPaths undefined)
// is always invalidated, even when sourceTouched is empty after filtering.
// …
// Always-activate: even empty sourceTouched triggers invalidation → executor IS called
```

Both tests use a `runtimeStrategy` **without** `digestArtifacts`, so `currentCanonHash = undefined`. The canon-binding guard condition `sourceTouched.length === 0 && currentCanonHash !== undefined` evaluates to `false`, and `computeInvalidations` runs exactly as before → tests pass.

However, in **real runtime** (where `digestArtifacts` IS present):

**Req 4 scenario**: When `listChangedFiles` returns only a findings file, `sourceTouched = []` after filtering, `currentCanonHash !== undefined` → guard **fires**, `computeInvalidations` is **skipped**. The always-activate reviewer is NOT re-run (it is handled by `selectPendingMembers` canon check instead). The test description "is always invalidated, even when sourceTouched is empty" no longer holds.

**Req 2a scenario**: The test uses `CHANGE_FOLDER_PATH = "specrunner/changes/my-change/alpha-result-001.md"` (a findings file). The assertion "change-folder-path-only diff does not invalidate" is still true for pipeline output files. But the description omits the new semantic: if the diff contained a **canonical doc** (`design.md`, etc.) instead of a findings file, `excludePipelineManagedChangePaths` would PRESERVE it in `sourceTouched`, and a reviewer with `activationPaths = ["specrunner/changes/**"]` would be **activated and invalidated** via `computeInvalidations`. The old invariant ("all change-folder diffs do not invalidate path-constrained reviewers") is now untrue for canonical-doc-matching activation paths.

**Cross-boundary risk**  
A developer reading these tests to understand invariants of `ParallelReviewRound.run` would conclude:
1. Always-activate reviewers are "always" re-run → incorrect in real runtime for findings-only diffs.
2. Change-folder-path diffs never invalidate path-constrained reviewers → incorrect in real runtime when canonical docs match activation paths.

Neither assertion breaks a test today because both tests exercise the legacy path. However, if someone adds logic that relies on these (now-incorrect) invariants, the canon-binding guard becomes a latent source of behavioral divergence between test and production runtime.

A missing coverage gap: no test asserts "always-activate reviewer + real runtime (digestArtifacts) + listChangedFiles returns [findings_file] → executor NOT called". TC-002 covers the no-change case (`changedFiles = []`) but not the findings-file-only case.

---

### F-003 · INFO — Stale comment in invalidation test references old function name

**Location**: `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` lines 250, 342

```
// After excludeChangeFolderPaths, sourceTouched is empty → ...
// After excludeChangeFolderPaths, sourceTouched = ["src/foo.ts"] → ...
```

The actual production call (line 161 of `parallel-review-round.ts`) is `excludePipelineManagedChangePaths`. The stale function name in comments causes the reader to trace the wrong implementation when verifying the test's assumptions.

---

### F-004 · INFO — Dead `coordinator skipped → regression-gate` transition has contradictory comment

**Location**: `src/core/pipeline/reviewer-chain.ts` lines 438–444

```typescript
// skipped → regression-gate (skipped coordinator = all members skipped = treat as approved)
transitions.push({
  step: coordinator,
  on: "skipped",
  to: REGRESSION_GATE_STEP_NAME,
});
```

`ParallelReviewRound.run` returns `"approved" | "needs-fix" | "escalation"` — never `"skipped"`. The transition is unreachable dead code. More importantly, the comment says "treat as approved," which contradicts the new design (all-members-skipped → escalation, not approved). A reader comparing the comment to the `ROUND_ALL_MEMBERS_SKIPPED` transition immediately below it gets conflicting information about the intended semantics.

---

### F-005 · INFO — `state.error` sticky contract for ROUND_ALL_MEMBERS_SKIPPED is implicit

**Location**: `src/core/pipeline/pipeline.ts` line 396; `src/core/step/commit-orchestrator.ts` `commitRound`

The pipeline detects `state.error?.code === "ROUND_ALL_MEMBERS_SKIPPED"` at the `"end"` terminal after routing through regression-gate → conformance → pr-create. This relies on `state.error` being untouched by those steps.

Verification: `CommitOrchestrator.commitSuccess` calls `projectSuccess → pushStepResult`, which spreads the existing state with updated `steps` only. `state.error` is not modified. `commitRound` explicitly sets `error: roundError` (the coordinator is the only writer). So the invariant holds in the current implementation.

The comment in `pipeline.ts` lines 388–391 documents the expectation: *"state.error carries ROUND_ALL_MEMBERS_SKIPPED from commitRound and persists through subsequent steps until a fresh coordinator round clears it (roundError=null on success)."* The documented contract and the implementation agree. Flagged INFO because the invariant is satisfied by omission (commitSuccess not touching `state.error`) rather than by active clearing, making it fragile against future refactors of commitSuccess.

---

## Non-Findings (confirmed correct)

- **selectPendingMembers D4 ordering**: managed short-circuit (`baselineCommit == null`) fires before canon check → managed fail-safe preserved.  
- **Legacy null canonHash**: `isBoundToCanonHash(rec)` returns false for `null` → fail-closed on resume. Correct.
- **Re-anchor + canon check interaction**: when `sourceTouched.length === 0` and guard fires, `approvedAtCommit` is updated but `canonHash` is preserved via spread. `selectPendingMembers` then detects canon mismatch independently. Double-defense works correctly.
- **allMembersSkipped + fast path**: `applyRoundResults` suppression keeps members `"pending"` (not `"skipped"`), so the fast path (`pending.length === 0`) is never reached via an all-skip round in new-state. Invariant preserved.
- **commitRound error overwrite**: `error: roundError` is set explicitly in `commitRound`. When `roundError = null` (success round), state.error is cleared. When `roundError = ROUND_ALL_MEMBERS_SKIPPED`, it is set. Subsequent non-coordinator steps do not overwrite it. The pipeline "end" detection is safe for the ROUND_ALL_MEMBERS_SKIPPED path.
- **computeCanonHash serialization**: uses `path:hash|...` with paths from the fixed canonical-doc set. Git paths and sha256 hashes do not contain `:` or `|`, so no collision risk in practice.
- **excludePipelineManagedChangePaths coverage in partitionRoundChanges**: `partitionRoundChanges` (step 7b, git-effects inspection) is unchanged and correctly independent from the invalidation filter. Canonical docs appearing in worktree changes (step 7b) would be "offending" only if not declared as step outputs, which is the correct sentinel for unexpected agent writes.
