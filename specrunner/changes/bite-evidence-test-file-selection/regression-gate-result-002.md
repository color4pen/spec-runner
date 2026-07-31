# Regression Gate Result — Iteration 2

**Branch**: change/bite-evidence-test-file-selection-ba76155d
**Checked**: 4 findings · Skipped: 0 · Unverified: 0

---

## Finding 1 (MEDIUM) — T-06 floor test: existing fake ignores paths argument

**File**: `tests/unit/core/archive/achieved-assurance-completeness-unit.test.ts:238`

**Status**: ✅ Fixed

**Evidence**: The existing fake at lines 238-248 still ignores `_paths` (by design, for existing tests). The fix was applied in the **new** test file `tests/unit/core/archive/achieved-assurance-test-file-selection.test.ts`, where the `makeFakeRuntime` helper implements an intersection-based `diffPathsBetweenCommits`:

```typescript
async diffPathsBetweenCommits(_baseOid, _headOid, paths, _cwd) {
  const intersection = editedFiles.filter((f) => paths.includes(f));
  return { kind: "success", files: intersection };
},
```

TC-012 passes `changedFiles=[TEST_FILE, NON_TEST_FILE]` and `editedFiles=[NON_TEST_FILE]`. With `selectMaterializedTestFiles` narrowing materializedTestFiles to `[TEST_FILE]` only, the fake returns `intersection([NON_TEST_FILE], [TEST_FILE]) = []` — no tamper. Before the fix (old `isExcludedPath`-only code), materializedTestFiles would include NON_TEST_FILE, the fake would return `[NON_TEST_FILE]`, and tamper would fire — TC-012 would be red (correctly guards against false positives).

---

## Finding 2 (LOW) — glob `.` semantics docs mismatch

**File**: `docs/configuration.md:229`

**Status**: ✅ Fixed

**Evidence**: The implementation in `src/core/step/bite-evidence/test-file-selection.ts` now uses strict regex escaping (`ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&")` at line 78), compiling `.` to `\.`. The D3 approach is documented in the function's JSDoc (lines 44-50): "all other characters: regex-escaped (e.g., '.' compiles to '\.' and matches only a literal dot — not underscore or any other character)".

The docs at line 229 now reads: "literal characters (including `.`) match literally" — which is accurate with the D3 `\.` implementation. The iteration-1 `[._]` expansion that caused the docs/code mismatch has been removed.

---

## Finding 3 (LOW) — TC-017 describe-block title misleading, missing `_` assertion

**File**: `src/core/step/bite-evidence/__tests__/test-file-selection.test.ts:228`

**Status**: ✅ Fixed

**Evidence**: A new assertion was added at lines 245-249:

```typescript
it("TC-017: **/*.test.* does NOT match foo_test_ts (underscore in dot position)", () => {
  // "." in the pattern compiles to "\." — underscore is not a match.
  expect(matchesGlob("foo_test_ts", "**/*.test.*")).toBe(false);
});
```

This confirms the D3 strict-dot behavior: `foo_test_ts` does not match `**/*.test.*` because `\.` requires a literal dot. The describe-block title "literal `.` in a pattern is escaped and does not act as a regex wildcard" is now backed by an assertion that specifically tests the `_` case (returns false), resolving the title/assertion gap.

---

## Finding 4 (MEDIUM) — Ruby example `**/*.spec.rb` fails on standard RSpec `_spec.rb`

**File**: `docs/configuration.md:238`

**Status**: ✅ Fixed

**Evidence**: The Ruby example at line 238 now reads:

```jsonc
{ "verification": { "scopedTestPatterns": ["**/*_spec.rb"] } }
```

Changed from `**/*.spec.rb` (dot separator, would NOT match `user_spec.rb` under D3 `\.`) to `**/*_spec.rb` (underscore, matches standard RSpec convention). This aligns with TC-005 in the test suite and the Go example (`**/*_test.go`) which was already correct.

---

## Summary

All 4 findings from iteration-1 review are verified as fixed in the current code. No regressions detected. No contradictions (fixing A re-introducing B) observed.
