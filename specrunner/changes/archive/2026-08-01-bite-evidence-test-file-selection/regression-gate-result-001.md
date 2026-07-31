# Regression Gate Result — Iteration 1

## Evidence

### Finding 1 (MEDIUM): diffPathsBetweenCommits fake honors paths argument — FIXED

**File checked**: `tests/unit/core/archive/achieved-assurance-test-file-selection.test.ts`

The new T-06 test file (`achieved-assurance-test-file-selection.test.ts`) defines `makeFakeRuntime` with a `diffPathsBetweenCommits` implementation that explicitly computes the intersection of `editedFiles` with the requested `paths` argument (lines 165–174):

```typescript
async diffPathsBetweenCommits(_baseOid, _headOid, paths, _cwd) {
  const intersection = editedFiles.filter((f) => paths.includes(f));
  return { kind: "success", files: intersection };
},
```

The TC-012 scenario (`editedFiles: [NON_TEST_FILE]`, changedFiles: `[TEST_FILE, NON_TEST_FILE]`) correctly verifies that when `materializedTestFiles` is narrowed to test-only files, the non-test file falls outside the `paths` arg and cannot cause a tamper false-positive.

The existing `completeness-unit.test.ts` fake (lines 238–248) still ignores `_paths`, but the new T-06 scenarios are exclusively in the new file with the paths-honoring fake. The finding is fixed as specified.

---

### Finding 2 (LOW): Glob `.` semantics docs match implementation — FIXED

**File checked**: `src/core/step/bite-evidence/test-file-selection.ts` (line 78), `docs/configuration.md` (line 229)

The implementation changed from `[._]` to strict regex-escape:

```typescript
regex += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
```

`.` now compiles to `\.` and matches only a literal dot. The docs at line 229 state:

> "literal characters (including `.`) match literally"

This is now accurate. The original mismatch (docs said "literally" but implementation used `[._]`) is resolved by fixing the implementation to match the documented semantics.

---

### Finding 3 (LOW): TC-017 title and assertions are consistent — FIXED

**File checked**: `src/core/step/bite-evidence/__tests__/test-file-selection.test.ts` (lines 229–258)

TC-017 describe block title: `"literal '.' in a pattern is escaped and does not act as a regex wildcard"`

A new assertion was added at lines 245–249:

```typescript
it("TC-017: **/*.test.* does NOT match foo_test_ts (underscore in dot position)", () => {
  // "." in the pattern compiles to "\." — underscore is not a match.
  expect(matchesGlob("foo_test_ts", "**/*.test.*")).toBe(false);
});
```

This directly tests the `_` case and confirms it returns `false`, consistent with the strict `\.` implementation. The title is no longer misleading — both the description and the assertion align with the current behavior.

---

### Finding 4 (MEDIUM): Ruby example `**/*.spec.rb` — NOT FIXED

**File checked**: `docs/configuration.md` (line 238)

Current state:

```jsonc
// Ruby project
{ "verification": { "scopedTestPatterns": ["**/*.spec.rb"] } }
```

With the current strict `\.` implementation, `**/*.spec.rb` compiles to `^(?:.*/)?[^/]*\.spec\.rb$`. This matches `user.spec.rb` (dot separator) but **does not match** `user_spec.rb` (underscore) — the standard RSpec convention. A user following this example on a typical RSpec project would get `strategy-deferred` because no test files are selected.

The fix specified in the finding (`["**/*_spec.rb"]`) has not been applied. **Regression confirmed.**

---

## Summary

| # | Severity | Status |
|---|----------|--------|
| 1 | MEDIUM | Fixed ✅ |
| 2 | LOW | Fixed ✅ |
| 3 | LOW | Fixed ✅ |
| 4 | MEDIUM | Not fixed ❌ |
