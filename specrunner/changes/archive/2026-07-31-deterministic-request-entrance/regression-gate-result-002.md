# Regression Gate Result — Iteration 2

## Summary

Verified all 5 findings (3 unique issues, 2 duplicated in Japanese) from the iteration 1 review. All are confirmed fixed.

---

## Finding Verification

### [LOW] T-07: common-context-catch.test.ts のカウントアサーション更新が未記載

**Status**: FIXED

**Evidence**:
- `tests/unit/prompts/common-context-catch.test.ts:23` — REQUEST_GENERATE import replaced with comment `// REQUEST_GENERATE_SYSTEM_PROMPT removed (deterministic-request-entrance, T-07)`
- `tests/unit/prompts/common-context-catch.test.ts:36` — entry commented out `// ["REQUEST_GENERATE", REQUEST_GENERATE_SYSTEM_PROMPT],  // removed (deterministic-request-entrance)`
- `tests/unit/prompts/common-context-catch.test.ts:43` — assertion updated to `expect(ALL_AGENT_PROMPTS.length).toBe(10)` (was 11)
- Test description updated to `"TC-31: tests all 10 agent prompts (REQUEST_GENERATE removed, deterministic-request-entrance)"`

---

### [LOW] B-18 regression guard tests are trivially true — grepE never called

**Status**: FIXED

**Evidence** (`tests/unit/architecture/request-entrance-llm-boundary.test.ts:107–156`):
- Both regression guard tests now create a real temp directory via `mkdtempSync`
- Write an actual TypeScript file containing a forbidden import via `writeFileSync`
- Call `grepE` against the temp directory to confirm the pattern is found
- Clean up via `rmSync` in a `finally` block
- `expect(result).not.toBe("")` is now backed by an actual grep on a real file, not a hardcoded string
- Detection mechanism is exercised; a broken `grepE` (wrong pattern, wrong dir) would cause these tests to fail

---

### [LOW] Duplicate test file: generate-chain-removed.test.ts mirrors deprecated-generate-removal.test.ts

**Status**: FIXED

**Evidence**:
- `git log main...HEAD --name-status --diff-filter=D` shows `D tests/unit/cli/deprecated-generate-removal.test.ts`
- `tests/unit/cli/deprecated-generate-removal.test.ts` does not exist on disk (confirmed)
- `tests/unit/generate-chain-removed.test.ts` is the surviving canonical file (present on disk)
- One file removed; duplication eliminated

---

### [LOW] B-18 regression guard テストが grepE を呼ばず vacuously true *(Japanese duplicate of finding 2)*

**Status**: FIXED — same fix as above.

---

### [LOW] 削除検証テストが 2 ファイルに重複し TC 番号乖離リスクがある *(Japanese duplicate of finding 3)*

**Status**: FIXED — same fix as above.

---

## Conclusion

All 5 ledger findings verified fixed. No regressions detected. No contradictions introduced.
