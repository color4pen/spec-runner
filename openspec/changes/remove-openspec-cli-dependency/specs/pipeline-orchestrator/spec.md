# Delta Spec: pipeline-orchestrator

## MODIFIED Requirements

### Requirement: Doctor runtime checks

The doctor command MUST NOT include an openspec binary availability check. The `openspecCheck` SHALL be removed from the runtime checks list. The `openspecProjectMdCheck` SHALL remain but with `required: false`.

#### Scenario: Doctor does not check openspec binary

- **GIVEN** the doctor command runs all checks
- **WHEN** runtime checks are evaluated
- **THEN** openspec binary availability is not checked
- **AND** the total runtime check count is 3 (node, bun, git)

#### Scenario: openspec-project-md check is optional

- **GIVEN** the doctor command runs repo checks
- **WHEN** `openspecProjectMdCheck` is evaluated
- **THEN** its `required` property is `false`
- **AND** a missing `openspec/project.md` produces a warning, not a failure

### Requirement: Dynamic context collection

The dynamic context collector MUST return an empty array for `specsList`. The `collectChangesList()` function SHALL continue to collect directories from the changes directory resolved via `changesDirRel()`.

#### Scenario: Specs list is always empty

- **GIVEN** `openspec/specs/` contains subdirectories
- **WHEN** `collectDynamicContext()` is called
- **THEN** `specsList` is an empty array

#### Scenario: Changes list reflects new path

- **GIVEN** directories exist under `specrunner/changes/`
- **WHEN** `collectDynamicContext()` is called
- **THEN** `changesList` contains the directory names (excluding "archive")

## MODIFIED Requirements

### Requirement: Environment package dependencies

The managed runtime environment MUST NOT include `@fission-ai/openspec` in its npm package list. The `ENVIRONMENT_PACKAGES_NPM` constant SHALL be updated to exclude this package.

#### Scenario: Init does not install openspec package

- **GIVEN** the `specrunner init` command runs in managed mode
- **WHEN** the environment is created
- **THEN** `@fission-ai/openspec` is not included in the npm packages

### Requirement: Prompt proposal.md references

All agent system prompts and initial message templates MUST NOT reference `proposal.md`. Prompts that previously instructed agents to read `proposal.md` SHALL reference `request.md` instead.

#### Scenario: No prompt references proposal.md

- **GIVEN** the full set of system prompts in `src/prompts/`
- **WHEN** the prompts are inspected
- **THEN** none contain the string `proposal.md`
