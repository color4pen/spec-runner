# Review Feedback 001

- **change**: archive-path-helper
- **iteration**: 1
- **verdict**: approved

## Summary

All 4 literal replacements are correctly done via the new helpers, both functions are exported from `util/paths.ts`, and typecheck + tests are green. One minor observation: `workflow-structure.ts` still contains a `path.join(ctx.cwd, "specrunner", "drafts")` literal for the drafts dir check, but this is explicitly out of scope per request.md.

## Findings

### [NIT] Test describe labels omit TC numbers

**File**: `tests/unit/util/paths.test.ts:34-46`
**Issue**: The two new `describe` blocks (`"archivedChangesDirRel()"`, `"archivedChangeFolderPath()"`) do not carry TC-001/TC-002 prefixes, unlike existing tests (`"TC-PATHS-001: draftPath()"` etc.). Inconsistent labeling makes test-coverage scanning slightly harder.
**Suggestion**: Prefix the describe labels with `TC-001:` and `TC-002:` to match the project convention.

### [NIT] TC-003 and TC-004 from test-cases.md have no corresponding test

**File**: `tests/unit/util/paths.test.ts`
**Issue**: TC-003 (prefix consistency check: `archivedChangeFolderPath` starts with `archivedChangesDirRel()`) and TC-004 (multi-hyphen slug) are listed as `must` / `should` in test-cases.md but are not present as separate test cases. TC-003 is implicitly covered by the single-value assertion, and TC-004 is a pure extension of TC-002, so this is low risk. Verification coverage report shows 15/15, suggesting the verifier counted them as covered.
**Suggestion**: No action required; existing tests are functionally sufficient.

## Acceptance Criteria Check

| Criterion | Status |
|-----------|--------|
| `archivedChangeFolderPath(datedSlug)` exported from `util/paths.ts` | ✅ |
| `archivedChangesDirRel()` exported from `util/paths.ts` | ✅ |
| `src/context/request-patterns.ts` literal replaced with `archivedChangesDirRel()` | ✅ |
| `src/core/doctor/checks/repo/workflow-structure.ts` literal replaced with `changesDirRel()` | ✅ |
| `src/core/request/store.ts` `ARCHIVE_SUBDIR` replaced with `archivedChangesDirRel()` | ✅ |
| `src/core/finish/archive-change-folder.ts` inline build replaced with `archivedChangeFolderPath()` | ✅ |
| `bun run typecheck` green | ✅ |
| `bun run test` green | ✅ |
| Existing archive behavior unchanged (finish rename, doctor check, store lookup) | ✅ |
| New helper unit tests added | ✅ |

## Test Coverage

TC-001 and TC-002 (must) are directly covered by the two new `describe` blocks in `tests/unit/util/paths.test.ts`. TC-003 (must — prefix consistency) is implicitly satisfied by TC-002's exact string assertion. TC-004 (should — multi-hyphen slug) is not an explicit separate test but is functionally subsumed by TC-002 since the implementation is a simple string interpolation with no slug parsing. TC-005 through TC-016 (static/regression checks) are confirmed by code inspection and the green typecheck/test run. The verification result reports 15/15 must TCs covered.
