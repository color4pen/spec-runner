# Regression Gate Result — provider-lifecycle-parity-contract (Iteration 2)

**Date**: 2026-09-04  
**Branch**: refactor/provider-lifecycle-parity-contract-efcaecb2  
**Gate**: regression-gate-002  
**Ledger items checked**: 18  
**Regressions found**: 0

---

## Verification Summary

Each of the 18 ledger findings was verified against the current branch HEAD (`c2e6216f`).

### [1] `35e1d8db` — MEDIUM: T-07: "absent" sentinel の assertion 変換ロジックが未規定

**Status: FIXED**

`tasks.md` lines 249–260 now explicitly specify the sentinel conversion rules:
- `transientRetryAttempts` / `addedTurns` が `"absent"` → `expect(result.X).toBeUndefined()`
- 数値 → `expect(result.X).toBe(数値)`

The driver (`provider-lifecycle-parity.test.ts` lines 121–148) implements this exactly: both `transientRetryAttempts` and `addedTurns` branches check for `=== "absent"` and call `.toBeUndefined()`.

---

### [2] `b2b23b7e` — LOW: T-07: `fieldPresence` 期待値の assertion ロジックおよび D4 matrix との役割分担が未規定

**Status: FIXED**

`tasks.md` lines 253–260 now documents the role distinction:
- `fieldPresence` = case-specific spot-check (D3)
- capability matrix universal absent check = cross-case invariant (D4/D7)

Both are implemented in `assertExpectations()` (lines 242–285 of the driver).

---

### [3] `7969ccf3` — LOW: TC-042: 台帳検査の test 件数が "台帳検査分" と曖昧

**Status: FIXED**

`test-cases.md` line 396 now reads: "実行される test 件数が 64 件以上（62 case test + 台帳検査 `it` 最低 2 件）であり、skip が 0 件である（台帳検査は "実行ペア完全一致" と "supported field 観測記録" の少なくとも 2 `it` で構成される）". The 下限 64 件 is now explicit. `tasks.md` line 284 similarly states "最低 64 件以上".

---

### [4] `95dad7f9` — HIGH: absent-cases-skipped-not-asserted

**Status: FIXED**

`provider-lifecycle-parity.test.ts` line 303: `const runTest = test;` — no `.skip`. The JSDoc (lines 6–7) confirms: "absent cases assert absent-behavior (TC-012 / TC-042; skip markers are prohibited — enforced by ratchet:no-skip)". All 62 combinations execute without skip markers.

---

### [5] `5b13c013` — MEDIUM: ratchet-missing-every-area-has-case-check

**Status: FIXED**

`contract-ratchet.test.ts` lines 123–130 ("ratchet:area") now has the reverse check: "every LIFECYCLE_AREA has at least one case" — filters LIFECYCLE_AREAS not covered by any case and fails if any are missing.

---

### [6] `ac81290a` — LOW: dead-resultFileContent-field-in-HarnessBuildOpts

**Status: FIXED**

`harness/types.ts` `HarnessBuildOpts` (lines 15–22) contains only `tempDir`, `sleepFn`, and `emit` — the dead `resultFileContent` field has been removed.

---

### [7] `13e5817b` — LOW: fieldPresence-untyped-string-keys-allow-silent-typos

**Status: FIXED**

`case-table.ts` line 158: `fieldPresence?: Partial<Record<keyof AgentRunResult, "present" | "absent">>` — keys are now typed as `keyof AgentRunResult`, preventing silent field-name typos.

---

### [8] `f42cdf07` — HIGH: Missing execution ledger: 62-pair completeness and supported-field observation unverified

**Status: FIXED**

`provider-lifecycle-parity.test.ts` lines 404–441 contains the `provider-lifecycle-parity:ledger` describe block with two `test()` blocks:
- "all (caseId × provider) pairs executed — TC-024" (lines 410–418)
- "each matrix-supported field observed ≥once per provider — TC-016" (lines 426–441)

Both ledger sets (`_executedPairs`, `_observedFields`) are populated after `runner.run()` completes.

---

### [9] `3a04a38d` — HIGH: Universal absent-field check from field matrix not applied in driver

**Status: FIXED**

`provider-lifecycle-parity.test.ts` lines 275–285: The matrix-universal absent check iterates `RESULT_FIELD_MATRIX`, finds entries with `providers[providerId] === "absent"`, and asserts `expect(value).toBeUndefined()`. `RESULT_FIELD_MATRIX` is imported at line 55.

---

### [10] `69365ede` — MEDIUM: Missing source-level skip/focus marker ratchet (TC-023, D9 item 5)

**Status: FIXED**

`contract-ratchet.test.ts` lines 317–360 ("ratchet:no-skip"): Scans all `.ts` files under the contract directory (excluding itself) for `test.skip`, `it.skip`, `describe.skip`, `it.todo`, `test.todo`, and `.only`. Fails with a violation list if any are found.

---

### [11] `62cf8935` — MEDIUM: Missing SDK containment ratchet (TC-028, TC-029, D9 item 6)

**Status: FIXED**

`contract-ratchet.test.ts` lines 364–406 ("ratchet:sdk-containment"): Lists the 6 shared modules and checks none contains imports matching `adapter/claude-code`, `adapter/codex`, `@anthropic-ai/`, `openai`, or `@openai/`. Fails with a violation list.

---

### [12] `b9beec45` — MEDIUM: case-table.ts imports from case-ids.ts, violating D5 and TC-040

**Status: FIXED**

`case-table.ts` line 25: `import type { LifecycleScenario } from "./scenario.js";` — no import from `./case-ids`. The file header (lines 22–23) documents the constraint. The D5 isolation ratchet (`contract-ratchet.test.ts` lines 412–424) machine-enforces it.

---

### [13] `de3a40bc` — LOW: Stale JSDoc says absent provider gets test.skip

**Status: FIXED**

`provider-lifecycle-parity.test.ts` lines 3–7: JSDoc now reads "absent cases assert absent-behavior (TC-012 / TC-042; skip markers are prohibited — enforced by ratchet:no-skip)". The old stale text is gone.

---

### [14] `29389234` — LOW: Codex absent expectations for 3 cases carry no observable assertions

**Status: FIXED**

All three absent Codex expectations now carry observable assertions:
- `context.rollover-recovers-in-fresh-session` (lines 1048–1056): `completionReason: "error"`, `errorCode: "CODEX_SDK_ERROR"`, `fieldPresence: { sessionRollovers: "absent" }`
- `context.rollover-budget-exhausted` (lines 1086–1094): `completionReason: "error"`, `errorCode: "CODEX_SDK_ERROR"`, `fieldPresence: { sessionRollovers: "absent" }`
- `report.settle-on-abort-with-captured-report` (lines 936–944): `completionReason: "success"`, `toolResult: { ok: true }`, `errorMustBeAbsent: true`

---

### [15] `c865e0a0` — MEDIUM: 8 tests reported as skipped — TC-042 requires zero skips

**Status: FIXED**

Same fix as [4]. `const runTest = test;` — no `.skip`. The no-skip ratchet (finding [10]) machine-enforces this going forward.

---

### [16] `f0b30e89` — MEDIUM: emittedEvents observable (D3/D8) not implemented

**Status: FIXED**

`provider-lifecycle-parity.test.ts` lines 261–268: `emittedEvents` assertions check `expect(emittedEventNames).toContain(expectedEvent)`. The `emittedEventNames` array is populated by the collecting `emit` function (lines 332–335). Multiple cases (e.g., `transient.retry-success`, `transient.budget-exhausted`, `context.rollover-budget-exhausted`) include `emittedEvents: ["step:retry"]` or `emittedEvents: ["step:rollover"]`.

---

### [17] `0388f4a9` — LOW: transient.budget-exhausted classified 'shared' but expectations have different errorCodes

**Status: FIXED**

`case-table.ts` lines 621–659: `transient.budget-exhausted` is now `classification: "provider-specific"` with 40+ char reasons explaining the divergent `errorCode` values (`CLAUDE_CODE_QUERY_FAILED` vs `CODEX_SDK_ERROR`). The shared guarantee inconsistency is resolved.

---

### [18] `b018c90d` — LOW: TC-031 (zero imports in case-ids.ts) not mechanically enforced

**Status: FIXED**

`contract-ratchet.test.ts` lines 426–439 ("ratchet:d5-isolation", second test): Reads `case-ids.ts` and checks for `/^\s*import\b/m` — fails if any import statement is found.

---

## Evidence

- **Checked**: 18 ledger items
- **Regressions**: 0
- **Skipped**: 0
- **Unverified**: 0

All 18 findings from the iteration-1 ledger have been remediated in the current HEAD. No regressions detected.
