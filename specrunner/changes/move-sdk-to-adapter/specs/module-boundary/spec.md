## MODIFIED Requirements

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
│   ├── managed-agent/ # SessionClient / AnthropicClient implementation + SDK wrappers
│   └── github/        # GitHubClient implementation
├── store/             # JobStateStore / ConfigStore
└── cli/               # composition root + argv parser
```

`src/sdk/` ディレクトリは存在してはならない。SDK ラッパーは全て `src/adapter/managed-agent/` に集約する。

#### Scenario: Required module directories exist
- **WHEN** the change is applied
- **THEN** every directory listed above exists under `src/`
- **AND** each directory contains at least one TypeScript source file (or `index.ts`)

#### Scenario: src/sdk/ does not exist
- **WHEN** the change is applied
- **THEN** the directory `src/sdk/` does not exist

### Requirement: SDK imports concentrated in adapter/managed-agent

All direct imports of `@anthropic-ai/sdk` MUST reside under `src/adapter/managed-agent/`. Core and CLI layers SHALL NOT import the SDK directly.

#### Scenario: SDK imports concentrated in adapter/managed-agent
- **WHEN** the source tree is scanned for `@anthropic-ai/sdk` imports
- **THEN** all matches reside under `src/adapter/managed-agent/`
- **AND** no other directory contains such imports (excluding `node_modules` and tests that exercise the SDK directly)
