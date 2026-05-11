# Implementation Notes: add-spec-review-baseline-check

## Summary

- **result**: completed
- **tasks_completed**: 6/6

## Files Modified

| File | Operation | Description |
|------|-----------|-------------|
| `src/git/dynamic-context.ts` | modified | Added optional `baselineSpecs?: Record<string, string>` field to `DynamicContext` interface |
| `src/core/step/types.ts` | modified | Added optional `enrichContext?` method to `AgentStep` interface; added `DynamicContext` import |
| `src/adapter/claude-code/agent-runner.ts` | modified | Changed `stepCtx` from `const` to `let`; added `enrichContext` call before `buildMessage` |
| `src/adapter/managed-agent/agent-runner.ts` | modified | Changed `stepCtx` from `const` to `let`; added `enrichContext` call before `buildMessage` in `runPollingStyle` |
| `src/core/step/spec-review.ts` | modified | Added `enrichContext` implementation; updated `buildMessage` to pass `baselineSpecs` from dynamicContext; added `fs`, `path`, `changeFolderPath`, `baselineSpecPath` imports |
| `src/prompts/spec-review-system.ts` | modified | Added baseline consistency check section to system prompt; added `{{BASELINE_SPECS}}` template variable; added `baselineSpecs` field to `SpecReviewPromptInput`; added expansion logic in `buildSpecReviewInitialMessage` |
| `tests/git/dynamic-context.test.ts` | modified | Added TC-002: asserts `collectDynamicContext` does not set `baselineSpecs` |
| `tests/prompts/spec-review-system.test.ts` | created | New test file covering TC-003, TC-010, TC-015 through TC-022 (21 tests) |
| `specrunner/changes/add-spec-review-baseline-check/tasks.md` | modified | Marked all tasks [x] |

## Blocked Tasks

None.

## Notes

- `enrichContext` is only invoked when defined on a Step. Existing steps (ProposeStep, ImplementerStep, etc.) do not define it, so all existing tests pass without regression.
- Both adapters (ClaudeCodeRunner and ManagedAgentRunner.runPollingStyle) call `enrichContext` before `buildMessage`. ManagedAgentRunner.runProposeStyle does not call it — propose is SSE-style and SpecReviewStep uses polling style.
- The design explicitly excludes unit tests for `enrichContext`'s I/O behavior (design.md: "enrichContext の unit test は追加しない"). Integration is verified by the full test suite passing (1610 tests).
- `bun run typecheck` passes with 0 errors. `bun run test` passes 1610/1610 tests.
