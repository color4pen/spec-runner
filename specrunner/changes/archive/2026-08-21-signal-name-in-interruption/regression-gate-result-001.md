# Regression Gate Result — signal-name-in-interruption (Iteration 1)

## Summary

All 3 findings from the ledger are **fixed** in the current code. No regressions detected.

---

## Finding Verification

### [LOW] T-04 / T-05 が HistoryEntry の存在しない "reason" フィールドを参照している
- **File**: specrunner/changes/signal-name-in-interruption/tasks.md
- **Status**: FIXED

**Verification**: tasks.md T-04 now reads: "assert that `persist` is called with a state whose history entry's **`message`** field contains the signal name" (line 62). T-05 now reads: "asserts that the state passed to `store.persist` has a history entry whose **`message`** includes the signal name" (line 83). The Acceptance Criteria sections for both tasks also use `message`. The actual test code in `signal-name-in-interruption.test.ts` lines 138–140 and 268–270 uses `lastEntry?.message`, confirming the implementation aligns with the corrected spec.

---

### [MEDIUM] TC-004 missing: no test pins that exit-guard records omit the `signal` field
- **File**: src/core/runtime/__tests__/signal-name-in-interruption.test.ts
- **Status**: FIXED

**Verification**: The test file (new in this branch) contains a dedicated `describe` block for TC-004 at lines 343–376:
```
describe("TC-004: exit-guard fires (no signal handler ran) — signal field absent", () => {
  it("appendInterruption called by exit-guard has no 'signal' field", async () => {
    ...
    expect(record).not.toHaveProperty("signal");
  });
});
```
The test invokes `createExitGuardHandler` in no-worktree mode, waits for async settlement, then asserts `expect(record).not.toHaveProperty("signal")`. This directly pins that exit-guard call-sites omit the `signal` field.

---

### [LOW] Misleading exit-code comment: '128 + SIGINT(2)' after handler is shared with SIGTERM/SIGHUP
- **File**: src/core/runtime/local.ts:1718
- **Status**: FIXED

**Verification**: The comment at line 1718 of `local.ts` now reads:
```typescript
process.exit(130); // fixed; per-signal exit codes (128+n) are out of scope
```
This accurately describes that the exit code is intentionally fixed and that per-signal differentiation is out of scope, replacing the misleading `// 128 + SIGINT(2) = 130` comment.

---

## Evidence

- **checked**: 3 (all ledger findings verified against current branch code)
- **skipped**: 0
- **unverified**: 0

## Observation

test-cases.md TC-008 (line 68) and TC-009 (line 78) still contain `reason` in their THEN clauses ("has a history entry whose `reason` field is `"Interrupted by SIGINT"`"), whereas the correct field is `message`. This is a documentation-only artifact (test-cases.md is not executable). The finding from the ledger targeted tasks.md and the test code — both of which are now correct. The test-cases.md inconsistency is a minor documentation artifact that does not affect compilation or test outcomes.
