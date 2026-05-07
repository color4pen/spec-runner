# Implementation Notes

## Summary

- **result**: completed
- **tasks_completed**: 17/17

## Files Modified

| Path | Operation | Description |
|------|-----------|-------------|
| `src/config/type-config.ts` | created | TYPE_CONFIG module: 5 types, getBranchPrefix, getSpecReviewMode |
| `src/parser/request-md.ts` | modified | Replaced ALLOWED_TYPES constant with TYPE_CONFIG-derived isAllowedType |
| `src/state/job-slug.ts` | modified | BRANCH_PREFIXES derived from Object.values(TYPE_CONFIG).map(c => c.branchPrefix) |
| `src/core/step/propose.ts` | modified | buildMessage uses getBranchPrefix(deps.request.type) instead of hardcoded feat/ |
| `src/core/step/executor.ts` | modified | setsBranch fallback uses getBranchPrefix(deps.request.type) instead of hardcoded feat/ |
| `src/core/step/spec-review.ts` | modified | buildMessage passes specReviewMode: getSpecReviewMode(state.request.type) |
| `src/prompts/spec-review-system.ts` | modified | Added specReviewMode field to SpecReviewPromptInput, {{SPEC_REVIEW_MODE}} placeholder, buildSpecReviewModeInstruction |
| `tests/config/type-config.test.ts` | created | Tests for TYPE_CONFIG, getBranchPrefix, getSpecReviewMode |
| `tests/parser.test.ts` | modified | Added TC-2.5: spec-change and refactoring parse without warning |
| `openspec/changes/add-spec-change-to-allowed-types/tasks.md` | modified | All tasks marked [x] |

## Blocked Tasks

None.

## Verification

- `bun run typecheck`: green (0 errors)
- `bun run test`: green (115 files, 1067 tests)
