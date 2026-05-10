# Delta Spec: propose-pipeline

## MODIFIED Requirements

### Requirement: Propose agent artifact generation

The propose agent SHALL generate the change folder artifacts using a template-driven checklist approach instead of the openspec CLI workflow. The agent MUST create the following artifacts under `specrunner/changes/<slug>/`:

- `design.md` — technical design document
- `tasks.md` — implementation tasks in checkbox format
- `specs/<capability>/spec.md` — delta spec files (when applicable)

The agent MUST NOT generate `proposal.md`. The agent MUST NOT invoke any `openspec` or `npx openspec` commands.

The agent MUST validate artifacts against the self-review checklist embedded in the system prompt before committing.

#### Scenario: Propose agent generates artifacts without openspec CLI

- **GIVEN** a request.md is provided to the propose agent
- **WHEN** the agent designs the implementation plan
- **THEN** the agent creates design.md and tasks.md under `specrunner/changes/<slug>/`
- **AND** the agent does not invoke `openspec` or `npx openspec` commands
- **AND** the agent does not create a `proposal.md` file

#### Scenario: Propose agent generates delta specs when applicable

- **GIVEN** a request requires specification changes
- **WHEN** the agent creates delta spec files
- **THEN** the files are placed under `specrunner/changes/<slug>/specs/<capability>/spec.md`
- **AND** the Delta Spec Format Rules (ADDED/MODIFIED/REMOVED/RENAMED) are followed

### Requirement: Propose agent maxTurns configuration

The propose agent MUST be configured with `maxTurns: 15` to reflect the removal of openspec CLI tool call overhead.

#### Scenario: maxTurns reduced after CLI removal

- **GIVEN** the openspec CLI workflow (5-10 turns) is removed
- **WHEN** the propose step is configured
- **THEN** `maxTurns` is set to 15 (reduced from 20)

## MODIFIED Requirements

### Requirement: Change folder path resolution

The change folder path SHALL resolve to `specrunner/changes/<slug>` for all pipeline operations. The `CHANGES_DIR` constant in `src/util/paths.ts` MUST be set to `"specrunner/changes"`.

#### Scenario: Path constant returns specrunner-prefixed path

- **GIVEN** a slug "my-change"
- **WHEN** `changeFolderPath("my-change")` is called
- **THEN** it returns `"specrunner/changes/my-change"`

## ADDED Requirements

### Requirement: Request.md change folder copy

The pipeline startup MUST copy `request.md` from `specrunner/requests/active/<slug>/request.md` to `specrunner/changes/<slug>/request.md` so that the request is co-located with other change folder artifacts.

#### Scenario: Request.md is copied into change folder on pipeline startup

- **GIVEN** a request.md exists at `specrunner/requests/active/<slug>/request.md`
- **WHEN** the pipeline workspace is set up
- **THEN** a copy of request.md also exists at `specrunner/changes/<slug>/request.md`
- **AND** the copy is staged and committed along with the original
