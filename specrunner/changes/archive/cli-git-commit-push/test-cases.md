# Test Cases: cli-git-commit-push

## Metadata

- **slug**: cli-git-commit-push
- **generated**: 2026-05-13
- **source**: request.md + design.md + tasks.md

---

## TC-01: commitAndPush — normal flow with staged changes

- **Category**: Unit / StepExecutor
- **Priority**: must
- **Source**: T-03, D2, acceptance criteria

**GIVEN** a local-runtime step completes successfully and `git add -A` stages one or more changed files  
**WHEN** `commitAndPush()` is called  
**THEN** `git add -A` runs first, then `git diff --cached --quiet` exits with code 1 (changes detected), then `git commit -m "${step.name}: ${slug}"` runs, then `git push origin ${branch}` runs, and the method resolves without error

---

## TC-02: commitAndPush — no changes, requiresCommit false

- **Category**: Unit / StepExecutor
- **Priority**: must
- **Source**: T-03, D3, requirement 1

**GIVEN** a local-runtime step (e.g. code-review) where `requiresCommit` is falsy and `git add -A` produces no staged diff  
**WHEN** `commitAndPush()` is called  
**THEN** `git diff --cached --quiet` exits with code 0, no `git commit` is executed, no `git push` is executed, and the method returns silently with no error

---

## TC-03: commitAndPush — no changes, requiresCommit true → NO_COMMIT_DETECTED

- **Category**: Unit / StepExecutor
- **Priority**: must
- **Source**: T-03, requirement 1, acceptance criteria

**GIVEN** a local-runtime step with `requiresCommit: true` (e.g. implementer) and `git add -A` stages nothing  
**WHEN** `commitAndPush()` is called  
**THEN** `git diff --cached --quiet` exits with code 0, and `commitAndPush()` throws `NO_COMMIT_DETECTED` error — no commit or push is attempted

---

## TC-04: Commit message format

- **Category**: Unit / StepExecutor
- **Priority**: must
- **Source**: T-03, T-10, D4, requirement 2, acceptance criteria

**GIVEN** a step named `"implementer"` and a job slug `"add-git-commit-to-executor"`  
**WHEN** `commitAndPush()` executes the commit  
**THEN** the git commit message is exactly `"implementer: add-git-commit-to-executor"`

---

## TC-05: Push retry — succeeds on second attempt

- **Category**: Unit / StepExecutor
- **Priority**: must
- **Source**: T-03, T-10, D5, requirement 3

**GIVEN** `git push` fails on the first attempt with a transient error  
**WHEN** `commitAndPush()` retries after 5 seconds  
**THEN** the second push succeeds and the method resolves without error; total push attempt count is 2

---

## TC-06: Push retry — fails twice → PUSH_FAILED error

- **Category**: Unit / StepExecutor
- **Priority**: must
- **Source**: T-03, T-10, D5, requirement 3, acceptance criteria

**GIVEN** `git push` fails on both the first and second (retry) attempts  
**WHEN** `commitAndPush()` performs the retry sequence  
**THEN** `pushFailedError(stepName, branch, detail)` is thrown, the error code is `"PUSH_FAILED"`, the error is recorded in state, and escalation is triggered

---

## TC-07: PUSH_FAILED error factory

- **Category**: Unit / Errors
- **Priority**: must
- **Source**: T-02

**GIVEN** `pushFailedError("implementer", "change/foo-abc123", "exit code 128")`  
**WHEN** the factory function is called  
**THEN** the returned `SpecRunnerError` has `code === "PUSH_FAILED"`, a non-empty `message` referencing the step name and branch, and a non-empty `hint` field

---

## TC-08: noCommitDetectedError updated message

- **Category**: Unit / Errors
- **Priority**: should
- **Source**: T-02

**GIVEN** `noCommitDetectedError` is invoked  
**WHEN** the error message is inspected  
**THEN** the message references "no staged changes" (or equivalent) and does NOT reference "HEAD SHA unchanged" or SHA comparison

---

## TC-09: gitExec importable from shared utility path

- **Category**: Unit / Infrastructure
- **Priority**: must
- **Source**: T-01

**GIVEN** `src/util/git-exec.ts` exists after T-01 is implemented  
**WHEN** `import { gitExec } from "src/util/git-exec"` is executed  
**THEN** the import resolves successfully and `gitExec` is a callable function; `bun run typecheck` reports 0 errors

---

## TC-10: Backward-compat re-export from original path

- **Category**: Unit / Infrastructure
- **Priority**: should
- **Source**: T-01

**GIVEN** existing code in `src/adapter/claude-code/` still imports `gitExec` from `src/adapter/claude-code/git-exec.ts`  
**WHEN** `bun run typecheck` is run  
**THEN** no import errors are reported — the original module re-exports from `src/util/git-exec.ts`

---

## TC-11: managed runtime skips commitAndPush entirely

- **Category**: Unit / Runtime Guard
- **Priority**: must
- **Source**: T-03, D1, requirement, acceptance criteria

**GIVEN** a step running under managed runtime (runtime is not `"local"`)  
**WHEN** `runAgentStep()` completes  
**THEN** `commitAndPush()` is never called; no `git add`, `git commit`, or `git push` subprocess is spawned

---

## TC-12: local runtime executes commitAndPush after runner.run()

- **Category**: Unit / Runtime Guard
- **Priority**: must
- **Source**: T-03, D1

**GIVEN** a step running under local runtime  
**WHEN** `runner.run()` returns successfully  
**THEN** `commitAndPush()` is called before `finalizeStep()`

---

## TC-13: commit:push event emitted on successful push

- **Category**: Unit / Events
- **Priority**: should
- **Source**: T-03

**GIVEN** `commitAndPush()` completes a successful push  
**WHEN** the event bus is observed  
**THEN** a `"commit:push"` event is emitted containing `{ step: step.name, branch: state.branch }`

---

## TC-14: requiresCommit removed from ClaudeCodeRunner

- **Category**: Static Analysis / Adapter
- **Priority**: must
- **Source**: T-04, requirement 4, acceptance criteria

**GIVEN** the updated `src/adapter/claude-code/agent-runner.ts`  
**WHEN** `grep -n "requiresCommit" src/adapter/claude-code/agent-runner.ts` is run  
**THEN** the command returns 0 matches

---

## TC-15: pre-run SHA snapshot removed from ClaudeCodeRunner

- **Category**: Static Analysis / Adapter
- **Priority**: must
- **Source**: T-04

**GIVEN** the updated `src/adapter/claude-code/agent-runner.ts`  
**WHEN** `grep -n "preRunHeadSha" src/adapter/claude-code/agent-runner.ts` is run  
**THEN** the command returns 0 matches

---

## TC-16: buildAdditionalInstructions contains end-session instruction, not git push

- **Category**: Static Analysis / Adapter
- **Priority**: must
- **Source**: T-05, requirement 7, acceptance criteria

**GIVEN** the updated `buildAdditionalInstructions()` in `src/adapter/claude-code/agent-runner.ts`  
**WHEN** the function output is inspected  
**THEN** the output does NOT contain `"git push"` or `"commit all changes"`, and DOES contain an instruction telling the agent to end the session

---

## TC-17: git-push-instruction.ts deleted

- **Category**: Static Analysis / Prompts
- **Priority**: must
- **Source**: T-06, requirement 6, acceptance criteria

**GIVEN** the implementation is complete  
**WHEN** `ls src/prompts/git-push-instruction.ts` is checked  
**THEN** the file does not exist

---

## TC-18: buildGitPushInstruction has no remaining imports

- **Category**: Static Analysis / Prompts
- **Priority**: must
- **Source**: T-06, acceptance criteria

**GIVEN** `git-push-instruction.ts` has been deleted  
**WHEN** `grep -r "buildGitPushInstruction" src/` is run  
**THEN** the command returns 0 matches

---

## TC-19: src/prompts/ contains no git commit/push instructions

- **Category**: Static Analysis / Prompts
- **Priority**: must
- **Source**: T-07, T-09, requirement 5, acceptance criteria

**GIVEN** all 8 system prompt files have been updated  
**WHEN** `grep -rE "commit.*push|git add|git push" src/prompts/` is run  
**THEN** the command returns 0 matches

---

## TC-20: propose-system.ts instructs agent to write files and end_turn

- **Category**: Static Analysis / Prompts
- **Priority**: must
- **Source**: T-07

**GIVEN** the updated `src/prompts/propose-system.ts`  
**WHEN** the file content is inspected  
**THEN** no line contains "commit + push"; the completion condition references writing files to worktree or end_turn rather than git operations

---

## TC-21: implementer-system.ts instructs agent to write files and end_turn

- **Category**: Static Analysis / Prompts
- **Priority**: must
- **Source**: T-07

**GIVEN** the updated `src/prompts/implementer-system.ts`  
**WHEN** the file content is inspected  
**THEN** no line contains "commit + push" or "push が完了するまで session を終了しないこと"; the step instructions end with end_turn

---

## TC-22: code-review-system.ts instructs agent to write review file, not commit

- **Category**: Static Analysis / Prompts
- **Priority**: must
- **Source**: T-07

**GIVEN** the updated `src/prompts/code-review-system.ts`  
**WHEN** the file content is inspected  
**THEN** "You MUST commit and push the review-feedback file" is replaced with an instruction to write the file to the worktree before completing the session

---

## TC-23: managed adapter still contains git push instructions

- **Category**: Static Analysis / Managed Runtime
- **Priority**: must
- **Source**: T-08, requirement 8, acceptance criteria

**GIVEN** the managed runtime adapter at `src/adapter/managed-agent/`  
**WHEN** `grep -rE "commit.*push|git push" src/adapter/managed-agent/` is run  
**THEN** the command returns at least 1 match — managed agents still receive git instructions

---

## TC-24: managed runtime git instructions independent of system prompts

- **Category**: Unit / Managed Runtime
- **Priority**: should
- **Source**: T-08, D6

**GIVEN** system prompts have been updated to remove git instructions  
**WHEN** a managed runtime agent receives its full prompt (additionalInstructions + system prompt)  
**THEN** the combined prompt still includes git commit/push instructions injected by the managed adapter's own mechanism

---

## TC-25: SpawnFn injection — default uses node:child_process.spawn

- **Category**: Unit / StepExecutor
- **Priority**: should
- **Source**: T-03, D7

**GIVEN** `StepExecutor` is instantiated without providing a `spawnFn` argument  
**WHEN** `commitAndPush()` is called  
**THEN** it uses `node:child_process.spawn` as the default subprocess execution mechanism, without importing adapter internals

---

## TC-26: SpawnFn injection — test can substitute mock spawn

- **Category**: Unit / Testability
- **Priority**: should
- **Source**: T-03, T-10, D7

**GIVEN** a test that injects a mock `spawnFn` into `StepExecutor`  
**WHEN** `commitAndPush()` runs git operations  
**THEN** the mock captures all subprocess calls, enabling verification of command sequence and arguments without invoking real git

---

## TC-27: typecheck passes after all changes

- **Category**: Build / Verification
- **Priority**: must
- **Source**: T-09, T-01, acceptance criteria

**GIVEN** all tasks T-01 through T-08 are implemented  
**WHEN** `bun run typecheck` is run  
**THEN** the command exits with code 0 and reports 0 type errors

---

## TC-28: test suite passes after all changes

- **Category**: Build / Verification
- **Priority**: must
- **Source**: T-09, T-10, acceptance criteria

**GIVEN** all tasks T-01 through T-08 are implemented and unit tests updated per T-10  
**WHEN** `bun run test` is run  
**THEN** the command exits with code 0 with all tests passing

---

## TC-29: existing TC-028 (NO_COMMIT_DETECTED) tests updated

- **Category**: Regression / Tests
- **Priority**: must
- **Source**: T-10

**GIVEN** existing tests that assert `NO_COMMIT_DETECTED` behavior via the old SHA-comparison guard in `ClaudeCodeRunner`  
**WHEN** those tests are updated  
**THEN** they verify that the adapter does NOT check `requiresCommit`, and that the `NO_COMMIT_DETECTED` path is exercised via `commitAndPush()` in `StepExecutor` instead

---

## TC-30: git-push-instruction.ts import removed from all 7 source files

- **Category**: Static Analysis / Prompts
- **Priority**: must
- **Source**: T-06

**GIVEN** the 7 files that previously imported `buildGitPushInstruction` (implementer.ts, spec-fixer.ts, code-fixer.ts, build-fixer.ts, code-review.ts, test-case-gen-system.ts, spec-review-system.ts)  
**WHEN** each file is inspected for imports  
**THEN** none contain `import.*buildGitPushInstruction` and each `buildMessage()` contains an end-session instruction instead

---

## TC-31: git-push-instruction import path absent from all src/ files

- **Category**: Static Analysis / Prompts
- **Priority**: must
- **Source**: T-06, T-09

**GIVEN** the implementation is complete  
**WHEN** `grep -r "git-push-instruction" src/` is run  
**THEN** the command returns 0 matches

---

## TC-32: pipeline run produces no agent git Bash calls (local runtime)

- **Category**: Integration / Pipeline
- **Priority**: must
- **Source**: acceptance criteria

**GIVEN** a full pipeline execution under local runtime (e.g. propose step)  
**WHEN** the agent's tool call log is examined  
**THEN** no Bash tool invocations contain `git add`, `git commit`, or `git push` commands — all git operations are performed by StepExecutor

---

## Summary

| TC | Priority | Category |
|----|----------|----------|
| TC-01 | must | Unit / StepExecutor |
| TC-02 | must | Unit / StepExecutor |
| TC-03 | must | Unit / StepExecutor |
| TC-04 | must | Unit / StepExecutor |
| TC-05 | must | Unit / StepExecutor |
| TC-06 | must | Unit / StepExecutor |
| TC-07 | must | Unit / Errors |
| TC-08 | should | Unit / Errors |
| TC-09 | must | Unit / Infrastructure |
| TC-10 | should | Unit / Infrastructure |
| TC-11 | must | Unit / Runtime Guard |
| TC-12 | must | Unit / Runtime Guard |
| TC-13 | should | Unit / Events |
| TC-14 | must | Static Analysis / Adapter |
| TC-15 | must | Static Analysis / Adapter |
| TC-16 | must | Static Analysis / Adapter |
| TC-17 | must | Static Analysis / Prompts |
| TC-18 | must | Static Analysis / Prompts |
| TC-19 | must | Static Analysis / Prompts |
| TC-20 | must | Static Analysis / Prompts |
| TC-21 | must | Static Analysis / Prompts |
| TC-22 | must | Static Analysis / Prompts |
| TC-23 | must | Static Analysis / Managed Runtime |
| TC-24 | should | Unit / Managed Runtime |
| TC-25 | should | Unit / StepExecutor |
| TC-26 | should | Unit / Testability |
| TC-27 | must | Build / Verification |
| TC-28 | must | Build / Verification |
| TC-29 | must | Regression / Tests |
| TC-30 | must | Static Analysis / Prompts |
| TC-31 | must | Static Analysis / Prompts |
| TC-32 | must | Integration / Pipeline |
