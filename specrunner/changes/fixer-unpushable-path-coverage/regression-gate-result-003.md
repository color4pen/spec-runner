# Regression Gate Result — Iteration 3

**Slug**: fixer-unpushable-path-coverage
**Iteration**: 3
**Date**: 2026-08-28

## Evidence

All 7 findings from the ledger were verified against the current branch HEAD.

---

### [1] `ae205ab6` — T-04 acceptance criteria 最低テスト数の不一致 [MEDIUM]

**Status**: FIXED

`tasks.md` T-04 acceptance criteria now reads:
> "At minimum 18 tests covering: 4 helper tests + 6 code-fixer tests + 8 spec-fixer tests (totals above)"

The previous "minimum 14" has been corrected to "minimum 18", matching the checkbox count (4+6+8=18).
`test-cases.md` TC-019 also reads "minimum 18 tests: 4 helper + 6 code-fixer + 8 spec-fixer".

---

### [2] `c8e316a3` — spec-fixer conformance branch TC が存在しない [LOW]

**Status**: FIXED

`test-cases.md` now contains:
- **TC-022**: `spec-fixer conformance branch initial entry includes push capability notice`
- **TC-023**: `spec-fixer conformance branch continuation includes push capability notice`

`fixer-push-capability.test.ts` implements both TCs in `describe("SpecFixerStep.buildMessage — conformance branch (TC-022/TC-023)")`, using `makeSpecFixerConformanceState()` and `makeSpecFixerConformanceContinuationState()` fixtures.

---

### [3] `45fe8acf` — TC-015 未実装: code-fixer follow-up → Layer 2 backstop chain [MEDIUM]

**Status**: FIXED

`fixer-push-capability.test.ts` now has:
```
describe("TC-015: code-fixer Layer 2 backstop fires after follow-up fails to resolve unpushable-path violation", ...)
```
containing 4 sub-tests:
1. CodeFixerStep.outputContracts declares unpushable-path contract with policy "follow-up"
2. Layer 1: unpushable-path violation generates a follow-up prompt on attempt 1
3. One-follow-up invariant: at attempt >= 2 violations are filtered → null (no second follow-up)
4. Layer 2 wiring: null pushCapability returns [] (backstop not triggered by contract absence)

---

### [4] `33cda064` — TC-017: coordinator loop fallback path (no findings) not covered [LOW]

**Status**: FIXED

`fixer-push-capability.test.ts` adds:
- `makeCodeFixerCoordinatorStateEmptyFindings()` fixture — security reviewer has `needs-fix` verdict but no `toolResult` → `collectParallelFixerFindings` returns `[]` → routes to fallback path
- Test: `"TC-017 (fallback sub-path): coordinator loop fallback (no aggregated findings, needsFixMembers non-empty) includes 'Push Capability Notice' when pushCapability set"`

---

### [5] `66e0f8f9` — TC-017: coordinator loop fallback sub-path の capability notice テストが欠如 [LOW]

**Status**: FIXED

Same fix as [4] — the fallback sub-path test verifies that `capabilityNotice` (appended at the fallback return in `code-fixer.ts` L232) is present when `pushCapability` is set. A complementary `"no notice"` variant is also present.

---

### [6] `ad3aa563` — Self-commits prevent the fixer follow-up from clearing unpushable paths [HIGH]

**Status**: FIXED

`executor.ts` lines 422–424 now explicitly filter `unpushable-path` contracts from the output contract gate:
```typescript
const allContracts = buildAllOutputContracts(step, state, deps)
  .filter((c) => c.kind !== "unpushable-path");
```
The comment above (lines 413–421) explains the correctness rationale: the gate runs **before** `commitAndPush`'s `git reset --mixed` normalization, so self-committed unpushable paths are still visible at gate time and would cause false-positive halts. Layer 2 (`commitScopedPaths → collectPublishablePaths`) runs **after** the mixed reset and is the correct backstop. Layer 1 follow-up (via the adapter's `OutputVerificationPolicy`) reads `step.outputContracts` independently and is unaffected.

---

### [7] `0f199239` — Self-commit workaround removes code-fixer's Layer 1 repair path [HIGH]

**Status**: FIXED

`code-fixer.ts` lines 84–86 show `outputContracts` is present and correctly declared:
```typescript
outputContracts(_state: JobState, deps: StepDeps): OutputContract[] {
  return buildUnpushablePathContracts(deps);
},
```
Layer 1 repair path is intact. Ordinary uncommitted edits to an unpushable path receive a follow-up prompt; the executor gate exclusion (finding [6]) applies only to self-commits at the gate stage, not to the adapter's `OutputVerificationPolicy` which reads the contract independently.

---

## Verdict Summary

| # | Ref | Severity | Status |
|---|-----|----------|--------|
| 1 | `ae205ab6` | MEDIUM | ✅ Fixed |
| 2 | `c8e316a3` | LOW | ✅ Fixed |
| 3 | `45fe8acf` | MEDIUM | ✅ Fixed |
| 4 | `33cda064` | LOW | ✅ Fixed |
| 5 | `66e0f8f9` | LOW | ✅ Fixed |
| 6 | `ad3aa563` | HIGH | ✅ Fixed |
| 7 | `0f199239` | HIGH | ✅ Fixed |

No regressions detected. All 7 ledger findings have been resolved in the current code.
