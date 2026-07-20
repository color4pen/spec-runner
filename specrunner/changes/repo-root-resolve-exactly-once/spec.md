# Spec: Repo root resolved exactly once per invocation — handler layer consumes injected context

## Requirements

### Requirement: Command handlers consume the dispatch-resolved repo root and do not re-resolve

The CLI SHALL resolve the git repository root exactly once per invocation, at command
dispatch (`buildCommandContext`), and every command handler SHALL consume that
resolved value via the injected `CommandContext` (`repoRoot` / `invokerCwd`). A handler
MUST NOT resolve the repo root itself — it MUST NOT call `resolveRepoRoot` /
`resolveRepoRootOrFail`, and MUST NOT run `git rev-parse --show-toplevel` directly.

The single production resolution point is `src/cli/command-context.ts`. Files that keep
a `resolveRepoRoot*` call solely as a dependency-injection fallback for direct/test
callers — `src/cli/doctor.ts`, `src/cli/load-config-with-overlay.ts`, `src/cli/ps.ts` —
are permitted, provided the production dispatch path always supplies the pre-resolved
value so the fallback never fires.

#### Scenario: a converted handler receives the resolved root without re-resolving

**Given** the CLI dispatches a converted command from within a git repository
**When** the handler executes on the production dispatch path
**Then** the repo root used by the handler equals `ctx.repoRoot`
**And** the handler performs no additional repo-root resolution (`resolveRepoRoot*` /
`git rev-parse --show-toplevel`).

#### Scenario: DI-fallback files never re-resolve on the production path

**Given** the CLI dispatches `job ls`, `doctor`, or a command whose config load runs
through `load-config-with-overlay`
**When** the command runs on the production dispatch path
**Then** the pre-resolved repo root is supplied to the DI-fallback seam
**And** the seam's internal `resolveRepoRoot` fallback is not invoked.

### Requirement: The handler layer is machine-fixed to not resolve repo root

The architecture test suite SHALL fix, with a grep-based invariant, that
`resolveRepoRoot*` references in `src/cli/` (excluding test files and comment lines)
are confined to a fixed allowlist of dispatch + DI-fallback files
(`command-context.ts`, `doctor.ts`, `load-config-with-overlay.ts`, `ps.ts`), and that
no `src/cli/` file resolves the repo root via a direct `git rev-parse --show-toplevel`.
The allowed-file set is a fixed structural carve-out (not a burn-down ratchet); its
governance file is CODEOWNERS-gated so the pipeline cannot expand it.

#### Scenario: adding a re-resolution to a converted handler trips the invariant

**Given** the exactly-once invariant with its fixed allowlist
**When** a `resolveRepoRoot*` call is (re-)added to a converted handler file that is not
in the allowlist (e.g. `src/cli/inbox.ts`)
**Then** the architecture invariant test fails.

#### Scenario: a direct git root resolution in a handler trips the invariant

**Given** the exactly-once invariant
**When** a `git rev-parse --show-toplevel` invocation is added to any `src/cli/` file
**Then** the architecture invariant test fails.

#### Scenario: the invariant scan is not vacuous

**Given** the exactly-once invariant
**When** the grep scan runs over `src/cli/`
**Then** the raw `resolveRepoRoot` match count is greater than zero (the allowed files
still reference it), confirming the scan is live.

### Requirement: Converted commands behave identically from a subdirectory and from the repository root

Each converted command MUST produce the same behavior when invoked from a subdirectory
of a repository as when invoked from the repository root, because both derive from the
same dispatch-resolved repo root.

#### Scenario: a converted command from a subdirectory equals the root invocation

**Given** a git repository with the relevant workflow state under the repository root
**And** no such state under a nested subdirectory
**When** a converted command runs with the repo root as its dispatch-resolved root while
invoked from the subdirectory, and again while invoked from the root
**Then** the observable result is identical between the two invocations.

#### Scenario: reverting a conversion breaks the equivalence

**Given** a converted command that derives its base from the dispatch-resolved root
**When** the conversion is reverted so the handler derives its base from the invoker cwd
directly
**Then** the subdirectory invocation and the root invocation produce different results.

### Requirement: Repo-required commands stop with the unified error outside a repository

A command that requires a repository MUST declare `requiresRepo: true` and rely on the
dispatch guard to stop with the unified repo-required error and a non-zero exit code
when launched outside a git repository. Such a handler MUST NOT carry its own
repo-resolution error branch.

#### Scenario: a repo-required command outside a repository

**Given** the working directory is not inside a git repository
**When** a repo-required converted command (`init`, `inbox run`, `job prune`,
`job cancel`, `job attach`) is invoked
**Then** the CLI exits non-zero with the unified repo-required error
**And** the handler does not proceed to derive internal-state paths.

### Requirement: The CWD allowlist shrinks by the converted sites

The `process.cwd()` allowlist (`tests/unit/architecture/arch-allowlist.ts`) MUST have
its entries for the converted sites removed (delete-only ratchet), and the total number
of `CWD` entries MUST NOT increase as a result of this change.

#### Scenario: converted-site entries are removed

**Given** the CWD ratchet allowlist
**When** the converted sites no longer contain `process.cwd()`
**Then** their corresponding allowlist entries are removed
**And** the CWD invariant test still reports no un-allowlisted `process.cwd()` in `src/`.

### Requirement: The CWD ratchet identifier is unique

The repository MUST NOT use the identifier `B-13` for the CWD ratchet. `B-13` is
reserved for the existing StepExecutor single-writer invariant
(`architecture/model.md`). The CWD ratchet MUST be referred to by its established
identifier (the `CWD` invariant, test describe `CWD invariant … (T-05)`).

#### Scenario: B-13 is absent from the CWD-context ADR

**Given** the ADR `specrunner/adr/2026-07-20-cwd-role-boundary-dispatch-context.md`
**When** the file is searched for `B-13`
**Then** no occurrence is found (the CWD ratchet is labeled by its `CWD` / `T-05`
identifier instead)
**And** the StepExecutor single-writer `B-13` references elsewhere in the repository are
unchanged.
