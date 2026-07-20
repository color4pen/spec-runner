# Spec: CLI repo-root resolution unified at entry

## Requirements

### Requirement: Repo root is resolved once at dispatch and injected as context

The CLI SHALL resolve the git repository root exactly once per invocation, at command
dispatch, from the invoker's current working directory, and SHALL inject it into the
command handler as a context value carrying both the resolved repo root (or `null`
outside a repo) and the invoker cwd.

#### Scenario: single resolution passed to handler

**Given** the CLI is invoked with any command from within a git repository
**When** dispatch builds the command context
**Then** the repo root is resolved one time and provided to the handler as
`{ repoRoot, invokerCwd }`, with `repoRoot` equal to the enclosing repository root.

#### Scenario: resolution outside a repository yields null without throwing

**Given** the CLI is invoked from a directory that is not inside a git repository
**When** dispatch builds the command context
**Then** `repoRoot` is `null` and dispatch does not throw.

### Requirement: Repo-required commands stop with a unified error outside a repository

A command that declares it requires a repository MUST, when launched outside a git
repository, stop with a single unified error and a non-zero exit code, and MUST NOT
proceed to derive internal-state paths from the invoker cwd. The error message MUST
prescribe running `git init` or moving into a repository.

#### Scenario: request new outside a repository

**Given** the working directory is not inside a git repository
**When** `specrunner request new <slug>` is invoked
**Then** the CLI exits non-zero with the unified repo-required error
**And** no `specrunner/drafts/` directory is created under the working directory.

### Requirement: doctor internal-state checks are equivalent from any directory in the repo

Running `doctor` from a subdirectory of a repository MUST produce the same check
results — the `(name, status, message)` triple for each check — as running it from
the repository root.

#### Scenario: doctor from a subdirectory equals doctor from the root

**Given** a git repository containing a `specrunner/` workflow structure
**And** the same repository has no such structure under a nested subdirectory
**When** `doctor` runs with the repo root as its resolved root while invoked from the
subdirectory, and again while invoked from the root
**Then** the check results (name / status / message) are identical between the two runs.

#### Scenario: reverting root resolution breaks the equivalence

**Given** the doctor checks resolve internal-state paths from the repo root
**When** the resolution is reverted so checks use the invoker cwd directly
**Then** the subdirectory run and the root run produce different check results.

### Requirement: job stats returns the same run set from any directory in the repo

Running `job stats` from a subdirectory of a repository MUST return the same set of
runs as running it from the repository root.

#### Scenario: job stats from a subdirectory equals job stats from the root

**Given** a fixture git repository with archived runs under
`specrunner/changes/archive/`
**When** `job stats` is invoked from a subdirectory and from the repository root
**Then** the reported run set is identical between the two invocations.

### Requirement: request new writes to the repository-root drafts directory

Running `request new <slug>` from a subdirectory of a repository MUST create
`specrunner/drafts/<slug>/request.md` at the repository root and MUST NOT create any
nested `specrunner/` structure under the subdirectory.

#### Scenario: request new from a subdirectory targets the root drafts

**Given** the working directory is a subdirectory of a git repository
**When** `specrunner request new my-slug` is invoked
**Then** `<repo-root>/specrunner/drafts/my-slug/request.md` exists
**And** no `<subdir>/specrunner/` directory is created.

### Requirement: user-supplied relative paths resolve against the invoker cwd

A user-supplied relative-path argument MUST be resolved against the invoker's current
working directory, not the repository root.

#### Scenario: request validate resolves a relative path against invoker cwd

**Given** the working directory is a subdirectory of a git repository
**And** a valid request file exists at `<subdir>/foo.md`
**When** `specrunner request validate foo.md` is invoked from the subdirectory
**Then** the file at `<subdir>/foo.md` is validated (exit 0)
**And** the argument is not resolved against the repository root.

### Requirement: doctor runs outside a repository and reports repo checks as fail

`doctor` MUST run to completion (no crash) when launched outside a git repository, and
MUST report the repository check(s) as fail.

#### Scenario: doctor outside a repository

**Given** the working directory is not inside a git repository
**When** `specrunner doctor` is invoked
**Then** doctor completes without crashing
**And** the `git-repository` check reports status `fail`.

### Requirement: process.cwd() occurrences in src/ are allowlist-gated

The architecture test suite MUST assert that every `process.cwd()` occurrence in
`src/` (excluding test files and comments) is covered by an allowlist entry, governed
by the existing delete-only ratchet.

#### Scenario: a new un-allowlisted process.cwd() trips the invariant

**Given** the `process.cwd()` allowlist as seeded by this change
**When** a `process.cwd()` occurrence not covered by any allowlist entry is added to
a `src/` file
**Then** the architecture invariant test fails.

### Requirement: worktree semantics are preserved

Running a command inside a job worktree MUST use the enclosing worktree's root as its
base, unchanged from the current `resolveRepoRoot` behavior.

#### Scenario: command inside a job worktree uses the enclosing worktree root

**Given** the working directory is inside a specrunner job worktree
**When** dispatch resolves the repo root
**Then** the resolved root is the enclosing worktree's root.
