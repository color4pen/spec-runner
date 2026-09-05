# Regression Gate Result — provider-lifecycle-parity-contract (iteration 1)

## Summary

**Checked**: 18 ledger findings  
**Fixed (no regression)**: 15  
**Still present (regressions)**: 3  

---

## Fixed Findings (15)

### [1] T-07: "absent" sentinel assertion conversion — FIXED
`tasks.md` line 251 now explicitly specifies:
> `transientRetryAttempts` / `addedTurns` が `"absent"` → `expect(result.X).toBeUndefined()`（文字列 `"absent"` と比較してはならない）

The driver (`provider-lifecycle-parity.test.ts` lines 120–146) correctly implements this with `toBeUndefined()` branches.

### [2] T-07: `fieldPresence` assertion logic — FIXED
`tasks.md` now documents the spot-check vs. capability-matrix role split and the per-entry assertion rules. The driver (lines 240–248) iterates `fieldPresence` entries and calls `toBeDefined()` / `toBeUndefined()` correctly.

### [3] TC-042: test count ambiguity — FIXED
`test-cases.md` TC-042 now reads: "64件以上（62 case test + 台帳検査 `it` 最低 2 件）" — the lower bound is explicit. `tasks.md` line 285 says the same.

### [4] absent-cases-skipped-not-asserted — FIXED
Driver line 290: `const runTest = test;` — no `test.skip`. The comment explicitly states skip markers are prohibited (TC-042/TC-023). All 8 absent-provider combinations now execute and assert.

### [5] ratchet:area missing every-area-has-case check — FIXED
`contract-ratchet.test.ts` lines 122–129 add the reverse direction test:
```
test("every LIFECYCLE_AREA has at least one case", () => { ... })
```

### [6] dead `resultFileContent` field in `HarnessBuildOpts` — FIXED
`harness/types.ts` `HarnessBuildOpts` no longer contains `resultFileContent`. Only `tempDir`, `sleepFn`, and `emit` remain.

### [7] `fieldPresence` untyped string keys — FIXED
`case-table.ts` line 158:
```typescript
fieldPresence?: Partial<Record<keyof AgentRunResult, "present" | "absent">>;
```
Field name typos now produce a compile-time error instead of a silent no-assertion.

### [8] Missing execution ledger — FIXED
`provider-lifecycle-parity.test.ts` lines 388–426 add a `provider-lifecycle-parity:ledger` describe with two tests:
- TC-024: all (caseId × provider) pairs executed
- TC-016: each matrix-supported field observed ≥once per provider

### [9] Universal absent-field check from RESULT_FIELD_MATRIX not applied — FIXED
`assertExpectations` (lines 262–272) iterates `RESULT_FIELD_MATRIX` and calls `toBeUndefined()` for every `absent`-marked field for the provider being tested. Applied universally to every test run.

### [10] Missing source-level skip/focus marker ratchet (TC-023) — FIXED
`contract-ratchet.test.ts` ratchet 10 (`ratchet:no-skip`, lines 316–360) greps all `.ts` files in the contract directory for `test.skip`, `it.skip`, `describe.skip`, `it.todo`, `test.todo`, and `.only` patterns.

### [11] Missing SDK containment ratchet (TC-028, TC-029) — FIXED
`contract-ratchet.test.ts` ratchet 11 (`ratchet:sdk-containment`, lines 366–405) verifies that shared modules do not import from `adapter/claude-code/`, `adapter/codex/`, `@anthropic-ai/`, `openai`, or `@openai/`.

### [12] case-table.ts imports from case-ids.ts — FIXED
`case-table.ts` no longer contains any import from `./case-ids`. The top-level JSDoc (lines 21–23) explains the Design D5 constraint and the comment on `ContractCase.id` (line 178) repeats it. ratchet 12 (`ratchet:d5-isolation`) enforces this mechanically.

### [13] Stale JSDoc — FIXED
Driver JSDoc (lines 1–39) no longer says absent providers get `test.skip`. Line 6 now reads:
> "provider-specific cases: all providers run; absent cases assert absent-behavior (TC-012 / TC-042; skip markers are prohibited — enforced by ratchet:no-skip)"

### [14] Codex absent expectations missing assertions — FIXED
All three cases now carry proper absent-behavior assertions:
- `context.rollover-recovers-in-fresh-session` codex: `completionReason: "error"`, `errorCode: "CODEX_SDK_ERROR"`, `fieldPresence: { sessionRollovers: "absent" }`
- `context.rollover-budget-exhausted` codex: `completionReason: "error"`, `errorCode: "CODEX_SDK_ERROR"`, `fieldPresence: { sessionRollovers: "absent" }`
- `report.settle-on-abort-with-captured-report` codex: `completionReason: "success"`, `toolResult: { ok: true }`, `errorMustBeAbsent: true`

### [15] 8 tests skipped — FIXED
Same root fix as finding [4]: no `test.skip` in the driver. All 62 tests run.

---

## Regressions (3)

### [16] emittedEvents observable not implemented — STILL PRESENT
**Severity**: MEDIUM  
**File**: `tests/unit/contract/provider-lifecycle/provider-lifecycle-parity.test.ts:318`

The `emit` callback passed to `harness.build()` (driver line 318) is still an immediate no-op:
```typescript
const emit = (() => {}) as ...
```
`ProviderExpectation` in `case-table.ts` has no `emittedEvents` field, and the driver does not collect or assert any emitted event names. D8 requires event names (e.g. `step:retry`, `step:rollover`) to be a contract item. `tasks.md` line 247 marks the collect-and-record task as `[x]` but the implementation does not satisfy it.

### [17] transient.budget-exhausted classified 'shared' but divergent errorCodes — STILL PRESENT
**Severity**: LOW  
**File**: `tests/unit/contract/provider-lifecycle/case-table.ts:607`

`transient.budget-exhausted` is still `classification: "shared"` but has:
- `claude-code`: `errorCode: "CLAUDE_CODE_QUERY_FAILED"`
- `codex`: `errorCode: "CODEX_SDK_ERROR"`

D3's "shared" guarantee means same observable result. The divergent error codes are a semantic inconsistency the ratchet cannot detect and may mislead future contributors about what "shared" guarantees for the error path.

### [18] TC-031: zero imports in case-ids.ts not mechanically enforced — STILL PRESENT
**Severity**: LOW  
**File**: `tests/unit/contract/provider-lifecycle/contract-ratchet.test.ts:366`

The 12 ratchets do not include a dedicated test scanning `case-ids.ts` for any `import` statement. Ratchet 11 (SDK containment) covers provider-SDK imports in shared modules but does not enforce the zero-import rule for `case-ids.ts` specifically. A future contributor could add a convenience import to `case-ids.ts` and all ratchets would pass green.

---

## Evidence

| # | Finding | Status | Evidence |
|---|---------|--------|---------|
| 1 | T-07 absent sentinel spec | ✅ Fixed | tasks.md line 251; driver lines 120–146 |
| 2 | fieldPresence assertion logic | ✅ Fixed | tasks.md lines 253–264; driver lines 240–248 |
| 3 | TC-042 count ambiguity | ✅ Fixed | test-cases.md TC-042: "64件以上" |
| 4 | absent cases skipped | ✅ Fixed | driver line 290: `const runTest = test` |
| 5 | ratchet area reverse check | ✅ Fixed | contract-ratchet.test.ts lines 122–129 |
| 6 | dead resultFileContent field | ✅ Fixed | harness/types.ts: field removed |
| 7 | fieldPresence untyped keys | ✅ Fixed | case-table.ts line 158: `keyof AgentRunResult` |
| 8 | Missing ledger | ✅ Fixed | driver lines 388–426 |
| 9 | Matrix absent not enforced | ✅ Fixed | driver lines 262–272 |
| 10 | No-skip ratchet missing | ✅ Fixed | contract-ratchet.test.ts lines 316–360 |
| 11 | SDK containment missing | ✅ Fixed | contract-ratchet.test.ts lines 366–405 |
| 12 | case-table imports case-ids | ✅ Fixed | no import; ratchet 12 enforces |
| 13 | Stale JSDoc | ✅ Fixed | driver lines 6–7 |
| 14 | Codex absent missing assertions | ✅ Fixed | case-table.ts lines 1024–1068, 913–922 |
| 15 | 8 tests skipped | ✅ Fixed | same as finding 4 |
| 16 | emittedEvents not implemented | ❌ Regression | emit no-op; no emittedEvents in expectation type |
| 17 | budget-exhausted divergent errorCodes | ❌ Regression | case-table.ts lines 622–633 |
| 18 | TC-031 not enforced | ❌ Regression | no import-scan ratchet for case-ids.ts |
