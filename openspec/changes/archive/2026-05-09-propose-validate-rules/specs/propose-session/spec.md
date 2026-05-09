## MODIFIED Requirements

### Requirement: Propose Session Agent Configuration
The system SHALL use a dedicated agent configuration for propose sessions, with a system prompt tailored to openspec-propose skill execution, and include the `register_branch` Custom Tool definition. The system prompt SHALL include openspec validate rules that ensure generated delta specs pass `openspec validate --strict`.

#### Scenario: Agent creation for propose session
- **WHEN** creating a propose session
- **THEN** the system uses an agent configured with model `claude-sonnet-4-6`, `agent_toolset_20260401`, and a system prompt containing openspec-propose workflow instructions

#### Scenario: System prompt includes SHALL/MUST requirement rule
- **WHEN** the propose agent generates a delta spec requirement
- **THEN** the system prompt instructs the agent that each requirement body MUST contain the English keyword `SHALL` or `MUST` as a normative statement

#### Scenario: System prompt includes no-code-block-before-scenario rule
- **WHEN** the propose agent generates a delta spec requirement
- **THEN** the system prompt instructs the agent that code blocks MUST NOT appear between the `### Requirement:` header and the first `#### Scenario:` block

#### Scenario: System prompt includes mandatory scenario rule
- **WHEN** the propose agent generates a delta spec requirement
- **THEN** the system prompt instructs the agent that each requirement MUST have at least one `#### Scenario:` block
