# Implementation Notes: managed-agent-runner-refactor

## Summary

- **result**: completed
- **tasks_completed**: 5/5

## Files Modified

### Source Files

| Path | Operation | Summary |
|---|---|---|
| `src/adapter/managed-agent/error-helpers.ts` | Created | Centralized ErrorInfo construction + throw helpers: `throwSessionCreateError`, `throwSendMessageError`, `throwCaughtAsWrapped`, `buildTimeoutResult`, `throwPollError`. Delegates to `throwWrappedError` from executor-helpers. No JobStateStore dependency. |
| `src/adapter/managed-agent/agent-runner.ts` | Modified | Refactored 633-line file: extracted 3 shared private helpers (`resolveEffectiveTimeout`, `executeFollowUpTurn`, `readSessionUsage`), 3 design-style stage methods (`createDesignSession`, `streamWithPollingFallback`, `verifyDesignArtifacts`), 4 polling-style stage methods (`preparePollingMessage`, `createOrResumePollingSession`, `guardCommit`, `fetchResultFile`). `runDesignStyle` and `runPollingStyle` reduced to thin orchestrators. |

## Blocked Tasks

None.

## Notes

- `runDesignStyle` / `runPollingStyle` method names and public signatures are unchanged
- Design-style error message preserved verbatim: `"Failed to create session: ${errMsg}"` (no stepName, unlike polling side)
- Resume fallback 3-stage error handling preserved: sendUserMessage fail → warn + fallback createSession → throwSessionCreateError("fallback after resume failure") → fallback sendUserMessage → throwSendMessageError("fallback")
- SSE follow-up condition preserved: `sseEndTurn && shouldRunFollowUp(ctx, "success")` (design only runs follow-up on SSE end_turn, not polling fallback)
- `void completedAt` reference in `runPollingStyle` preserved per spec
- verifyBranch warn/GITHUB_TOKEN_EXPIRED rethrow, verifyChangeFolder CHANGE_FOLDER_NOT_FOUND/GITHUB_TOKEN_EXPIRED rethrow — both preserved 1:1
