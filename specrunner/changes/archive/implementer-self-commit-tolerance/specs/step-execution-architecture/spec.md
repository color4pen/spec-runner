# step-execution-architecture — Delta Spec

## MODIFIED Requirements

### Requirement: StepExecutor performs commitAndPush after agent step completion (local runtime)

`StepExecutor` SHALL perform `commitAndPush` after a successful `runner.run()` call and before `finalizeStep()`, but only when the runtime is `"local"`. For managed runtime, this step SHALL be skipped entirely.

`StepExecutor.runAgentStep` SHALL capture the current HEAD SHA via `git rev-parse HEAD` before calling `runner.run()`. This value is passed to `commitAndPush` for HEAD-advancement detection.

The `commitAndPush` sequence SHALL be:

1. `git add -A` in the step's working directory (`deps.cwd`)
2. `git diff --cached --quiet` to detect staged changes (exit code 1 = changes exist, exit code 0 = no changes)
3. If staged changes exist: `git commit -m "${step.name}: ${deps.slug}"` then push (unchanged)
4. If no staged changes AND `step.requiresCommit === true`:
   a. Compare current HEAD (`git rev-parse HEAD`) with the HEAD captured before `runner.run()`
   b. If HEAD has advanced: the agent authored commit(s) during the step. Skip pipeline commit, execute push only, and log the detection to stderr
   c. If HEAD has NOT advanced: throw `NO_COMMIT_DETECTED` error (file editing did not occur)
5. If no staged changes AND `step.requiresCommit` is falsy: return silently (no commit, no push, no HEAD check — existing behavior unchanged)

The push-only path SHALL reuse the same retry logic (5-second wait, single retry) as the full commit+push path. The `commit:push` event SHALL be emitted on successful push regardless of whether the pipeline or the agent authored the commit.

#### Scenario: No staged changes but HEAD advanced with requiresCommit true pushes only

- **GIVEN** an agent step with `requiresCommit: true` completes under local runtime
- **AND** the agent committed its changes during the step (HEAD advanced)
- **AND** `git add -A` + `git diff --cached --quiet` returns exit code 0 (no further staged changes)
- **WHEN** `StepExecutor` runs `commitAndPush`
- **THEN** `git rev-parse HEAD` is compared to the pre-step HEAD
- **AND** the comparison shows HEAD has advanced
- **AND** `git commit` is NOT called
- **AND** `git push origin <branch>` is called (with retry)
- **AND** `commit:push` event is emitted on success
- **AND** stderr receives a detection log message

#### Scenario: No staged changes but HEAD advanced with requiresCommit false skips silently

- **GIVEN** an agent step with `requiresCommit` undefined or false completes under local runtime
- **AND** the agent committed its changes during the step (HEAD advanced)
- **AND** `git add -A` + `git diff --cached --quiet` returns exit code 0 (no further staged changes)
- **WHEN** `StepExecutor` runs `commitAndPush`
- **THEN** no HEAD comparison is performed
- **AND** no error is thrown
- **AND** `git push` is NOT called
- **AND** `finalizeStep` proceeds normally

#### Scenario: Agent step produces changes and commitAndPush succeeds

- **GIVEN** an agent step completes successfully via `runner.run()` under local runtime
- **AND** the agent wrote files to the worktree (without committing them)
- **WHEN** `StepExecutor` runs `commitAndPush`
- **THEN** `git add -A` is called
- **AND** `git diff --cached --quiet` returns exit code 1 (changes exist)
- **AND** `git commit -m "implementer: my-slug"` is called
- **AND** `git push origin feat/my-slug-abcdef01` is called
- **AND** `finalizeStep` is called after commitAndPush completes

#### Scenario: No staged changes with requiresCommit true and HEAD unchanged raises error

- **GIVEN** an agent step with `requiresCommit: true` completes under local runtime
- **AND** the agent produced no file changes and did not commit
- **WHEN** `StepExecutor` runs `commitAndPush`
- **THEN** `git add -A` is called
- **AND** `git diff --cached --quiet` returns exit code 0 (no changes)
- **AND** HEAD comparison shows no advancement
- **AND** a `NO_COMMIT_DETECTED` error is thrown
- **AND** `git commit` is NOT called

#### Scenario: No staged changes with requiresCommit false skips silently

- **GIVEN** an agent step with `requiresCommit` undefined or false completes under local runtime
- **AND** the agent produced no file changes
- **WHEN** `StepExecutor` runs `commitAndPush`
- **THEN** `git add -A` is called
- **AND** `git diff --cached --quiet` returns exit code 0 (no changes)
- **AND** no error is thrown
- **AND** `git commit` is NOT called
- **AND** `finalizeStep` proceeds normally

#### Scenario: Push failure triggers single retry

- **GIVEN** an agent step completes with changes under local runtime
- **AND** the first `git push` fails (non-zero exit code)
- **WHEN** `StepExecutor` retries push after 5 seconds
- **AND** the second push succeeds
- **THEN** no error is thrown
- **AND** `finalizeStep` proceeds normally

#### Scenario: Push failure after retry raises PUSH_FAILED

- **GIVEN** an agent step completes with changes under local runtime
- **AND** both the first and second `git push` attempts fail
- **WHEN** `StepExecutor` processes the second failure
- **THEN** a `PUSH_FAILED` error is thrown
- **AND** the error is recorded in job state for escalation

#### Scenario: Managed runtime skips commitAndPush entirely

- **GIVEN** an agent step completes successfully under managed runtime
- **WHEN** `StepExecutor.runAgentStep()` proceeds after `runner.run()`
- **THEN** `commitAndPush` is NOT called
- **AND** no `git add`, `git commit`, or `git push` subprocess is spawned
- **AND** `finalizeStep` is called directly

#### Scenario: Commit message follows step-name-colon-slug format

- **GIVEN** an agent step named `"spec-fixer"` with slug `"add-git-commit-to-executor"`
- **WHEN** `commitAndPush` creates the commit
- **THEN** the commit message is `"spec-fixer: add-git-commit-to-executor"`
