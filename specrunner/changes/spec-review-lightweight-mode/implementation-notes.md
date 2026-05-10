# Implementation Notes: spec-review lightweight mode enhancement

## Summary

- **result**: completed
- **tasks_completed**: 9/9

## Files Modified

| File | Operation | Description |
|------|-----------|-------------|
| `src/prompts/spec-review-system.ts` | modified | Expanded `buildSpecReviewModeInstruction("lightweight")` to return structured text with Verify/Simplify/Skip sections |
| `src/core/step/types.ts` | modified | Added optional `getMaxTurns?(state: JobState): number \| undefined` to `AgentStep` interface |
| `src/core/step/spec-review.ts` | modified | Added `getMaxTurns` implementation: returns 10 for lightweight types, undefined for full types |
| `src/adapter/claude-code/agent-runner.ts` | modified | Evaluate `step.getMaxTurns?.(state)` before `getStepExecutionConfig`, use result as `dynamicMaxTurns ?? step.maxTurns` |
| `tests/unit/step/spec-review-lightweight.test.ts` | created | New test file covering TC-5.1 through TC-5.5 (14 tests) |
| `openspec/changes/spec-review-lightweight-mode/tasks.md` | modified | Marked all tasks [x] |

## Blocked Tasks

None.

## Notes

- `SpecReviewStep.maxTurns` remains 15 (static fallback for full mode). The `getMaxTurns` override takes priority only for lightweight types.
- The managed agent runner (`src/adapter/managed-agent/agent-runner.ts`) does not use `maxTurns` from step configuration, so no changes were needed there.
- All 126 test files (1215 tests) pass. Typecheck is clean.
