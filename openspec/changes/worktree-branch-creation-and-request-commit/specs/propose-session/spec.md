## MODIFIED Requirements

### Requirement: Propose Session Agent Configuration
The system SHALL use a dedicated agent configuration for propose sessions, with a system prompt tailored to openspec-propose skill execution. The session SHALL NOT include the `register_branch` Custom Tool definition — branch creation is the CLI's responsibility and is completed before the propose session starts.

#### Scenario: Agent creation for propose session
- **WHEN** creating a propose session
- **THEN** the system uses an agent configured with model `claude-sonnet-4-6`, `agent_toolset_20260401`, and a system prompt containing openspec-propose workflow instructions
- **AND** the `custom_tools` array does NOT contain `register_branch`

#### Scenario: Agent and environment selection
- **WHEN** starting a propose session
- **THEN** the system requires an agent ID and environment ID to be specified (passed from the UI or pre-configured)

#### Scenario: No Custom Tool in session creation
- **WHEN** creating a propose session via `createBoundSession()`
- **THEN** the session is created WITHOUT the `register_branch` Custom Tool in the `tools` array
- **AND** the agent operates on a branch that already exists (created by CLI during `setupWorkspace()`)

### Requirement: Slug Derivation
The system SHALL use the slug determined by the CLI. The slug is derived from the request.md `slug:` Meta field. Branch name is computed by the CLI as `getBranchPrefix(request.type) + slug + "-" + jobId.slice(0, 8)` and passed to the agent via the prompt. Neither slug nor branch name is determined by the agent.

#### Scenario: CLI determines slug and branch
- **WHEN** starting a propose session
- **THEN** the slug is taken from `request.slug` (parsed from request.md)
- **AND** the branch name is computed as `${prefix}${slug}-${jobId.slice(0, 8)}` by the CLI
- **AND** both values are passed to the agent in the initial message

#### Scenario: Branch already exists before propose
- **WHEN** the propose session starts
- **THEN** the feature branch already exists in the repository (created by `setupWorkspace()`)
- **AND** request.md is already committed on the branch as the initial commit

### Requirement: Propose Instruction Message Content (Updated)
The propose instruction message SHALL instruct the agent to use the CLI-provided slug and branch name, create the change folder, commit, and push. The message SHALL NOT instruct the agent to create a branch or call `register_branch`.

#### Scenario: Propose instruction message content
- **WHEN** building the propose instruction message
- **THEN** the message includes: (1) the CLI-determined slug, (2) the CLI-determined branch name, (3) instruction to create the change folder under `openspec/changes/<slug>/`, (4) instruction to commit and push to the existing branch, (5) request type and content
- **AND** the message does NOT include instruction to call `register_branch`
- **AND** the message does NOT include instruction to create a branch via `git checkout -b`

#### Scenario: buildInitialMessage signature
- **WHEN** `buildInitialMessage()` is called
- **THEN** the function accepts `requestContent`, `slug`, and `branch` parameters
- **AND** the branch parameter is the CLI-computed value from `state.branch`
