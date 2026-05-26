## Requirements

### Requirement: Core Layer Has No Direct SDK Dependencies

Source files under `src/core/` SHALL NOT import `@anthropic-ai/sdk` or `@anthropic-ai/claude-agent-sdk` directly. SDK access SHALL be mediated by `src/core/port/` interfaces (including the new `AgentRunner` port) and the corresponding `src/adapter/<runtime>/` implementations.

#### Scenario: grep finds no SDK imports in core
- **WHEN** `grep -rE "from ['\"]@anthropic-ai/(sdk|claude-agent-sdk)" src/core/` is executed
- **THEN** the command returns 0 matching lines
- **AND** the exit code is 1 (grep convention for no matches)
