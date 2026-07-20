# Regression Gate Result — Iteration 002

- **verdict**: approved

## Ledger Verification

### Finding 1: S4 で exit 0 の assert が欠落

- **File**: scripts/smoke/package-smoke.sh
- **Status**: FIXED
- **Evidence**: Line 277 contains `assert_exit_zero "TC-004/S4/exit-zero" "${S4_EXIT}"`. The fix is present and correct. S4 now asserts exit 0 before the two presence/absence checks, satisfying all three points required by tasks.md T-05.

### Finding 2: TC-006 のカテゴリが manual だが vitest で自動検証済み

- **File**: specrunner/changes/packaged-smoke-contract/test-cases.md
- **Status**: FIXED
- **Evidence**: TC-006 category (line 108) now reads `**Category**: automated`. The Summary header (lines 59–60) now shows `Automated: 10 / Manual: 5`, matching the actual distribution. The primary fix is in place.

## Observations

- The Result YAML block at the bottom of test-cases.md still shows `automated: 9` / `manual: 6` (stale — not updated when TC-006 was reclassified). This is a minor cosmetic inconsistency; the authoritative Summary header is correct. No functional impact.

## Summary

Both ledger findings are confirmed fixed. No regressions detected.
