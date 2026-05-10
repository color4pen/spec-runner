## ADDED Requirements

### Requirement: Agent Creation
The application SHALL create Managed Agents via the Anthropic SDK.

#### Scenario: Agent created with OpenSpec toolset
- **WHEN** the user initiates agent creation
- **THEN** the system calls `client.beta.agents.create()` with model `claude-sonnet-4-6`, a name, system prompt, and toolset `agent_toolset_20260401`

#### Scenario: Agent ID returned
- **WHEN** agent creation succeeds
- **THEN** the system stores and returns the agent ID for use in sessions

### Requirement: Agent Configuration
The agent SHALL be configured to support OpenSpec workflows.

#### Scenario: System prompt includes OpenSpec context
- **WHEN** creating an agent
- **THEN** the system prompt instructs the agent to use OpenSpec CLI commands

#### Scenario: Toolset enables file operations
- **WHEN** the agent is created with `agent_toolset_20260401`
- **THEN** the agent has access to bash commands and file read/write tools

### Requirement: Agent Lifecycle Management
The application SHALL maintain agent instances for reuse across sessions.

#### Scenario: Agent persisted in memory
- **WHEN** an agent is created
- **THEN** the agent ID is stored in server-side memory for retrieval

#### Scenario: Agent reused for multiple sessions
- **WHEN** creating a new session
- **THEN** the user can select an existing agent ID instead of creating a new one
