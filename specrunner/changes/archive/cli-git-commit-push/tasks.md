# Tasks: cli-git-commit-push

## T-01: Extract gitExec to shared utility

- [x] Move `gitExec` and `runSubprocess` from `src/adapter/claude-code/git-exec.ts` to `src/util/git-exec.ts`
- [x] Update `src/adapter/claude-code/git-exec.ts` to re-export from `src/util/git-exec.ts` (preserve backward compat for existing imports)
- [x] Update `src/adapter/claude-code/agent-runner.ts` import path if needed
- [x] Verify `bun run typecheck` passes

**受け入れ基準**: `gitExec` is importable from `src/util/git-exec.ts`. Existing code in `src/adapter/claude-code/` continues to compile.

## T-02: Add PUSH_FAILED error code and factory

- [x] Add `PUSH_FAILED: "PUSH_FAILED"` to `ERROR_CODES` in `src/errors.ts`
- [x] Add `pushFailedError(stepName: string, branch: string, detail: string): SpecRunnerError` factory function
- [x] Update `noCommitDetectedError` message to reflect new semantics (staged diff check, not SHA comparison)

**受け入れ基準**: `PUSH_FAILED` is a valid error code. `pushFailedError()` returns a `SpecRunnerError` with code, hint, and message. `noCommitDetectedError` message references "no staged changes" instead of "HEAD SHA unchanged."

## T-03: Add commitAndPush to StepExecutor

- [x] Import `gitExec` (from `src/util/git-exec.ts`) and `SpawnFn` into `src/core/step/executor.ts`
- [x] Add `private readonly spawnFn: SpawnFn` to `StepExecutor` constructor (optional param with default `nodeSpawn`)
- [x] Implement `private async commitAndPush(step, state, deps): Promise<void>` method:
  1. `git add -A` in `deps.cwd`
  2. `git diff --cached --quiet` — exit code 0 means no changes
  3. If no changes AND `step.requiresCommit === true`: throw `noCommitDetectedError`
  4. If no changes AND `requiresCommit` is falsy: return silently (no commit needed)
  5. `git commit -m "${step.name}: ${deps.slug}"`
  6. `git push origin ${state.branch}` — on failure, wait 5s, retry once
  7. If second push fails: throw `pushFailedError`
- [x] Call `commitAndPush()` in `runAgentStep()` after `runner.run()` succeeds (before `finalizeStep()`)
- [x] Guard with runtime check: only execute for local runtime (check `deps.config.runtime === "local"` or absence of managed runtime indicators)
- [x] Emit event `commit:push` with `{ step: step.name, branch: state.branch }` on successful push

**受け入れ基準**: After agent completes, StepExecutor automatically stages, commits, and pushes. `requiresCommit: true` steps error on empty diff. Push retries once on failure. Managed runtime skips this entirely.

## T-04: Remove requiresCommit guard from ClaudeCodeRunner

- [x] Remove the pre-run SHA snapshot block (lines ~122-125 of `src/adapter/claude-code/agent-runner.ts`): `let preRunHeadSha` and the `gitExec(... ["rev-parse", ctx.branch])` call
- [x] Remove the post-run SHA comparison block (lines ~226-253): the `step.requiresCommit && ctx.branch` guard, `branchExists` check, and `postRunHeadSha === preRunHeadSha` comparison
- [x] Verify that `ClaudeCodeRunner.run()` no longer references `requiresCommit`

**受け入れ基準**: `grep -n "requiresCommit" src/adapter/claude-code/agent-runner.ts` returns 0 matches. `grep -n "preRunHeadSha" src/adapter/claude-code/agent-runner.ts` returns 0 matches.

## T-05: Remove git push instruction from ClaudeCodeRunner.buildAdditionalInstructions

- [x] Remove the line `- After completing the task, commit all changes and push: git push origin ${branch}` from `buildAdditionalInstructions()` in `src/adapter/claude-code/agent-runner.ts`
- [x] Replace with: `- After completing your task, end your session. The CLI will handle commit and push.`

**受け入れ基準**: `buildAdditionalInstructions()` no longer contains `git push` or `commit all changes`. The instruction tells the agent to end the session instead.

## T-06: Delete git-push-instruction.ts and remove all imports

- [x] Delete `src/prompts/git-push-instruction.ts`
- [x] Remove import and usage of `buildGitPushInstruction` from `src/core/step/implementer.ts` (line 9, usage line 70)
- [x] Remove import and usage from `src/core/step/spec-fixer.ts` (line 8, usage line 49)
- [x] Remove import and usage from `src/core/step/code-fixer.ts` (line 8, usage line 97)
- [x] Remove import and usage from `src/core/step/build-fixer.ts` (line 8, usage line 96)
- [x] Remove import and usage from `src/core/step/code-review.ts` (line 8, usage line 112)
- [x] Remove import and usage from `src/prompts/test-case-gen-system.ts` (line 1, usage line 192)
- [x] Remove import and usage from `src/prompts/spec-review-system.ts` (line 1, usage line 177)
- [x] In each `buildMessage()`, replace the git push instruction placeholder with an end-session instruction (e.g., "ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。")

**受け入れ基準**: `src/prompts/git-push-instruction.ts` does not exist. `grep -r "buildGitPushInstruction" src/` returns 0 matches. Each step's `buildMessage` contains end-session instruction instead of git push instruction.

## T-07: Update system prompts to remove git commit/push instructions (local runtime)

The following 8 system prompt files need git instruction removal. For each file, replace all "commit + push" instructions with "ファイルを worktree に書き出したら end_turn してください" or equivalent:

- [x] `src/prompts/propose-system.ts`:
  - Line 16: remove "commit + push します" from role description
  - Line 35: "実装が完了したら branch に commit + push する" → remove or replace
  - Line 41: "3. 全ファイルを branch に commit + push する" → "3. 全ファイルを worktree に書き出す"
  - Line 42: "4. push が完了するまで..." → "4. 全ファイルの生成が完了するまで end_turn しないこと"
  - Line 144: "渡された branch 名でそのまま commit + push してください" → "ファイルを書き出したら end_turn してください"
  - Line 176: "commit + push せずに end_turn すること" (禁止事項) → "ファイルを書き出さずに end_turn すること"
  - Line 182-186: 完了条件 — remove commit/push conditions, replace with file existence
  - Line 196: security section — update role description
  - Line 213: PROPOSE_INITIAL_MESSAGE_TEMPLATE — "Commit them on branch" → "Write them under"
- [x] `src/prompts/implementer-system.ts`:
  - Line 3: comment — remove "commits, and pushes"
  - Line 16: "commit + push することです" → "worktree に書き出すことです"
  - Line 35: "5. 実装が完了したら branch に commit + push する" → "5. 実装が完了したら end_turn する"
  - Line 36: "6. push が完了するまで session を終了しないこと" → remove
- [x] `src/prompts/spec-fixer-system.ts`:
  - Line 23: "3. 修正が完了したら必ずブランチに commit + push する" → "3. 修正が完了したら end_turn する"
- [x] `src/prompts/code-fixer-system.ts`:
  - Line 4: comment — remove "commits and pushes"
  - Line 6: "commit + push します" → "worktree に書き出します"
  - Line 10: "branch に commit + push することです" → "worktree に書き出すことです"
  - Line 31: "4. 修正が完了したら branch に commit + push する" → "4. 修正が完了したら end_turn する"
- [x] `src/prompts/build-fixer-system.ts`:
  - Line 10: "commit + push することです" → "worktree に書き出すことです"
  - Line 24: "4. 修正が完了したら branch に commit + push する" → "4. 修正が完了したら end_turn する"
- [x] `src/prompts/code-review-system.ts`:
  - Line 18: "You MUST commit and push the review-feedback file" → "You MUST write the review-feedback file to the worktree"
  - Line 74: "You MUST commit and push the review-feedback file" → "You MUST write the review-feedback file before completing the session"
- [x] `src/prompts/spec-review-system.ts`:
  - Line 111: comment — remove "commit and push"
  - Line 175-178: replace git push instruction block with end-session instruction
- [x] `src/prompts/test-case-gen-system.ts`:
  - Line 192: replace `buildGitPushInstruction(branch)` usage with end-session instruction

**受け入れ基準**: `grep -rE "commit.*push|git add|git push" src/prompts/` returns 0 matches (excluding comments that reference the old pattern for documentation). All prompts instruct the agent to write files and end_turn instead of committing.

## T-08: Inject git push instructions for managed runtime

- [x] In `src/adapter/managed-agent/agent-runner.ts`, ensure `additionalInstructions` includes git commit/push instructions (this likely already works via the existing system prompt path, but verify)
- [x] If managed runtime relies on system prompts for git instructions (now removed in T-07), add git push instruction injection in `ManagedAgentRunner`'s prompt construction, similar to how `buildAdditionalInstructions` works for local runtime but with the opposite content
- [x] Verify managed runtime's `buildMessage` or equivalent still produces prompts with git commit/push instructions

**受け入れ基準**: Managed runtime agents still receive git commit/push instructions. The managed adapter injects these via its own `additionalInstructions` mechanism, independent of system prompts.

## T-09: Grep verification

- [x] Run `grep -rE "commit.*push|git add|git push" src/prompts/` and verify 0 matches
- [x] Run `grep -r "buildGitPushInstruction" src/` and verify 0 matches
- [x] Run `grep -r "git-push-instruction" src/` and verify 0 matches
- [x] Run `grep -n "requiresCommit" src/adapter/claude-code/` and verify 0 matches
- [x] Verify managed adapter still contains git push instructions: `grep -r "commit.*push\|git push" src/adapter/managed-agent/` returns matches
- [x] Run `bun run typecheck` — all pass
- [x] Run `bun run test` — all pass

**受け入れ基準**: All grep checks pass. typecheck and test suite green.

## T-10: Update tests

- [x] Add unit test for `commitAndPush()` — mock `gitExec`, verify call sequence: add → diff check → commit → push
- [x] Add test: `requiresCommit: true` + no diff → `NO_COMMIT_DETECTED` error
- [x] Add test: `requiresCommit: false` + no diff → silent skip (no error)
- [x] Add test: push failure → retry once → success on second attempt
- [x] Add test: push failure → retry once → second failure → `PUSH_FAILED` error
- [x] Add test: commit message format is `${step.name}: ${slug}`
- [x] Update existing `ClaudeCodeRunner` tests that assert `NO_COMMIT_DETECTED` behavior (TC-028) — these should now test that the adapter does NOT check `requiresCommit`
- [x] Update existing tests that mock agent git push behavior to reflect the new flow

**受け入れ基準**: All new tests pass. Existing test suite adapted to new architecture. No test references the old SHA-comparison guard.
