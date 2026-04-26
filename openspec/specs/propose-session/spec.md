## MODIFIED Requirements

### Requirement: Propose Session Agent Configuration
The system SHALL use a dedicated agent configuration for propose sessions, with a system prompt tailored to openspec-propose skill execution, and include the `register_branch` Custom Tool definition.

#### Scenario: Agent creation for propose session
- **WHEN** creating a propose session
- **THEN** the system uses an agent configured with model `claude-sonnet-4-6`, `agent_toolset_20260401`, and a system prompt containing openspec-propose workflow instructions

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
The propose instruction message SHALL instruct the agent to determine the slug, create a branch, and call `register_branch` to report the branch name.

#### Scenario: Propose instruction message content
- **WHEN** building the propose instruction message
- **THEN** the message includes: (1) instruction to determine an appropriate English slug from the request title and content, (2) instruction to create a branch using the `{prefix}/{slug}` convention, (3) instruction to call `register_branch` Custom Tool immediately after branch creation, passing the slug, branch_name, and `request_id` (included in the message as a literal value for the agent to use), (4) openspec-propose skill execution with the request's title and content as context, (5) request type and enabled workflow options, (6) commit and push instruction

#### Scenario: Slug generation guidelines in message
- **WHEN** building the propose instruction message
- **THEN** the message includes guidelines for slug generation: use kebab-case, prefix with date in `YYYY-MM-DD-` format, derive meaningful English words from the request title (translating non-English titles), maximum 60 characters

#### Scenario: buildProposeMessage signature change
- **WHEN** `buildProposeMessage()` is called
- **THEN** the function no longer accepts `branchName` or `slug` parameters. It accepts `requestId` (embedded in the message so the agent can pass it to `register_branch`), `requestTitle`, `requestContent`, `requestType`, and `enabled`
