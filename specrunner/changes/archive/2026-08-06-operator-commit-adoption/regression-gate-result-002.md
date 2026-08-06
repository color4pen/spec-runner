# Regression Gate Result — Iteration 2

**Change**: operator-commit-adoption
**Branch**: change/operator-commit-adoption-be9b1cb9
**Date**: 2026-08-06

## Summary

All 7 findings from the previous review were verified as fixed. No regressions detected.

---

## Finding-by-Finding Evidence

### Finding 1 — [MEDIUM] --apply-canon --adopt-commits composability test

**Claimed resolution**: TC-I-combined (TC-013) added to T-06.

**Evidence**:
`src/core/command/__tests__/resume-adopt-commits.test.ts` lines 904–1007 contain TC-013 with 4 sub-tests:

1. `TC-013: prepare() resolves when both --apply-canon and --adopt-commits are given` (line 932) — verifies combined flags resolve without error.
2. `TC-013: synthesizedCommits contains both apply-canon OID and adopted OID in persisted state` (line 943) — asserts both OIDs appear in the final persisted state.
3. `TC-013: apply-canon OID appears exactly once in synthesizedCommits (not re-adopted)` (line 962) — asserts `APPLY_CANON_OID` count is exactly 1 (D4 invariant).
4. `TC-013: detectUnadoptedCommits was called with a ledger that already contains the apply-canon OID` (line 986) — asserts `detectUnadoptedCommits` receives the post-apply-canon ledger as its second argument.

The `beforeEach` (line 912) sets `mockDetectCanonDirtyPaths` to return a dirty path and `mockCommitOperatorCanon` to return `APPLY_CANON_OID`, then sets `mockDetectUnadoptedCommits` to return only `OPERATOR_OID` (simulating that the apply-canon OID was already in the ledger when detect was called). This directly exercises the ordering invariant described in design.md D4.

**Status: Fixed.**

---

### Finding 2 — [LOW] null runStore → PrepareError(1) test case

**Claimed resolution**: TC-I4b added as TC-011.

**Evidence**:
`src/core/command/__tests__/resume-adopt-commits.test.ts` lines 780–835 contain TC-011 with 2 sub-tests:

1. `TC-011: prepare() throws PrepareError(1) when runStore is null and adoptCommits is true` (line 785) — mocks `resolveStateStoreByJobId` to return null, asserts `caught?.exitCode === 1`.
2. `TC-011: null runStore is treated identically to a persist failure (fail-closed)` (line 811) — verifies `threw === true`.

The implementation guard in `resume.ts` lines 375–378:
```typescript
if (!runStore) {
  logError("Cannot adopt commits: no state store available");
  throw new PrepareError(1, "Failed to adopt commits: no runStore");
}
```
is what these tests exercise. The null path is now separately verified from the persist-throws path.

**Status: Fixed.**

---

### Finding 3 — [LOW] TC-005 test 2 exercises the wrong failure mode

**Claimed resolution**: TC-005 test 2 rewritten to use a counter-based mock.

**Evidence**:
`src/core/command/__tests__/resume-adopt-commits.test.ts` lines 648–677. The second test now uses:
```typescript
let persistCallCount = 0;
vi.mocked(MOCK_STORE.persist).mockImplementation(async () => {
  persistCallCount++;
  if (persistCallCount >= 2) {
    throw new Error("persist failed");
  }
});
```
The comment at line 650–652 explicitly explains why: "Use a counter-based mock so the FIRST persist (state-transition at resume.ts:248) succeeds and the SECOND persist (adoption) is the one that fails — specifically exercising the adoption persist guard, not the earlier state-transition guard."

The previous `mockRejectedValue` approach (rejected ALL calls) is gone; both TC-005 tests now correctly target the adoption persist guard (call ≥ 2).

**Status: Fixed.**

---

### Finding 4 — [LOW] Escalation message uses stderrWrite only

**Claimed resolution**: `logError` added to adoption escalation path.

**Evidence**:
`src/core/command/resume.ts` lines 387–391:
```typescript
const msg = buildAdoptEscalationMessage(resolvedSlug, unadoptedCommits);
logError(`Unknown commits in publish range: ${unadoptedCommits.map((c) => c.shortSha).join(", ")}`);
stderrWrite(msg);
throw new PrepareError(1, "Unknown commits in publish range; use --adopt-commits");
```
Both `logError` (summary) and `stderrWrite` (full message with details) are called. This matches the pattern established by the apply-canon gate at lines 343–344 (`logError` summary + `stderrWrite` hint).

**Status: Fixed.**

---

### Finding 5 — [LOW] hand-push convention comment contradicts new --adopt-commits behavior

**Claimed resolution**: Comment in commit-push.ts updated to include `--adopt-commits`.

**Evidence**:
`src/core/step/commit-push.ts` lines 388–390:
```
Pre-existing legitimate commits are excluded because they are on origin
(pipeline pushes after every synthesis; operator hand-commits are either hand-pushed
or registered in the ledger via `resume --adopt-commits`).
```
The old text ("operator hand-commits are hand-pushed") has been updated to acknowledge both paths: hand-pushed or registered via `resume --adopt-commits`. The comment no longer implies that hand-pushing is the only recourse.

**Status: Fixed.**

---

### Finding 6 — [LOW] --adopt-commits silently ignored without worktree

**Claimed resolution**: Warning added to the no-worktree branch.

**Evidence**:
`src/core/command/resume.ts` lines 417–420:
```typescript
if (this.options.adoptCommits) {
  // --adopt-commits cannot check the publish range without a worktree — warn but continue.
  stderrWrite("Warning: --adopt-commits has no effect without a worktree (no-worktree mode or worktree not found). The publish range cannot be checked; commits will not be adopted.");
}
```
This is inside the `else` branch (lines 412–421) that runs when `resolvedWorktreePath === null`. The warning is explicit about why the flag has no effect, parallel to the existing `--apply-canon` warning at lines 413–415.

**Status: Fixed.**

---

### Finding 7 — [LOW] adopt gate fail-closed halt does not call logError

**Claimed resolution**: Same fix as Finding 4 (same code location, same change).

**Evidence**:
Identical to Finding 4 evidence. `resume.ts` lines 388–390 now call `logError` (summary line) followed by `stderrWrite` (full escalation message), symmetric with the apply-canon gate pattern at lines 343–344.

**Status: Fixed.**

---

## Conclusion

No regressions detected. All 7 findings confirmed fixed in the current branch state.
