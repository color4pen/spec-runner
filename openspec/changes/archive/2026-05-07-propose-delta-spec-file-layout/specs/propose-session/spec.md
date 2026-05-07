## ADDED Requirements

### Requirement: OpenSpec CLI Workflow Usage
The propose session agent SHALL use the openspec CLI to generate the change folder. The agent MUST NOT create artifact files directly without following the CLI-driven workflow.

#### Scenario: Agent uses openspec CLI to scaffold the change folder
- **WHEN** a propose session is started
- **THEN** the agent executes `openspec new change "<slug>"` to create the change folder scaffold before generating any artifacts

#### Scenario: Agent follows CLI-driven artifact generation loop
- **WHEN** generating artifacts for the change folder
- **THEN** the agent executes `openspec status --change "<slug>" --json` to check artifact readiness, then `openspec instructions <artifact-id> --change "<slug>" --json` for each ready artifact, and repeats until all `applyRequires` artifacts are complete

#### Scenario: Agent does not skip CLI-instructed artifacts
- **WHEN** the openspec CLI instructs the agent to generate an artifact (including delta specs)
- **THEN** the agent MUST generate that artifact. Omitting CLI-instructed artifacts is prohibited

### Requirement: Delta Spec Format Rules
The propose session agent SHALL follow strict formatting and file layout rules when generating delta spec files. Violations cause `openspec archive` to fail.

#### Scenario: Delta spec uses correct section headers
- **WHEN** generating a delta spec file
- **THEN** the agent uses only `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements`, or `## RENAMED Requirements` as section headers. Custom headers such as `## Changed Requirement:` or `## Updated:` are prohibited

#### Scenario: Each requirement has at least one scenario
- **WHEN** generating a delta spec file
- **THEN** every `### Requirement:` block contains at least one `#### Scenario:` sub-section

#### Scenario: MODIFIED requirement headers match existing spec
- **WHEN** generating a `## MODIFIED Requirements` section
- **THEN** each `### Requirement:` header under it MUST exactly match the corresponding header in `openspec/specs/<capability>/spec.md`

#### Scenario: Delta spec files use correct directory structure
- **WHEN** generating delta spec files
- **THEN** each delta spec is placed at `openspec/changes/<slug>/specs/<capability-name>/spec.md` where `<capability-name>` matches an existing directory name under `openspec/specs/`. Flat files such as `specs/<name>.delta.md` are prohibited

### Requirement: Pre-commit Validation
The propose session agent SHALL run `openspec validate` before committing the change folder to verify format correctness.

#### Scenario: Validation executed before commit
- **WHEN** all artifacts have been generated and the agent is about to commit
- **THEN** the agent executes `openspec validate "<slug>" --type change --strict` and fixes any validation failures before proceeding with the commit

#### Scenario: Validation failure triggers fix before commit
- **WHEN** `openspec validate` reports a failure
- **THEN** the agent corrects the failing artifact and re-runs validation until it passes. The agent MUST NOT commit with known validation failures
