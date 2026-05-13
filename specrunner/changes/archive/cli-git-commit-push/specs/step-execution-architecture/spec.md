# step-execution-architecture Delta Spec

## ADDED Requirements

### Requirement: StepExecutor performs commitAndPush after agent step completion (local runtime)

`StepExecutor` SHALL perform `commitAndPush` after a successful `runner.run()` call and before `finalizeStep()`, but only when the runtime is `"local"`. For managed runtime, this step SHALL be skipped entirely.

The `commitAndPush` sequence SHALL be:

1. `git add -A` in the step's working directory (`deps.cwd`)
2. `git diff --cached --quiet` to detect staged changes (exit code 1 = changes exist, exit code 0 = no changes)
3. If no staged changes AND `step.requiresCommit === true`: throw `NO_COMMIT_DETECTED` error
4. If no staged changes AND `step.requiresCommit` is falsy: return silently (no commit, no error)
5. `git commit -m "${step.name}: ${deps.slug}"` to commit staged changes
6. `git push origin ${state.branch}` to push to remote
7. On push failure: wait 5 seconds, retry push once
8. On second push failure: throw `PUSH_FAILED` error with diagnostic information, record in state for escalation

`StepExecutor` SHALL accept an optional `SpawnFn` via constructor injection for git subprocess execution, defaulting to `node:child_process.spawn`.

The `commitAndPush` method SHALL be a private method of `StepExecutor`. It SHALL NOT be exposed on the public API.

#### Scenario: Agent step produces changes and commitAndPush succeeds

- **GIVEN** an agent step completes successfully via `runner.run()` under local runtime
- **AND** the agent wrote files to the worktree
- **WHEN** `StepExecutor` runs `commitAndPush`
- **THEN** `git add -A` is called
- **AND** `git diff --cached --quiet` returns exit code 1 (changes exist)
- **AND** `git commit -m "implementer: my-slug"` is called
- **AND** `git push origin feat/my-slug-abcdef01` is called
- **AND** `finalizeStep` is called after commitAndPush completes

#### Scenario: No staged changes with requiresCommit true raises error

- **GIVEN** an agent step with `requiresCommit: true` completes under local runtime
- **AND** the agent produced no file changes
- **WHEN** `StepExecutor` runs `commitAndPush`
- **THEN** `git add -A` is called
- **AND** `git diff --cached --quiet` returns exit code 0 (no changes)
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

## MODIFIED Requirements

### Requirement: StepExecutor Manages Lifecycle and Emits Events

`StepExecutor` SHALL coordinate the I/O lifecycle of a `Step` execution. The lifecycle SHALL branch on `step.kind`:

For `kind: "agent"` steps:

1. Emit `step:start`
2. Call `store.update(state, { step: step.name })` to record current step for `specrunner ps`
3. Delegate to `AgentRunner.run(ctx)` which handles session creation, polling, and result fetching
4. Receive `AgentRunResult` containing `completionReason`, `resultContent`, `sessionId?`, `agentBranch?`, `error?`
5. **[NEW] For local runtime: call `commitAndPush(step, state, deps)` to stage, commit, and push agent-written files**
6. On success: parse verdict from `resultContent` via `step.parseResult` (or derive verdict from `step.completionVerdict` when `resultContent` is null; if `completionVerdict` is also undefined, fall back to `"escalation"`)
7. Emit `verdict:parsed`
8. Persist the `StepRun` via `JobStateStore.appendStepRun` (recording `sessionId` from result)
9. Set `state.branch` from `result.agentBranch` if present and `state.branch` is unset
10. Emit `step:complete` on success or `step:error` on failure

The `commitAndPush` step (step 5) SHALL only execute when the runtime configuration is `"local"`. For `"managed"` runtime, step 5 SHALL be skipped. All other lifecycle steps remain unchanged.

`StepExecutor` SHALL accept an optional `SpawnFn` via constructor injection for git subprocess execution. This dependency is used exclusively by `commitAndPush` and SHALL NOT affect the existing `EventBus` and `AgentRunner` constructor parameters.

#### Scenario: Agent step lifecycle with commitAndPush (local runtime)

- **GIVEN** an agent step that completes successfully via `AgentRunner.run` under local runtime
- **WHEN** `StepExecutor.execute(step, state)` runs to completion
- **THEN** events are emitted in the order: `step:start` → (commitAndPush) → `verdict:parsed` → `step:complete`
- **AND** git commit and push occur between `runner.run()` return and `finalizeStep()`

#### Scenario: Agent step lifecycle without commitAndPush (managed runtime)

- **GIVEN** an agent step that completes successfully via `AgentRunner.run` under managed runtime
- **WHEN** `StepExecutor.execute(step, state)` runs to completion
- **THEN** events are emitted in the order: `step:start` → `verdict:parsed` → `step:complete`
- **AND** no git subprocess is spawned by the executor
