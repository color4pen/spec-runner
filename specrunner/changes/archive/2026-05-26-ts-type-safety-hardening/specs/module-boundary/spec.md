# module-boundary Specification (delta)

## Requirements

### Requirement: Core Layer Has No Direct SDK Dependencies (updated grep pattern)

Source files under `src/core/` SHALL NOT import `@anthropic-ai/sdk` or `@anthropic-ai/claude-code` directly. SDK access SHALL be mediated by `src/core/port/` interfaces (including the `AgentRunner` port) and the corresponding `src/adapter/<runtime>/` implementations.

The grep pattern used to verify this invariant SHALL match `@anthropic-ai/(sdk|claude-code)` (not `@anthropic-ai/(sdk|claude-agent-sdk)`).

#### Scenario: grep finds no SDK imports in core

- **WHEN** `grep -rE "from ['\"]@anthropic-ai/(sdk|claude-code)" src/core/` is executed
- **THEN** the command returns 0 matching lines
- **AND** the exit code is 1 (grep convention for no matches)

#### Scenario: SDK imports concentrated in adapter directories

- **WHEN** the source tree is scanned for `@anthropic-ai/sdk` imports
- **THEN** all matches reside under `src/adapter/managed-agent/`
- **AND** no other directory contains such imports (excluding `node_modules` and tests that exercise the SDK directly)

#### Scenario: Claude Code SDK imports concentrated in claude-code adapter

- **WHEN** the source tree is scanned for `@anthropic-ai/claude-code` imports
- **THEN** all matches reside under `src/adapter/claude-code/`
- **AND** no other directory contains such imports (excluding `node_modules` and tests)
