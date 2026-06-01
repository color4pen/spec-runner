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

Source files under `src/core/` SHALL NOT import `@anthropic-ai/sdk`, `@anthropic-ai/claude-code`, or `@anthropic-ai/claude-agent-sdk` directly. SDK access SHALL be mediated by `src/core/port/` interfaces and the corresponding `src/adapter/<runtime>/` implementations.

Known violations that predate enforcement MUST be documented in an allowlist with file path, violated invariant (B-#), and tracking ID. The allowlist SHALL only shrink (entries removed when the corresponding code fix lands); adding entries is a divergence increase requiring explicit review.

#### Scenario: grep finds no SDK imports in core outside allowlist

- **WHEN** `grep -rE "from ['\"]@anthropic-ai/(sdk|claude-code|claude-agent-sdk)" src/core/` is executed
- **THEN** every matching line is present in the documented allowlist
- **AND** no match exists that is not in the allowlist

#### Scenario: SDK imports concentrated in adapter directories

- **WHEN** the source tree is scanned for `@anthropic-ai/sdk` imports
- **THEN** all matches outside the allowlist reside under `src/adapter/`
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

### Requirement: Architecture Enforcement Covers Entire Core

The architecture enforcement test suite SHALL assert `model.md` §3 closure model and §4 invariants B-1 through B-8 against the **entire `src/core/`** directory. The previous `core/request`-only scope and the explicit `core/runtime` exclusion MUST be superseded by core-wide coverage.

The enforcement scope for this requirement is `src/core/`. Extension to `src/` as a whole is deferred to a subsequent change.

#### Scenario: core/runtime is included in enforcement scope

- **WHEN** the architecture enforcement suite runs
- **THEN** files under `src/core/runtime/` are included in the scan
- **AND** violations in `src/core/runtime/` that are not in the allowlist cause test failure

#### Scenario: all B-invariants are asserted

- **WHEN** the architecture enforcement suite runs
- **THEN** there exist test assertions for B-1 (domain→adapter forbidden), B-2 (SDK in core forbidden), B-3 (upward import forbidden), B-4 (leaf imports nothing), B-5 (judgment purity), B-6 (raw env forbidden), B-7 (raw stdout/stderr forbidden), and B-8 (runtime branching confinement)

### Requirement: Ratchet Allowlist Documents Known Divergences

A typed allowlist SHALL exist at `tests/unit/architecture/arch-allowlist.ts` documenting all known divergences from `model.md` §4 invariants within `src/core/`. Each entry MUST include:

- `file`: relative path of the violating source file
- `invariant`: the violated invariant identifier (e.g. `B-2`)
- `tracking`: a tracking identifier linking to the burn-down plan (e.g. `R2`)

The allowlist SHALL be the single source of truth for grandfathered violations. Entries MUST only be removed (paired with the corresponding code fix), never added without architect approval.

#### Scenario: allowlist entry structure is enforced by types

- **GIVEN** a developer adds an entry to the allowlist
- **WHEN** the entry is missing `file`, `invariant`, or `tracking`
- **THEN** the TypeScript compiler rejects the file

#### Scenario: allowlist entries match actual violations

- **WHEN** the enforcement suite scans `src/core/` for violations
- **THEN** every detected violation is covered by an allowlist entry
- **AND** the suite passes (green)

### Requirement: Closure Model Prevents Unknown Edges

The enforcement suite SHALL implement the closure rule from `model.md` §3: any dependency edge not explicitly marked ✓ in the closure table is forbidden. If a new forbidden edge appears in `src/core/` that is not present in the allowlist, the test suite MUST fail.

This ensures the ratchet is one-directional — the allowlist can only shrink, and new violations are immediately caught.

#### Scenario: new forbidden edge causes test failure

- **GIVEN** the allowlist does not contain an entry for `src/core/foo.ts` importing `src/adapter/bar.ts`
- **WHEN** such an import is introduced and the enforcement suite runs
- **THEN** the suite fails with an error identifying the forbidden edge

#### Scenario: removing allowlist entry without fixing code causes failure

- **GIVEN** an allowlist entry exists for a known violation
- **WHEN** the entry is removed but the violating import remains
- **THEN** the enforcement suite fails, detecting the now-unallowed violation
