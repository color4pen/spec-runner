# Regression Gate Result — Iteration 3

**Change**: provider-lifecycle-parity-contract  
**Date**: 2026-09-04  
**Ledger items**: 26  
**Regressions found**: 0  

---

## Verification Summary

All 26 ledger findings were verified against the current code. Each finding is fixed and no regressions are present.

---

## Per-Finding Evidence

### [1] `35e1d8db` — T-07: "absent" sentinel assertion logic (tasks.md)
**Status: FIXED**  
`tasks.md` lines 251–253 now explicitly specifies:
- `transientRetryAttempts` / `addedTurns === "absent"` → `expect(result.X).toBeUndefined()` (文字列 `"absent"` と比較してはならない)

Driver implementation at `provider-lifecycle-parity.test.ts` lines 122–128 and 133–148 matches exactly.

---

### [2] `b2b23b7e` — T-07: `fieldPresence` assertion logic and D4 role distinction (tasks.md)
**Status: FIXED**  
`tasks.md` lines 254–261 now specifies fieldPresence spot-check semantics (`present` → `toBeDefined()`, `absent` → `toBeUndefined()`) and explicitly states the role distinction versus D4 matrix universal assert ("case 固有の spot-check" vs "全 case 横断"). Driver lines 264–273 implement this correctly.

---

### [3] `7969ccf3` — TC-042: test count "台帳検査分" ambiguous (test-cases.md)
**Status: FIXED**  
`test-cases.md` line 396 now reads: "実行される test 件数が **64 件以上**（62 case test + 台帳検査 `it` **最低 2 件**）であり、skip が 0 件である". The lower bound (64+) and minimum ledger count (2) are explicit.

---

### [4] `95dad7f9` — absent cases skipped instead of asserting absent-behavior
**Status: FIXED**  
Driver line 325: `const runTest = test;` — no `test.skip`. All 62 combinations (including absent cases) run. JSDoc at line 6 now reads "absent cases assert absent-behavior (TC-012 / TC-042; skip markers are prohibited — enforced by ratchet:no-skip)". The no-skip ratchet (ratchet:no-skip) enforces this mechanically.

---

### [5] `5b13c013` — ratchet:area missing reverse check (every area has ≥1 case)
**Status: FIXED**  
`contract-ratchet.test.ts` lines 138–145 now contain: `"every LIFECYCLE_AREA has at least one case"` test that filters `LIFECYCLE_AREAS` against `caseAreas` and asserts `missing.length === 0`.

---

### [6] `ac81290a` — dead `resultFileContent` field in HarnessBuildOpts
**Status: FIXED**  
`harness/types.ts` lines 15–22: `HarnessBuildOpts` contains only `tempDir`, `sleepFn`, and `emit`. The `resultFileContent` field is absent. The driver creates result files directly before calling `harness.build()`.

---

### [7] `13e5817b` — `fieldPresence` typed with untyped string keys
**Status: FIXED**  
`case-table.ts` line 163: `fieldPresence?: Partial<Record<keyof AgentRunResult, "present" | "absent">>;` — typed to `keyof AgentRunResult`, so field name typos are caught at compile time.

---

### [8] `f42cdf07` — Missing execution ledger (TC-042, TC-024, TC-016)
**Status: FIXED**  
`provider-lifecycle-parity.test.ts` lines 426–464 contain the `provider-lifecycle-parity:ledger` describe block with two `test` blocks:
- Lines 432–441: TC-024 pair coverage check (`_executedPairs`)
- Lines 448–462: TC-016 matrix-supported field observation check (`_observedFields`)

---

### [9] `3a04a38d` — Universal absent-field matrix check not applied in driver
**Status: FIXED**  
Driver imports `RESULT_FIELD_MATRIX` (line 55) and applies it universally at lines 297–307: for every `field` marked `"absent"` for `providerId` in the matrix, `result[field]` is asserted `toBeUndefined()`. Applied to every test result regardless of per-case `fieldPresence`.

---

### [10] `69365ede` — Missing source-level skip/focus marker ratchet (TC-023)
**Status: FIXED**  
`contract-ratchet.test.ts` lines 408–452 contain `ratchet:no-skip` — a test that collects all `.ts` files under the contract directory (excluding the ratchet file itself), checks for `test.skip`, `it.skip`, `describe.skip`, `it.todo`, `test.todo`, `.only`, and fails if any are found.

---

### [11] `62cf8935` — Missing SDK containment ratchet (TC-028, TC-029)
**Status: FIXED**  
`contract-ratchet.test.ts` lines 458–553 contain `ratchet:sdk-containment` with two tests:
1. Shared contract modules do not import from `adapter/claude-code/`, `adapter/codex/`, or provider SDK packages.
2. Provider-specific SDK references (`@anthropic-ai/claude-agent-sdk`, `@openai/codex-sdk`) are confined to their two allowed adapter directories.

---

### [12] `b9beec45` — case-table.ts imports from case-ids.ts (D5, TC-040)
**Status: FIXED**  
`case-table.ts` lines 25–26: imports are `from "./scenario.js"` and `from "../../../../src/core/port/agent-runner.js"`. No import from `./case-ids` or `./case-ids.js`. The file header comment at line 22 explicitly states "case-ids.ts must NOT be imported here — Design D5 / TC-040". The D5 isolation ratchet enforces this.

---

### [13] `de3a40bc` — Stale JSDoc says absent provider gets test.skip
**Status: FIXED**  
`provider-lifecycle-parity.test.ts` line 6 now reads: "provider-specific cases: all providers run; absent cases assert absent-behavior (TC-012 / TC-042; skip markers are prohibited — enforced by ratchet:no-skip)". No reference to `test.skip` for absent providers.

---

### [14] `29389234` — Codex absent expectations for 3 cases have no observable assertions
**Status: FIXED**  
All three absent Codex cases now carry concrete assertions:
1. `context.rollover-recovers-in-fresh-session` codex (lines 1053–1062): `completionReason: "error"`, `errorCode: "CODEX_SDK_ERROR"`, `fieldPresence: { sessionRollovers: "absent" }`.
2. `context.rollover-budget-exhausted` codex (lines 1091–1099): `completionReason: "error"`, `errorCode: "CODEX_SDK_ERROR"`, `fieldPresence: { sessionRollovers: "absent" }`.
3. `report.settle-on-abort-with-captured-report` codex (lines 941–949): `completionReason: "success"`, `toolResult: { ok: true }`, `errorMustBeAbsent: true`.

---

### [15] `c865e0a0` — 8 tests reported as skipped (TC-042)
**Status: FIXED**  
Driver line 325: `const runTest = test;` — no skip markers. The no-skip ratchet (ratchet:no-skip) would fail if any `.skip` appeared. TC-042 zero-skip requirement is now machine-enforced.

---

### [16] `f0b30e89` — emittedEvents observable (D3/D8) not implemented
**Status: FIXED**  
`case-table.ts` line 182: `emittedEvents?: string[]` defined in `ProviderExpectation`. Driver lines 283–290 assert each expected event via `expect(emittedEventNames).toContain(name)`. Case entries use it: e.g. `transient.retry-then-success` and `context.rollover-*` cases assert `["step:retry"]` / `["step:rollover"]`.

---

### [17] `0388f4a9` — transient.budget-exhausted classified 'shared' with divergent errorCodes
**Status: FIXED**  
`case-table.ts` line 630: `classification: "provider-specific"` with an explicit comment explaining the divergent errorCodes (`CLAUDE_CODE_QUERY_FAILED` vs `CODEX_SDK_ERROR`). Each provider expectation carries a `reason` of ≥40 chars (lines 645–656).

---

### [18] `b018c90d` — TC-031 (zero imports in case-ids.ts) not mechanically enforced
**Status: FIXED**  
`contract-ratchet.test.ts` lines 573–586 (`ratchet:d5-isolation`): `"case-ids.ts has zero import statements (TC-031)"` test scans `case-ids.ts` for `/^\s*import\b/m` and fails if any import is found. `case-ids.ts` itself has no imports (line 15 comment: "No imports in this file").

---

### [19] `6c0507a3` / [23] `3cf704d4` — REQUIRED_CASE_IDS duplicate check missing from ratchet
**Status: FIXED** (both refs cover the same defect)  
`contract-ratchet.test.ts` lines 111–121: `"no duplicate IDs in REQUIRED_CASE_IDS (new Set(...).size === 31)"` test computes `unique.size` and asserts it equals `REQUIRED_CASE_IDS.length`, detecting any duplicates that set-comparison in ratchet:id would absorb.

---

### [20] `a929c639` / [24] `0d51ccee` — completionReason value-domain check missing (universal invariant)
**Status: FIXED** (both refs cover the same defect)  
`provider-lifecycle-parity.test.ts` lines 209–213: `const VALID_COMPLETION_REASONS = ["success", "error", "timeout"] as const;` followed by `expect(VALID_COMPLETION_REASONS as readonly string[]).toContain(result.completionReason)` — applied unconditionally in `assertExpectations()`.

---

### [21] `1daafc91` / [25] `d00f15b7` — zod/v4-mini subpath import (fragile)
**Status: FIXED** (both refs cover the same defect)  
`harness/_scenario-helpers.ts` line 13: `import { z } from "zod";` — uses the standard top-level import, consistent with all other files in the project. No `zod/v4-mini` subpath reference.

---

### [22] `04f30ccf` / [26] `629f7eb2` — errorHintPresent missing from ProviderExpectation
**Status: FIXED** (both refs cover the same defect)  
`case-table.ts` lines 114–123: `errorHintPresent?: boolean` is defined in `ProviderExpectation` with a doc comment explaining `true` (non-empty hint) and `false` (hint must be absent). Driver lines 192–203 implement both branches.

---

## Conclusion

Zero regressions detected across all 26 ledger items. All fixes are present and correct in the current branch code.
