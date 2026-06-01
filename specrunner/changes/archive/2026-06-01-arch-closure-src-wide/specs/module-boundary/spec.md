## Requirements

### Requirement: DSM Closure Enforcement Covers Entire src

The architecture enforcement test suite SHALL assert `architecture/model.md` §3 DSM (Dependency Structure Matrix) closure model against the **entire `src/` directory**, not only `src/core/`. The test MUST encode the §3 permitted-edge matrix as a typed data structure, classify each source file into its architectural layer per §2, and verify that every import edge is either (a) in the permitted set or (b) documented in the ratchet allowlist.

The enforcement scope MUST include at minimum:

- **`src/adapter/`** and **`src/auth/`** (adapters layer): forbidden edges to composition-root, domain, and persistence layers SHALL be detected.
- **`src/kernel/`** (physical directory, leaf-equivalent): any import SHALL be detected as a violation.
- All other `src/` layers already covered by B-1 through B-9 invariant tests.

Known divergences detected by the closure scan MUST be documented in `arch-allowlist.ts` with `invariant: "DSM"`, a tracking identifier, and a descriptive comment. The allowlist SHALL only shrink (entries removed when the corresponding code fix lands).

#### Scenario: Closure test scans all src layers

**Given** the architecture enforcement suite is configured with the §3 DSM matrix
**When** the DSM closure test runs
**Then** files under `src/adapter/`, `src/auth/`, `src/cli/`, `src/core/`, `src/config/`, `src/state/`, `src/git/`, `src/parser/`, `src/prompts/`, `src/logger/`, `src/templates/`, `src/store/`, `src/util/`, and `src/kernel/` are all included in the scan
**And** import edges that violate §3 permitted-edge rules and are not in the allowlist cause test failure

#### Scenario: Adapter to domain forbidden edge is detected

**Given** a file under `src/adapter/` imports from `src/core/event/` (domain layer, not ports)
**When** the DSM closure test runs
**Then** the import is flagged as a forbidden edge (adapters → domain is ✗ per §3)
**And** the test fails unless the edge is covered by an allowlist entry

#### Scenario: New forbidden edge not in allowlist causes failure

**Given** the allowlist does not contain an entry for a hypothetical adapter file importing a domain module
**When** such an import exists and the DSM closure test runs
**Then** the test fails, proving the ratchet prevents unauthorized dependency expansion

### Requirement: Physical kernel Directory Has Zero Imports

Source files under `src/kernel/` MUST NOT contain any import statements. The `src/kernel/` directory is treated as leaf-equivalent (import zero) by the architecture enforcement suite. This constraint is enforced strictly without allowlist — any import in `src/kernel/` is an immediate test failure.

#### Scenario: kernel files contain no imports

**Given** the `src/kernel/` directory contains TypeScript source files
**When** the architecture enforcement suite scans `src/kernel/` for import statements
**Then** zero matches are found
**And** the test passes without consulting the allowlist
