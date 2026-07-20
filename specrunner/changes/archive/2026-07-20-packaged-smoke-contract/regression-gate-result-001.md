# Regression Gate Result — packaged-smoke-contract — Iteration 1

- **verdict**: needs-fix
- **date**: 2026-07-20

## Summary

Ledger had 2 findings marked as fixed. Both are regressions — neither fix is present in the current code.

---

## Finding 1: [REGRESSION] S4 で exit 0 の assert が欠落

- **Severity**: high
- **Resolution**: fixable
- **File**: scripts/smoke/package-smoke.sh
- **Status**: REGRESSED — fix NOT present

`S4_EXIT` is captured (line 271) but there is no `assert_exit_zero` call between the exit capture and the summary section. The S4 block asserts `assert_present` and `assert_absent` only:

```bash
S4_EXIT=0
(cd "${S4_SUB}" && ... node "${DIST}" request new "${S4_SLUG}" ...) || S4_EXIT=$?

# Assert 1: request.md exists at repo root (not in subdirectory)
assert_present "TC-004/S4/root-request-md" "${S4_REPO}/specrunner/drafts/${S4_SLUG}/request.md"
# Assert 2: no nested specrunner/ in subdirectory
assert_absent "TC-004/S4/no-nested-specrunner" "${S4_SUB}/specrunner"
```

Required fix: add `assert_exit_zero "TC-004/S4/exit-zero" "${S4_EXIT}"` immediately after the exit capture, before the `assert_present` calls.

---

## Finding 2: [REGRESSION] TC-006 のカテゴリが manual だが vitest で自動検証済み

- **Severity**: high
- **Resolution**: fixable
- **File**: specrunner/changes/packaged-smoke-contract/test-cases.md
- **Status**: REGRESSED — fix NOT present

TC-006 is still `**Category**: manual` (line 108 in test-cases.md), and the Summary still reads `Automated: 9 / Manual: 6`. However, `tests/package-smoke-contract.test.ts` has a `describe("TC-006 (content): smoke script must not invoke bun or reference src/", ...)` block with two automated vitest tests.

Required fix:
1. Change TC-006 `**Category**: manual` → `**Category**: integration`
2. Update Summary: `**Automated** (unit/integration): 9` → `10`, `**Manual**: 6` → `5`
3. Update Result YAML: `automated: 9` → `10`, `manual: 6` → `5`
