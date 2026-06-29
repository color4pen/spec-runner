# Spec: Detect and clean state-less orphan worktrees

## Requirements

### Requirement: doctor SHALL report orphan worktrees read-only

`specrunner doctor` SHALL include a `orphan-worktrees` check (category
`storage`, non-required) that reports every git worktree under
`<repoRoot>/.git/specrunner-worktrees/` whose `<slug>-<jobId8>` directory name
does not correspond to a known job state with a non-terminal status (`running`,
`awaiting-resume`, `awaiting-archive`, `failed`, `terminated`). The protected
(non-orphan) set MUST be derived from
`JobStateStore.list(repoRoot, { includeArchived: true })` using
`getJobSlug(state)` + `state.jobId.slice(0, 8)`. The check MUST be read-only: it
MUST NOT remove worktrees, delete branches, or otherwise mutate the repository.

#### Scenario: state-less worktree is reported as orphan

**Given** a worktree directory exists under `.git/specrunner-worktrees/` with no
corresponding non-terminal job state
**When** `specrunner doctor` runs the `orphan-worktrees` check
**Then** the check returns status `warn` and the worktree's path appears in the
result details

#### Scenario: worktree of a non-terminal known job is not reported

**Given** a worktree whose `<slug>-<jobId8>` maps to a known job state with a
non-terminal status (e.g. `running`)
**When** `specrunner doctor` runs the `orphan-worktrees` check
**Then** that worktree is not reported as an orphan

#### Scenario: no orphan worktrees → pass

**Given** no worktree directories exist under `.git/specrunner-worktrees/`, or
every worktree maps to a non-terminal job state
**When** `specrunner doctor` runs the `orphan-worktrees` check
**Then** the check returns status `pass`

#### Scenario: check never mutates the repository

**Given** one or more orphan worktrees exist
**When** the `orphan-worktrees` check runs
**Then** no worktree is removed and no branch is deleted (read-only); the result
hint points to `specrunner job prune`

### Requirement: existing doctor checks SHALL remain unchanged

Adding the `orphan-worktrees` check SHALL NOT change the behavior of any existing
doctor check (notably `orphan-sidecars`). The new check is additive in
`commonChecks` only.

#### Scenario: orphan-sidecars behavior is preserved

**Given** the existing `orphan-sidecars` check and its tests
**When** the `orphan-worktrees` check is added
**Then** `orphan-sidecars` produces the same results as before for the same
inputs

### Requirement: job prune SHALL default to dry-run

`specrunner job prune` SHALL, without `--force`, list every orphan worktree
(path and branch) and indicate whether each would be deleted or skipped, while
deleting nothing.

#### Scenario: dry-run lists orphans without deleting

**Given** orphan worktrees exist
**When** `specrunner job prune` runs without `--force`
**Then** each orphan is listed (path + branch) and no worktree or branch is
removed

### Requirement: job prune --force SHALL delete orphan worktrees and local branches

With `--force`, `specrunner job prune` SHALL remove each deletable orphan
worktree (via `git worktree remove --force` and directory removal) and delete its
local branch (`git branch -D`). Deletion MUST be best-effort (individual
failures become warnings, not aborts) and idempotent.

#### Scenario: force deletes worktree and local branch

**Given** an orphan worktree with no uncommitted changes and no unpushed commits
**When** `specrunner job prune --force` runs
**Then** the worktree is removed and its local branch is deleted

#### Scenario: re-running prune is a no-op

**Given** `specrunner job prune --force` has already removed all orphan worktrees
**When** `specrunner job prune --force` runs again
**Then** it reports no orphans and removes nothing (idempotent)

### Requirement: job prune SHALL run only from the main checkout

`specrunner job prune` SHALL be a worktree-guarded subcommand: invoking it from
inside a worktree MUST be rejected with the standard worktree-guard error.

#### Scenario: prune rejected inside a worktree

**Given** the current directory is inside a `.git/specrunner-worktrees/*` worktree
**When** `specrunner job prune` is invoked
**Then** the command is rejected with the worktree-guard error and exits with the
arg-error code

### Requirement: work-protection guard SHALL skip dirty or unpushed worktrees

`specrunner job prune` SHALL skip (and warn about) any orphan worktree that has
uncommitted/untracked changes (`git status --porcelain` non-empty) or unpushed
local commits (`git rev-list --count HEAD --not --remotes` greater than zero),
even when `--force` is given. `--force` MUST NOT override this guard.

#### Scenario: worktree with uncommitted changes is skipped under --force

**Given** an orphan worktree whose `git status --porcelain` is non-empty
**When** `specrunner job prune --force` runs
**Then** the worktree is not removed, and a warning explains it was skipped due to
unsaved changes

#### Scenario: worktree with unpushed commits is skipped under --force

**Given** an orphan worktree whose HEAD has commits not reachable from any
remote-tracking ref
**When** `specrunner job prune --force` runs
**Then** the worktree is not removed, and a warning explains it was skipped due to
unpushed commits

### Requirement: detection logic SHALL be shared between doctor and prune

The orphan-worktree enumeration/classification and the work-inspection logic
SHALL be implemented once in a shared module and consumed by both the
`orphan-worktrees` doctor check and the `job prune` runner. The two consumers
MUST NOT contain independent re-implementations of detection.

#### Scenario: single detection module backs both consumers

**Given** the shared detection module
**When** the doctor check and the prune runner determine which worktrees are
orphans
**Then** both obtain the result from the same shared function
