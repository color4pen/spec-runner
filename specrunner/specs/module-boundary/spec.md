# module-boundary Specification

## Purpose
TBD - created by archiving change 2026-04-29-step-abstraction-refactor. Update Purpose after archive.
## Requirements

### Requirement: Source Layout Aligns with Hexagonal-lite Boundaries
The `src/` tree SHALL be organized into the following top-level modules:

```
src/
├── core/
│   ├── pipeline/      # Pipeline class + Transition table + types
│   ├── step/          # Step interface + StepExecutor + step implementations
│   ├── agent/         # AgentDefinition interface
│   ├── event/         # EventBus + DomainEvent types
│   └── port/          # SessionClient / GitHubClient / AgentRunner interfaces
├── adapter/
│   ├── managed-agent/  # SessionClient + ManagedAgentRunner + register_branch handler
│   ├── claude-code/    # ClaudeCodeRunner (Claude Code SDK adapter)
│   └── github/         # GitHubClient implementation
├── store/             # JobStateStore / ConfigStore
└── cli/               # composition root + argv parser
```

`src/adapter/anthropic/` SHALL NOT exist after this change; its contents are migrated to `src/adapter/managed-agent/` via `git mv` (history preserved). `src/adapter/managed-agent/tools/` SHALL contain runtime-specific Custom Tool definitions (e.g., `register_branch`).

#### Scenario: Required module directories exist
- **WHEN** the change is applied
- **THEN** every directory listed above exists under `src/`
- **AND** each directory contains at least one TypeScript source file (or `index.ts`)
- **AND** `src/adapter/anthropic/` does NOT exist

#### Scenario: managed-agent and claude-code are independent
- **WHEN** `grep -rE "from ['\"](\\.\\./)+adapter/claude-code" src/adapter/managed-agent/` is executed
- **THEN** the command returns 0 matching lines
- **AND** `grep -rE "from ['\"](\\.\\./)+adapter/managed-agent" src/adapter/claude-code/` also returns 0 matching lines

### Requirement: Core Layer Has No Direct SDK Dependencies

Source files under `src/core/` SHALL NOT import `@anthropic-ai/sdk` or `@anthropic-ai/claude-code` directly. SDK access SHALL be mediated by `src/core/port/` interfaces (including the new `AgentRunner` port) and the corresponding `src/adapter/<runtime>/` implementations.

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

### Requirement: Dependency Direction Rules
The dependency direction between modules SHALL be:

- `core` MAY import from `store`, `util`, `core/port`
- `core` MUST NOT import from `adapter` or `cli`
- `adapter` MAY import from `core/port` (to implement the interfaces)
- `adapter` MUST NOT import from `core/{pipeline,step,agent,event}`
- `adapter/<runtime-A>` MUST NOT import from `adapter/<runtime-B>` (runtime adapters are siblings, not dependencies)
- `cli` MAY import from any module (it is the composition root)
- `store` MAY import from `util` only

#### Scenario: core does not import from adapter
- **WHEN** `grep -rE "from ['\"](\\.\\./)*adapter/" src/core/` is executed
- **THEN** the command returns 0 matching lines

#### Scenario: composition root wires concrete implementations
- **WHEN** the CLI starts
- **THEN** `src/cli/` constructs concrete `SessionClient` (only when `runtime === "managed"`), `GitHubClient`, `JobStateStore`, `EventBus`, `Pipeline`, `StepExecutor`, and an `AgentRunner` (`ManagedAgentRunner` or `ClaudeCodeRunner` based on `config.runtime`) instances
- **AND** injects them into `Pipeline.run` so that no `core` source file references a concrete adapter class by name

#### Scenario: runtime adapters do not cross-import
- **WHEN** `grep -rE "from ['\"](\\.\\./)*adapter/(claude-code|managed-agent)" src/adapter/` is executed
- **THEN** matches in `src/adapter/managed-agent/` referencing `claude-code` are 0
- **AND** matches in `src/adapter/claude-code/` referencing `managed-agent` are 0

### Requirement: Global Tool Registry is Removed
The previously-existing `src/core/tools/registry.ts` global tool registry SHALL be removed. Tool spec / handler ownership is delegated entirely to `Step` implementations.

#### Scenario: registry.ts no longer exists
- **WHEN** the change is applied
- **THEN** the file `src/core/tools/registry.ts` does not exist
- **AND** no source file imports from it

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
