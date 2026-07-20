# Spec: Extend `job prune` to orphan sidecars and replace doctor's raw `rm -rf` hint

## Requirements

### Requirement: Sidecar-orphan detection SHALL be a single shared implementation

Sidecar-orphan classification SHALL be implemented once in a shared module
(`src/core/sidecar/orphan.ts`) and consumed by both the `orphan-sidecars` doctor
check and the `job prune` sidecar runner. Neither consumer MUST contain an
independent re-implementation of the classification. The classification semantics
MUST match the current `isOrphanSidecar`: a sidecar directory under
`.specrunner/local/<slug>/` is an orphan when its job status is `archived` or
`canceled`, or when no recoverable state exists in the main checkout or the
worktree copy; it is NOT an orphan when its status is in `ACTIVE_STATUSES`
(`running`, `awaiting-resume`, `awaiting-archive`, `failed`, `terminated`).

#### Scenario: single detection function backs both consumers

**Given** the shared sidecar-orphan module
**When** the doctor `orphan-sidecars` check and the `job prune` sidecar runner
each determine which sidecars are orphans
**Then** both obtain the result from the same shared scan function, and neither
defines its own orphan predicate

#### Scenario: archived / canceled / missing state is an orphan

**Given** a sidecar directory whose job state is `archived`, `canceled`, or has
no recoverable `state.json` in the main checkout or worktree copy
**When** the shared scan classifies it
**Then** it is returned as an orphan

#### Scenario: active status is not an orphan

**Given** a sidecar directory whose job status is one of `ACTIVE_STATUSES`
**When** the shared scan classifies it
**Then** it is not returned as an orphan

### Requirement: `job prune` SHALL list orphan worktrees and orphan sidecars in dry-run

`specrunner job prune`, without `--force`, SHALL list orphan worktrees and orphan
sidecars as two distinguishable sections and MUST NOT modify the filesystem.
Sidecars for active jobs MUST NOT appear.

#### Scenario: dry-run lists orphan sidecars without deleting

**Given** `.specrunner/local/` contains both orphan sidecars and active-job
sidecars
**When** `specrunner job prune` runs without `--force`
**Then** each orphan sidecar is listed under the sidecar section, the active-job
sidecars are not listed, and no sidecar directory is removed

#### Scenario: worktree and sidecar sections are distinguished

**Given** orphan worktrees and orphan sidecars both exist
**When** `specrunner job prune` runs
**Then** the output presents the orphan worktrees and the orphan sidecars under
separate, labeled sections

### Requirement: `job prune --force` SHALL delete orphan sidecars and spare active ones

With `--force`, `specrunner job prune` SHALL remove every orphan sidecar
directory and MUST leave the sidecar of any active job (status in
`ACTIVE_STATUSES`) in place. Deletion MUST be best-effort (a per-directory
failure becomes a warning, not an abort) and idempotent (a re-run after success
finds nothing to remove).

#### Scenario: force removes orphans and keeps active sidecars

**Given** `.specrunner/local/` contains an orphan sidecar and an active-job
sidecar
**When** `specrunner job prune --force` runs
**Then** the orphan sidecar directory is removed and the active-job sidecar
directory remains on disk

#### Scenario: neutralizing active-status protection deletes an active sidecar

**Given** the active-status branch of the shared orphan predicate is disabled
**When** `specrunner job prune --force` runs against an active-job sidecar
**Then** the active-job sidecar is deleted — demonstrating the active-status
check is what protects it

#### Scenario: re-running prune is a no-op for sidecars

**Given** `specrunner job prune --force` has already removed all orphan sidecars
**When** `specrunner job prune --force` runs again
**Then** it reports no orphan sidecars and removes nothing

### Requirement: The doctor `orphan-sidecars` hint SHALL point to `job prune`

When the `orphan-sidecars` check finds orphans, its `hint` SHALL direct the
operator to `specrunner job prune` and MUST NOT contain an `rm -rf` command or
the quote-joined sidecar paths.

#### Scenario: hint names the product command

**Given** one or more orphan sidecars exist
**When** the `orphan-sidecars` check reports `warn`
**Then** the hint references `specrunner job prune` and contains no `rm -rf`
string

### Requirement: Human `details` SHALL be rounded while `--json` keeps every entry

For the `orphan-sidecars` check, the human-readable output SHALL show at most the
first `N` orphan paths followed by an `…and K more` remainder line when more than
`N` orphans exist, while the `--json` output MUST contain the full list of orphan
paths.

#### Scenario: human output rounds beyond N orphans

**Given** more than `N` orphan sidecars exist
**When** `specrunner doctor` renders human output for the `orphan-sidecars` check
**Then** at most `N` orphan paths are shown, followed by a line stating how many
more were omitted

#### Scenario: JSON output retains all orphans

**Given** more than `N` orphan sidecars exist
**When** `specrunner doctor --json` renders the `orphan-sidecars` check
**Then** the check's `details` array contains every orphan path (no rounding)

### Requirement: Other doctor checks and worktree prune SHALL remain unchanged

Adding sidecar pruning and the human-rounding field SHALL NOT change the behavior
or output format of any other doctor check, nor the worktree-side prune logic
(`pruneOrphanWorktrees` / `scanOrphanWorktrees` / the work-protection guard).

#### Scenario: other checks render identically

**Given** any doctor check other than `orphan-sidecars`
**When** it produces a result with `details` and no `detailsHuman`
**Then** its human and JSON output are identical to before this change

#### Scenario: worktree prune is unaffected

**Given** the existing `pruneOrphanWorktrees` runner and its tests
**When** `job prune` gains sidecar handling
**Then** worktree detection, the work-protection guard, and worktree deletion
behave exactly as before
