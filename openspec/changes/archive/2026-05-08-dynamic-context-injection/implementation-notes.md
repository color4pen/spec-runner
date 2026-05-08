# Implementation Notes — dynamic-context-injection

- **result**: completed
- **tasks_completed**: 15/15

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/git/dynamic-context.ts` | created | DynamicContext interface and collectDynamicContext() function using node:child_process execFile |
| `src/core/types.ts` | modified | Added `dynamicContext?: DynamicContext` to StepContext interface (import added) |
| `src/core/command/runner.ts` | modified | Injected collectDynamicContext() call after buildDeps(), sets deps.dynamicContext once per pipeline run |
| `src/core/port/agent-runner.ts` | modified | Added `dynamicContext?: DynamicContext` to AgentRunContext interface (import added) |
| `src/core/step/executor.ts` | modified | Included `dynamicContext: deps.dynamicContext` in ctx passed to AgentRunner.run() |
| `src/adapter/claude-code/agent-runner.ts` | modified | Included `dynamicContext: ctx.dynamicContext` in stepCtx passed to step.buildMessage() |
| `src/adapter/managed-agent/agent-runner.ts` | modified | Included `dynamicContext: ctx.dynamicContext` in stepCtx passed to step.buildMessage() |
| `src/prompts/propose-system.ts` | modified | Extended buildInitialMessage() with optional dynamicContext; appends specsList/changesList sections |
| `src/core/step/propose.ts` | modified | Passes deps.dynamicContext to buildInitialMessage() |
| `src/core/step/implementer.ts` | modified | Exported buildImplementerInitialMessage(); extended with optional dynamicContext; appends gitLog/diffStat sections |
| `src/core/step/code-review.ts` | modified | Exported buildCodeReviewInitialMessage(); extended with optional dynamicContext; appends diffStat section |
| `tests/git/dynamic-context.test.ts` | created | Unit tests for collectDynamicContext (shape, fallback, missing dirs, archive exclusion, .md filtering) |
| `tests/prompts/dynamic-context-prompts.test.ts` | created | Unit tests for buildInitialMessage, buildImplementerInitialMessage, buildCodeReviewInitialMessage with/without dynamicContext |
| `openspec/changes/dynamic-context-injection/tasks.md` | modified | All tasks marked [x] |

## Blocked Tasks

None. All 15 tasks completed.

## Notes

- `buildImplementerInitialMessage` and `buildCodeReviewInitialMessage` were made `export` so they can be directly imported in tests (they were previously unexported module-private functions).
- The `_branch` parameter in `collectDynamicContext` is retained in the signature per the interface contract but unused internally (git log/diff always compares against `main`, not the current branch name).
- Tests for collectDynamicContext avoid `vi.mock("node:child_process")` in nested describe blocks (vitest hoisting limitation) and instead rely on the real behavior: running in a non-git temp directory causes fallback to empty strings.
