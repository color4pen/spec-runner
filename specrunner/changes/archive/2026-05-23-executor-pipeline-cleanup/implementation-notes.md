# Implementation Notes: executor-pipeline-cleanup

## result: completed

## tasks_completed: 3/3

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/core/step/commit-push.ts` | created | Extracted `AUTHORITY_SPEC_PREFIX`, `findAuthoritySpecViolations`, `commitAndPush`, `pushOnly` from executor.ts. Defines `CommitPushInfra` interface for dependency injection. |
| `src/core/step/executor.ts` | modified | Removed private `commitAndPush`/`pushOnly` methods and `AUTHORITY_SPEC_PREFIX`/`findAuthoritySpecViolations`. Added `commitPushInfra` field. Delegates to `commitAndPush` free function from commit-push.ts. |
| `src/core/pipeline/pipeline.ts` | modified | Added `printPipelineFinished` private method. Replaced 3 duplicate `Pipeline finished` stdout blocks with `this.printPipelineFinished(state)`. |
| `specrunner/changes/executor-pipeline-cleanup/tasks.md` | modified | Marked all tasks [x]. |

## Blocked Tasks

None.

## Verification

- `bun run typecheck`: green
- `bun run test`: 242 test files, 2687 tests — all passed
