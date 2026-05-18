# step-execution-architecture Delta Spec

## ADDED Requirements

### Requirement: commitAndPush rejects AgentStep commits that edit authority spec files

`StepExecutor.commitAndPush` SHALL inspect the file paths included in an AgentStep commit and reject (throw) when any path starts with `specrunner/specs/`. Delta spec paths under `specrunner/changes/` SHALL NOT be considered violations.

The guard SHALL apply in both commit paths:

1. **Staged commit path**: After `git add -A` and before `git commit`, execute `git diff --cached --name-only` to obtain staged file paths. If any path starts with `specrunner/specs/`, throw `AUTHORITY_SPEC_EDIT_VIOLATION` without executing `git commit`.
2. **Agent self-commit path**: When HEAD has advanced (agent self-committed) and staged changes are empty, execute `git diff <headBeforeStep>..<headAfterStep> --name-only` to obtain committed file paths. If any path starts with `specrunner/specs/`, throw `AUTHORITY_SPEC_EDIT_VIOLATION` without executing `git push`.

The error SHALL be a `SpecRunnerError` with code `AUTHORITY_SPEC_EDIT_VIOLATION`. The error hint SHALL list all violating paths and instruct the user/agent to use delta spec (`specrunner/changes/<slug>/specs/<capability>/spec.md`) instead.

CliStep execution (e.g., spec-merge via `finish`) SHALL NOT be affected because `commitAndPush` is only called from `runAgentStep`.

#### Scenario: Staged commit with authority spec path is rejected

- **GIVEN** an AgentStep with `requiresCommit: true` completes under local runtime
- **AND** `git diff --cached --name-only` includes `specrunner/specs/foo/spec.md`
- **WHEN** `commitAndPush` inspects staged paths
- **THEN** `AUTHORITY_SPEC_EDIT_VIOLATION` is thrown
- **AND** `git commit` is NOT called
- **AND** the error hint contains `specrunner/specs/foo/spec.md`

#### Scenario: Delta spec path is not a violation

- **GIVEN** an AgentStep with `requiresCommit: true` completes under local runtime
- **AND** `git diff --cached --name-only` includes only `specrunner/changes/my-slug/specs/foo/spec.md`
- **WHEN** `commitAndPush` inspects staged paths
- **THEN** no violation is detected
- **AND** `git commit` and `git push` proceed normally

#### Scenario: Mixed authority and non-authority paths rejects with authority paths only

- **GIVEN** an AgentStep completes with staged changes
- **AND** `git diff --cached --name-only` includes `specrunner/specs/foo/spec.md` and `src/foo.ts`
- **WHEN** `commitAndPush` inspects staged paths
- **THEN** `AUTHORITY_SPEC_EDIT_VIOLATION` is thrown
- **AND** the error hint lists `specrunner/specs/foo/spec.md` but NOT `src/foo.ts`

#### Scenario: Agent self-commit with authority spec in HEAD diff is rejected

- **GIVEN** an AgentStep with `requiresCommit: true` completes under local runtime
- **AND** no staged changes exist but HEAD has advanced
- **AND** `git diff <headBefore>..<headAfter> --name-only` includes `specrunner/specs/foo/spec.md`
- **WHEN** `commitAndPush` inspects HEAD diff paths
- **THEN** `AUTHORITY_SPEC_EDIT_VIOLATION` is thrown
- **AND** `git push` is NOT called

#### Scenario: CliStep is not affected by authority spec guard

- **GIVEN** a CliStep (e.g., spec-merge) that modifies `specrunner/specs/` files
- **WHEN** the step executes via `runCliStep`
- **THEN** `commitAndPush` is NOT called
- **AND** the step completes without authority spec violation errors

#### Scenario: Normal step without authority spec paths commits normally

- **GIVEN** an AgentStep completes with staged changes
- **AND** `git diff --cached --name-only` includes only `src/foo.ts` and `tests/foo.test.ts`
- **WHEN** `commitAndPush` inspects staged paths
- **THEN** no violation is detected
- **AND** the existing commit and push behavior is unchanged
