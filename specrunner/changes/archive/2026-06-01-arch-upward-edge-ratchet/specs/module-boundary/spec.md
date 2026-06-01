## Requirements

### Requirement: Architecture Enforcement Covers Entire Core

The architecture enforcement test suite SHALL assert `model.md` §3 closure model and §4 invariants B-1 through B-8 against the **entire `src/core/`** directory. The previous `core/request`-only scope and the explicit `core/runtime` exclusion MUST be superseded by core-wide coverage.

For B-1, B-2, B-5 through B-8, the enforcement scope is `src/core/`. For B-3 (upward import forbidden) and B-4 (leaf imports nothing), the enforcement scope MUST extend beyond `src/core/` to the directories where violations originate:

- **B-3**: shared-kernel directories (`src/parser/`, `src/config/`, `src/state/`, `src/git/`, `src/prompts/`, `src/logger/`, `src/templates/`) and persistence (`src/store/`) SHALL be scanned for imports from `src/core/` (including `core/port/`). This supersedes the previous "deferred to src-wide enforcement change" status.
- **B-4**: leaf directory (`src/util/`) SHALL be scanned for imports from any other `src/` module (not just `core/`). This supersedes the previous "deferred to src-wide enforcement change" status.

Known violations detected by B-3 and B-4 scans MUST be documented in the allowlist with invariant and tracking identifiers.

#### Scenario: core/runtime is included in enforcement scope

- **WHEN** the architecture enforcement suite runs
- **THEN** files under `src/core/runtime/` are included in the scan
- **AND** violations in `src/core/runtime/` that are not in the allowlist cause test failure

#### Scenario: all B-invariants are asserted with real scans

- **WHEN** the architecture enforcement suite runs
- **THEN** there exist test assertions for B-1 (domain→adapter forbidden), B-2 (SDK in core forbidden), B-3 (upward import into core forbidden), B-4 (leaf imports nothing), B-5 (judgment purity), B-6 (raw env forbidden), B-7 (raw stdout/stderr forbidden), and B-8 (runtime branching confinement)
- **AND** B-3 and B-4 assertions perform actual grep scans of non-core directories (not no-op stubs)

#### Scenario: B-3 scans shared-kernel and persistence directories

- **WHEN** the B-3 enforcement test runs
- **THEN** `src/parser/`, `src/config/`, `src/state/`, `src/git/`, `src/prompts/`, `src/logger/`, `src/templates/`, and `src/store/` are scanned for `core/` imports
- **AND** detected violations not in the allowlist cause test failure

#### Scenario: B-4 scans leaf directory for any external import

- **WHEN** the B-4 enforcement test runs
- **THEN** `src/util/` is scanned for imports from any parent directory (`../`)
- **AND** detected violations not in the allowlist cause test failure

### Requirement: Ratchet Allowlist Documents Known Divergences

A typed allowlist SHALL exist at `tests/unit/architecture/arch-allowlist.ts` documenting all known divergences from `model.md` §4 invariants. Each entry MUST include:

- `file`: relative path of the violating source file
- `invariant`: the violated invariant identifier (e.g. `B-2`, `B-3`, `B-4`)
- `tracking`: a tracking identifier linking to the burn-down plan (e.g. `R1`, `R3`, `R4`)

The allowlist SHALL cover violations across all enforced scopes:
- B-1/B-2/B-5 through B-8: violations within `src/core/`
- B-3: violations in shared-kernel and persistence directories importing from `src/core/`
- B-4: violations in `src/util/` importing from any other `src/` module

The allowlist SHALL be the single source of truth for grandfathered violations. Entries MUST only be removed (paired with the corresponding code fix), never added without architect approval.

#### Scenario: allowlist entry structure is enforced by types

- **GIVEN** a developer adds an entry to the allowlist
- **WHEN** the entry is missing `file`, `invariant`, or `tracking`
- **THEN** the TypeScript compiler rejects the file

#### Scenario: allowlist entries match actual violations

- **WHEN** the enforcement suite scans all enforced scopes for violations
- **THEN** every detected violation is covered by an allowlist entry
- **AND** the suite passes (green)

#### Scenario: B-3 and B-4 violations are documented in allowlist

- **WHEN** B-3 and B-4 enforcement tests run
- **THEN** all detected upward imports (shared-kernel/persistence → core) and leaf external imports (util → any) are covered by allowlist entries with `invariant` set to `"B-3"` or `"B-4"` respectively
