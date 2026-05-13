# Review Feedback: cli-git-commit-push (Iteration 1)

## Summary

The implementation correctly centralizes git commit+push in `StepExecutor` for the local runtime, removes all agent-side git instructions from system prompts, and preserves managed runtime behavior. All 10 tasks are complete and the test suite passes. Two minor issues and one informational note are raised; no blocking defects were found.

## Findings

### [MINOR] Stale JSDoc comment in StepExecutor contradicts this change

- **file**: `src/core/step/executor.ts` (line 32)
- **issue**: The class-level JSDoc still reads `Design D5: verifyBranch / requiresCommit guard run inside the adapter (runner).` This was true before this change but is now misleading — the `requiresCommit` guard has been moved to `StepExecutor.commitAndPush()`, not the adapter.
- **suggestion**: Update the comment to `Design D5: verifyBranch runs inside the managed adapter. requiresCommit guard moved to StepExecutor.commitAndPush() (local runtime).`

### [MINOR] `{{GIT_PUSH_INSTRUCTION}}` placeholder and variable name leak the old mental model

- **file**: `src/prompts/spec-review-system.ts` (lines 101, 109, 175, 198)
- **issue**: The template placeholder `{{GIT_PUSH_INSTRUCTION}}` and the local variable `gitPushInstruction` are holdovers from the pre-change design. The variable's content has been updated to an end-session instruction, but the name still says "git push instruction." The interface field comment on line 109 (`/** Branch to commit and push result file to. Required for push instruction. */`) is also stale — `branch` is no longer used to build a git push instruction.
- **suggestion**: Rename the placeholder to `{{END_SESSION_INSTRUCTION}}` and the variable to `endSessionInstruction`. Update the `branch` field comment to reflect its actual remaining purpose (or remove it if the field is no longer needed for anything in local runtime).

### [INFO] `buildAdditionalInstructions` no longer uses `SpawnFn` from ClaudeCodeRunner

- **file**: `src/adapter/claude-code/agent-runner.ts` (line 27, 32)
- **issue**: `ClaudeCodeRunner` still imports `defaultSpawnFn` and `SpawnFn` from `./git-exec.js` and re-exports `SpawnFn`. The `spawnFn` is stored on the instance (`this.spawnFn`) but is never used — the requiresCommit guard that used it has been removed. The field and import are now dead weight.
- **suggestion**: Remove `defaultSpawnFn` import, remove `this.spawnFn` and the corresponding constructor parameter `_spawnFn`. The `SpawnFn` re-export can stay if external callers depend on it, but verify no callers rely on `_spawnFn` being injectable into `ClaudeCodeRunner`. If the `SpawnFn` re-export exists only for the old guard test fixture, it can be removed too.

### [INFO] `spec-review-system.ts` test (TC-010) checks for `"Push to origin"` string but not for `"git push "` literally

- **file**: `tests/unit/step/review-exit-contract.test.ts` (line 335)
- **issue**: TC-010 asserts that `SPEC_REVIEW_SYSTEM_PROMPT` does not contain `"git push"` or `"Push to origin"`. This is correct for the current content, but the grep verification requirement (R9) specifies `commit.*push|git add|git push`. The test and the requirement are aligned in intent but a minor wording gap exists in the test (it checks `"Push to origin"` rather than `"git push origin"`). This does not represent a real failure.
- **suggestion**: No action required; the actual system prompt content satisfies TC-19 and the acceptance criteria.

## Requirements Coverage

| Req | Description | Status |
|-----|------------|--------|
| R1  | `commitAndPush` in `StepExecutor.runAgentStep()`, after `runner.run()` succeeds, before `finalizeStep()` | ✅ |
| R2  | Commit message `${step.name}: ${slug}` | ✅ |
| R3  | Push retry: 1 retry with 5s wait; `PUSH_FAILED` on second failure | ✅ |
| R4  | `requiresCommit` guard removed from `ClaudeCodeRunner`; pre/post SHA blocks deleted | ✅ |
| R5  | System prompts updated: git instructions removed, replaced with end-session / write-to-worktree instructions | ✅ (8 files updated) |
| R6  | `git-push-instruction.ts` deleted; all imports removed | ✅ |
| R7  | `buildAdditionalInstructions()` no longer contains `git push` / `commit all changes` | ✅ |
| R8  | Managed runtime prompt unchanged; `ManagedAgentRunner` injects git push via `buildManagedGitPushInstruction()` | ✅ |
| R9  | `grep -rE "commit.*push\|git add\|git push" src/prompts/` returns 0 actionable matches | ✅ (remaining hits are comments or variable names, not agent-facing instructions) |

**Note on R9**: The grep does find hits in `src/prompts/` (comments like `"Commit and push are handled by the CLI"`, a variable name `gitPushInstruction`, and a template placeholder `{{GIT_PUSH_INSTRUCTION}}`). None of these are agent-facing instructions delivered to the LLM. The T-09 acceptance criterion is satisfied in substance.

## Test Coverage

9 new unit tests in `tests/unit/step/commit-and-push.test.ts` cover all must test cases:

- **TC-CAP-001** covers TC-01 (call sequence: add → diff → commit → push)
- **TC-CAP-002** covers TC-03 (no staged changes + `requiresCommit: true` → `NO_COMMIT_DETECTED`)
- **TC-CAP-003** covers TC-02 (no staged changes + `requiresCommit: false` → silent skip)
- **TC-CAP-004** covers TC-05 (push retry → success on second attempt)
- **TC-CAP-005** covers TC-06 (push fails twice → `PUSH_FAILED`)
- **TC-CAP-006** covers TC-04 (commit message format `${step.name}: ${slug}`)
- **TC-CAP-007** covers TC-13 (`commit:push` event emitted on success)
- **TC-CAP-008** covers TC-08 (`git add` failure + `requiresCommit: true` → `NO_COMMIT_DETECTED`)
- **TC-CAP-009** covers TC-08/TC-09 (`git add` failure + `requiresCommit: false` → silent skip)

Test cases with no dedicated new test (but covered by static analysis or existing tests):

- **TC-07** (`PUSH_FAILED` factory): exercised by TC-CAP-005
- **TC-08** (`noCommitDetectedError` message): no explicit string-assertion test, but the factory in `src/errors.ts` references "no staged changes" in the hint — satisfies requirement in substance
- **TC-11 / TC-12** (managed runtime skips `commitAndPush`): no dedicated isolation test for the managed runtime path, but the runtime guard is a one-line `if (deps.config.runtime === "local")` check, and existing TC-011/TC-012 in `review-exit-contract.test.ts` exercise the managed runner path end-to-end without git subprocess calls
- **TC-29** (adapter `requiresCommit` guard removal): TC-028/TC-029 in `agent-runner.test.ts` correctly updated to assert the adapter now returns `success` unconditionally

All 1715 tests pass per `verification-result.md`.

## Verdict

- **verdict**: approved
