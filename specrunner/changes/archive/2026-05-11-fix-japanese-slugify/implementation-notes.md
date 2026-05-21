# Implementation Notes: fix-japanese-slugify

## Summary

- **result**: completed
- **tasks_completed**: 6/6

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/util/slugify.ts` | modified | Changed non-ASCII removal regex from `/[^\x00-\x7F]/g, ""` to `/[^\x00-\x7F]+/g, " "` so consecutive non-ASCII chars become a word boundary (space) instead of being silently dropped. Updated JSDoc comment to match. |
| `tests/unit/util/slugify.test.ts` | modified | Added TC-SL-007 through TC-SL-015 covering Japanese-mixed inputs, word boundary behavior, truncation, and custom maxLength. |
| `specrunner/changes/fix-japanese-slugify/tasks.md` | modified | Marked all tasks complete. |

## Blocked Tasks

None.

## Test Cases

All must test cases implemented:
- TC-SL-007: Japanese-mixed description → ASCII slug `pipeline-pr-url-stdout`
- TC-SL-008: slug length ≤ 50 for Japanese-mixed input
- TC-SL-009: Japanese as word boundary between ASCII tokens
- TC-SL-010: Japanese-only → `untitled`
- TC-SL-011: single ASCII char between non-ASCII → that char (not `untitled`)
- TC-SL-012: multiple non-ASCII blocks each collapse to one hyphen
- TC-SL-013: no trailing hyphen after truncation
- TC-SL-014: empty string → `untitled` (regression)
- TC-SL-015: custom maxLength with Japanese-mixed input

All 1661 tests pass (143 test files). Typecheck clean.
