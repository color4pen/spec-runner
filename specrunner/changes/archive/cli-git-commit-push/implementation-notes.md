# Implementation Notes: cli-git-commit-push

## Summary

- **result**: completed
- **tasks_completed**: 10/10
- **test_cases**: 9 new tests (TC-CAP-001 through TC-CAP-009), all passing; 1715 total tests passing

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/util/git-exec.ts` | created | Shared git subprocess utility: SpawnFn, defaultSpawnFn, runSubprocess, gitExec, gitExecExitCode |
| `src/adapter/claude-code/git-exec.ts` | modified | Re-exports from `../../util/git-exec.js` for backward compatibility |
| `src/adapter/claude-code/agent-runner.ts` | modified | Removed requiresCommit guard (preRunHeadSha/postRunHeadSha blocks); updated buildAdditionalInstructions to end_turn instruction |
| `src/adapter/managed-agent/agent-runner.ts` | modified | Added buildManagedGitPushInstruction helper; appends git push instructions to initialMessage for managed runtime |
| `src/core/step/executor.ts` | modified | Added commitAndPush() private method; constructor accepts spawnFn and sleepFn; calls commitAndPush after runner.run() for local runtime |
| `src/errors.ts` | modified | Added PUSH_FAILED error code and pushFailedError() factory; updated noCommitDetectedError message |
| `src/prompts/git-push-instruction.ts` | deleted | Removed shared git push instruction utility |
| `src/prompts/propose-system.ts` | modified | Removed commit+push instructions; replaced with worktree/end_turn wording |
| `src/prompts/implementer-system.ts` | modified | Removed commit+push steps; replaced with end_turn |
| `src/prompts/spec-fixer-system.ts` | modified | Removed commit+push step; replaced with end_turn |
| `src/prompts/code-fixer-system.ts` | modified | Removed commit+push step; replaced with end_turn |
| `src/prompts/build-fixer-system.ts` | modified | Removed commit+push step; replaced with end_turn |
| `src/prompts/code-review-system.ts` | modified | Updated delivery instructions to write to worktree instead of commit+push |
| `src/prompts/spec-review-system.ts` | modified | Removed buildGitPushInstruction import; replaced with static end-session instruction |
| `src/prompts/test-case-gen-system.ts` | modified | Removed buildGitPushInstruction import; replaced with static end-session instruction |
| `src/core/step/implementer.ts` | modified | Removed buildGitPushInstruction import and usage |
| `src/core/step/spec-fixer.ts` | modified | Removed buildGitPushInstruction import and usage |
| `src/core/step/code-fixer.ts` | modified | Removed buildGitPushInstruction import and usage |
| `src/core/step/build-fixer.ts` | modified | Removed buildGitPushInstruction import and usage |
| `src/core/step/code-review.ts` | modified | Removed buildGitPushInstruction import and usage |
| `tests/unit/step/commit-and-push.test.ts` | created | 9 unit tests for commitAndPush(): call sequence, requiresCommit scenarios, push retry, PUSH_FAILED, commit message format, event emission |
| `tests/prompts/implementer-system.test.ts` | modified | Updated assertion to expect end_turn instead of commit+push |
| `tests/prompts/spec-fixer-system.test.ts` | modified | Updated assertion to expect end_turn instead of commit+push |
| `tests/unit/step/review-exit-contract.test.ts` | modified | TC-010 rewritten to verify end_turn/worktree instructions instead of git push |
| `tests/unit/adapter/claude-code/agent-runner.test.ts` | modified | TC-028/TC-029 updated to expect success (requiresCommit guard removed from adapter) |

## Implementation Decisions

**sleepFn injectable**: The 5-second retry delay in commitAndPush is injectable via StepExecutor constructor (4th param). Tests pass a no-op to avoid slow tests without fake timers.

**git add non-zero exit handling**: If `git add -A` exits non-zero (e.g., not a git repo, exit 128), the method checks `requiresCommit` and either throws or returns silently. This prevents integration test timeouts that occurred when temp test dirs were not git repos.

**diffExitCode semantics**: Only exit code `1` from `git diff --cached --quiet` means staged changes. Any other non-zero (e.g., 128) is treated as no changes to avoid false positives.

**Managed runtime**: `ManagedAgentRunner.runPollingStyle` appends git push instructions via `buildManagedGitPushInstruction(branch)` when `state.branch` is set. This preserves the git push behavior for managed runtime while keeping local runtime clean.

## Blocked Tasks

None.
