## Requirements

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
