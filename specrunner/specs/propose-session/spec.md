## Purpose

Run a propose session that produces a change folder on a feature branch.

## Requirements
### Requirement: Propose Session Agent Configuration
The system SHALL use a dedicated agent configuration for propose sessions, with a system prompt that instructs the agent to use the openspec CLI (`openspec new change`, `openspec status`, `openspec instructions`) for artifact generation.

#### Scenario: Agent creation for propose session
- **WHEN** creating a propose session
- **THEN** the system uses an agent configured with model `claude-opus-4-6[1m]`, `agent_toolset_20260401`, and a system prompt containing openspec CLI workflow instructions

#### Scenario: Agent and environment selection
- **WHEN** starting a propose session
- **THEN** the system requires an agent ID and environment ID to be specified (passed from the UI or pre-configured)

#### Scenario: Custom Tool included in session creation
- **WHEN** creating a propose session via `createBoundSession()`
- **THEN** the session is created with the `register_branch` Custom Tool in the `tools` array, defined as `type: 'custom'` with the appropriate `name`, `description`, and `input_schema`

### Requirement: Slug Derivation
The system SHALL delegate slug generation to the agent and no longer derive it deterministically on the server side during propose session startup.

#### Scenario: No server-side slug generation during propose startup
- **WHEN** starting a propose session
- **THEN** the system does NOT generate a slug from the request title. The `generateSlug()` call is removed from `startPropose()`. The slug will be reported by the agent via the `register_branch` Custom Tool

#### Scenario: Branch name not pre-computed
- **WHEN** starting a propose session
- **THEN** the system does NOT pre-compute a `branchName` to pass to the agent. The agent determines the branch name autonomously based on the request context

#### Scenario: Idempotent branch cleanup removed
- **WHEN** starting a propose session
- **THEN** the system does NOT check for or delete existing branches before session creation, because the branch name is not known until the agent determines it. Branch conflict handling is the agent's responsibility

### Requirement: Propose Instruction Message Content (Updated)
The propose instruction message SHALL instruct the agent to use the openspec CLI for artifact generation. The agent SHALL execute `openspec new change "<slug>"` to scaffold the change folder, then use `openspec status --change "<slug>" --json` and `openspec instructions <artifact-id> --change "<slug>" --json` to determine and generate required artifacts in dependency order. The agent MUST NOT skip artifacts that openspec CLI indicates as required.

#### Scenario: Propose instruction message content
- **WHEN** building the propose instruction message
- **THEN** the message includes: (1) instruction to use the slug and branch provided by the CLI, (2) instruction to use openspec CLI commands for artifact generation, (3) instruction to call `register_branch` Custom Tool after branch creation, (4) the request content wrapped in `<user-request>` tags, (5) commit and push instruction

#### Scenario: openspec CLI workflow in system prompt
- **WHEN** the propose agent starts executing
- **THEN** the system prompt instructs the following workflow: (1) `openspec new change "<slug>"` to create the change scaffold, (2) `openspec status --change "<slug>" --json` to get the artifact build order, (3) for each ready artifact, `openspec instructions <artifact-id> --change "<slug>" --json` to get generation instructions, (4) generate the artifact following the instructions template, (5) repeat until all `applyRequires` artifacts are complete

#### Scenario: Delta spec generation is schema-driven
- **WHEN** `openspec instructions specs --change "<slug>" --json` returns instructions for specs
- **THEN** the agent MUST generate the specs as directed by the instructions, and MUST NOT skip delta spec generation based on the agent's own judgment

#### Scenario: buildProposeMessage signature unchanged
- **WHEN** `buildInitialMessage()` is called
- **THEN** the function accepts `requestContent` and `slug` parameters (with optional `branch`), consistent with the current signature. The openspec CLI workflow is encoded in the system prompt, not the user message
