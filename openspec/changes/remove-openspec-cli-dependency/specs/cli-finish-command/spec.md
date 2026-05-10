# Delta Spec: cli-finish-command

## MODIFIED Requirements

### Requirement: Finish Phase 1 archive operations

The finish command Phase 1 SHALL archive the change folder by moving `specrunner/changes/<slug>/` to `specrunner/changes/archive/<slug>/` via git mv. The finish command MUST NOT invoke the `openspec archive` CLI command.

#### Scenario: Phase 1 archives change folder without openspec CLI

- **GIVEN** a change folder exists at `specrunner/changes/<slug>/`
- **WHEN** finish Phase 1 executes
- **THEN** the change folder is moved to `specrunner/changes/archive/<slug>/` via git mv
- **AND** the `openspec` CLI is not invoked
- **AND** the move is staged for the archive commit

#### Scenario: Phase 1 skips archive when change folder is absent

- **GIVEN** no change folder exists at `specrunner/changes/<slug>/`
- **WHEN** finish Phase 1 executes
- **THEN** the archive step is skipped without error

### Requirement: Finish preflight binary checks

The finish preflight MUST check for `gh` and `git` binaries only. The preflight MUST NOT check for or invoke the `openspec` binary.

#### Scenario: Preflight does not check openspec binary

- **GIVEN** the finish preflight runs
- **WHEN** binary availability is checked
- **THEN** only `gh` and `git` are verified
- **AND** `openspec` is not included in the check list

### Requirement: Finish preflight validation

The finish preflight MUST NOT run `openspec validate` as part of pre-flight checks. Check 5 (change folder existence) SHALL remain as a warning-only check.

#### Scenario: Preflight skips openspec validate

- **GIVEN** a change folder with specs/ exists
- **WHEN** the finish preflight runs
- **THEN** `openspec validate` is not invoked
- **AND** the change folder existence is checked as a warning only

## REMOVED Requirements

### Requirement: openspec archive CLI integration

The `archiveOpenspec()` function and its invocation in the finish orchestrator are removed. The openspec CLI is no longer called during the finish workflow.

#### Scenario: openspec archive is not called

- **GIVEN** the finish command is executed
- **WHEN** Phase 1 runs
- **THEN** no `openspec archive` command is spawned
