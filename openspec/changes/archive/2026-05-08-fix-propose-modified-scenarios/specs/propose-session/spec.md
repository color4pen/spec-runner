## MODIFIED Requirements

### Requirement: Propose Session Agent Configuration
The system SHALL use a dedicated agent configuration for propose sessions, with a system prompt tailored to openspec-propose skill execution, and include the `register_branch` Custom Tool definition. The system prompt's Delta Spec Format Rules SHALL explicitly instruct the agent to generate scenarios for MODIFIED Requirements, including a supplemental rule and self-review checklist item specific to MODIFIED.

#### Scenario: Agent creation for propose session
- **WHEN** creating a propose session
- **THEN** the system uses an agent configured with model `claude-sonnet-4-6`, `agent_toolset_20260401`, and a system prompt containing openspec-propose workflow instructions

#### Scenario: Agent and environment selection
- **WHEN** starting a propose session
- **THEN** the system requires an agent ID and environment ID to be specified (passed from the UI or pre-configured)

#### Scenario: Custom Tool included in session creation
- **WHEN** creating a propose session via `createBoundSession()`
- **THEN** the session is created with the `register_branch` Custom Tool in the `tools` array, defined as `type: 'custom'` with the appropriate `name`, `description`, and `input_schema`

#### Scenario: System prompt includes MODIFIED scenario rule
- **WHEN** the system prompt's Delta Spec Format Rules are defined
- **THEN** the rules include an explicit instruction that MODIFIED Requirements MUST contain at least one Scenario describing the changed behavior in Given/When/Then format, supplementing the general Rule 2

#### Scenario: Self-review checklist covers MODIFIED scenarios
- **WHEN** the system prompt's Self-review checklist is defined
- **THEN** the checklist includes an item that explicitly mentions verifying MODIFIED Requirements have scenarios
