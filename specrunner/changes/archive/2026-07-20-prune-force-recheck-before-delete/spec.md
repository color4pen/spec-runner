# Spec: Re-verify orphan status before deleting a sidecar under `job prune --force`

## Requirements

### Requirement: `job prune --force` SHALL re-verify orphan status immediately before deleting each sidecar

Under `--force`, for every sidecar returned by the scan, the sidecar prune runner
(`pruneOrphanSidecars`) SHALL re-evaluate the slug's orphan status via the shared
`isOrphanSidecar` predicate in the moment immediately before calling `fs.rm` on
that sidecar. If the re-evaluation reports the slug is **no longer an orphan**
(i.e. a job became active for that slug after the scan snapshot), the runner
SHALL NOT delete that sidecar. The re-check MUST be performed per slug at delete
time, not as a single re-scan before the delete loop.

The production caller (`runPrune`) MUST wire the real `isOrphanSidecar` predicate
as the runner's re-check dependency, so the protection is active on the CLI path.

#### Scenario: A slug that becomes active after scan is spared under --force

**Given** the scan snapshot classifies `slug-x` as an orphan sidecar
**And** by the time deletion is attempted, `slug-x`'s state has transitioned to an
active status (reproduced via injected deps)
**When** `pruneOrphanSidecars` runs with `force: true`
**Then** `fs.rm` is NOT called for `slug-x`'s sidecar path
**And** a skip notice naming `slug-x` and the reason appears in the output

#### Scenario: Removing the re-check causes the active sidecar to be deleted (破壊確認)

**Given** the same fixture where `slug-x` is active at delete time
**When** the per-slug re-check branch is removed from the delete loop
**Then** `fs.rm` IS called for `slug-x`'s sidecar path (the guarantee regresses),
demonstrating the re-check is load-bearing

### Requirement: Sidecars still orphan at re-check time SHALL be deleted as before

The re-check MUST NOT cause false skips. For every scanned sidecar whose slug is
still an orphan at delete time, the runner SHALL delete it exactly as it did
before this change (`fs.rm(sidecarPath, { recursive: true, force: true })`,
best-effort, counted in the removed total).

#### Scenario: Orphan-at-recheck sidecars are deleted

**Given** the scan returns two orphan sidecars and both are still orphans at
delete time
**When** `pruneOrphanSidecars` runs with `force: true`
**Then** `fs.rm` is called for both sidecar paths
**And** the result message reports `Removed 2 orphan sidecar(s)`

### Requirement: A re-check skip SHALL be a warning-level, exit-0 outcome

A sidecar spared by the re-check SHALL be reported as a warning (naming the slug
and the reason) and MUST NOT change the exit code. The command SHALL exit `0`
when it succeeds, no-ops, or only skips; exit `1` remains reserved for a hard
scan failure. The `Removed N …` message SHALL count only sidecars actually
deleted, excluding skipped ones.

#### Scenario: Skip does not fail the command

**Given** every scanned sidecar is skipped by the re-check (all became active)
**When** `pruneOrphanSidecars` runs with `force: true`
**Then** the exit code is `0`
**And** the skips are present as warnings in the output

### Requirement: Dry-run and best-effort/exit-code behavior SHALL be preserved

Dry-run (`force: false`) SHALL remain a pure enumeration of the scan snapshot: it
MUST NOT perform the re-check and MUST NOT call `fs.rm`. Under `--force`,
deletion SHALL remain best-effort — an individual `fs.rm` rejection becomes a
warning and processing continues — and the exit-code contract (0 on
success/no-op/skip, 1 only on hard scan failure) SHALL be unchanged. The output
format SHALL be unchanged except for the added skip lines.

#### Scenario: Dry-run performs no re-check and no deletion

**Given** the scan returns one or more orphan sidecars
**When** `pruneOrphanSidecars` runs with `force: false`
**Then** the orphans are listed as "Would remove: …" info lines
**And** neither the re-check nor `fs.rm` is invoked

#### Scenario: A per-item rm failure remains a best-effort warning

**Given** three orphan sidecars that are still orphans at re-check time
**And** `fs.rm` rejects for the second one
**When** `pruneOrphanSidecars` runs with `force: true`
**Then** all three deletions are attempted
**And** the failure becomes a warning
**And** the exit code is `0`
