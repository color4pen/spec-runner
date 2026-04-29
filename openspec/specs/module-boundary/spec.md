# module-boundary Specification

## Purpose
TBD - created by archiving change 2026-04-29-step-abstraction-refactor. Update Purpose after archive.
## Requirements
### Requirement: Source Layout Aligns with Hexagonal-lite Boundaries
The `src/` tree SHALL be organized into the following top-level modules per ADR-20260429-module-architecture-style D4:

```
src/
├── core/
│   ├── pipeline/      # Pipeline class + Transition table + types
│   ├── step/          # Step interface + StepExecutor + step implementations
│   ├── agent/         # AgentDefinition interface
│   ├── event/         # EventBus + DomainEvent types
│   └── port/          # SessionClient / GitHubClient interfaces
├── adapter/
│   ├── anthropic/     # SessionClient implementation
│   └── github/        # GitHubClient implementation
├── store/             # JobStateStore / ConfigStore
└── cli/               # composition root + argv parser
```

#### Scenario: Required module directories exist
- **WHEN** the change is applied
- **THEN** every directory listed above exists under `src/`
- **AND** each directory contains at least one TypeScript source file (or `index.ts`)

### Requirement: Core Layer Has No Direct SDK Dependencies
Source files under `src/core/` SHALL NOT import `@anthropic-ai/sdk` directly. SDK access SHALL be mediated by `src/core/port/` interfaces and `src/adapter/anthropic/` implementations.

#### Scenario: grep finds no SDK imports in core
- **WHEN** `grep -rE "from ['\"]@anthropic-ai/sdk" src/core/` is executed
- **THEN** the command returns 0 matching lines
- **AND** the exit code is 1 (grep convention for no matches)

#### Scenario: SDK imports concentrated in adapter/anthropic
- **WHEN** the source tree is scanned for `@anthropic-ai/sdk` imports
- **THEN** all matches reside under `src/adapter/anthropic/`
- **AND** no other directory contains such imports (excluding `node_modules` and tests that exercise the SDK directly)

### Requirement: Dependency Direction Rules
The dependency direction between modules SHALL be:

- `core` MAY import from `store`, `util`, `core/port`
- `core` MUST NOT import from `adapter` or `cli`
- `adapter` MAY import from `core/port` (to implement the interfaces)
- `adapter` MUST NOT import from `core/{pipeline,step,agent,event}`
- `cli` MAY import from any module (it is the composition root)
- `store` MAY import from `util` only

#### Scenario: core does not import from adapter
- **WHEN** `grep -rE "from ['\"](\\.\\./)*adapter/" src/core/` is executed
- **THEN** the command returns 0 matching lines

#### Scenario: composition root wires concrete implementations
- **WHEN** the CLI starts
- **THEN** `src/cli/` constructs concrete `SessionClient`, `GitHubClient`, `JobStateStore`, `EventBus`, `Pipeline`, and `StepExecutor` instances
- **AND** injects them into `Pipeline.run` so that no `core` source file references a concrete adapter class by name

### Requirement: Global Tool Registry is Removed
The previously-existing `src/core/tools/registry.ts` global tool registry SHALL be removed. Tool spec / handler ownership is delegated entirely to `Step` implementations.

#### Scenario: registry.ts no longer exists
- **WHEN** the change is applied
- **THEN** the file `src/core/tools/registry.ts` does not exist
- **AND** no source file imports from it

