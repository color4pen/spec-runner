# Spec: cancel-canceled-dir

## Requirements

### Requirement: Cancel SHALL evacuate the change folder to `canceled/<slug>-<jobId8>/` before cleanup

When a job is canceled (status is not already `canceled`, and `--purge` is not set), the system
SHALL copy the job's change folder (request.md, state.json, events.jsonl, design/spec/tasks,
test-cases, and all `*-result-*.md` artifacts) into `specrunner/changes/canceled/<slug>-<jobId8>/`
under the repository root, **before** the worktree is removed. The directory name MUST include the
first 8 hex characters of the jobId so that the destination is unique per job. Evacuation is
best-effort: if the source change folder cannot be resolved or a copy fails, the system MUST emit a
warning and still preserve the cancellation record per the next requirement.

#### Scenario: Worktree-only local job is evacuated to canceled/

**Given** a local job whose state lives only in its worktree (`<worktreePath>/specrunner/changes/<slug>/`) with no canonical copy in the main checkout
**When** `specrunner job cancel <jobId>` runs and removes the worktree
**Then** `specrunner/changes/canceled/<slug>-<jobId8>/` exists in the main checkout and contains the evacuated change folder

#### Scenario: request.md is preserved in canceled/

**Given** a job whose change folder contains a request.md
**When** the job is canceled
**Then** `specrunner/changes/canceled/<slug>-<jobId8>/request.md` exists with the original content

### Requirement: The evacuated state SHALL retain the cancellation record after cleanup

The cancellation record (`error.code=USER_CANCELED`, `canceledAt`, and the cancel reason) MUST be
written into the evacuated change folder's `state.json` and MUST survive worktree removal. The
canceled state SHALL be persisted directly to `specrunner/changes/canceled/<slug>-<jobId8>/` (a
location independent of the worktree), not via a store resolution that depends on the worktree still
existing.

#### Scenario: Cancellation record survives for a worktree-only job

**Given** a worktree-only local job (no writable canonical store after the worktree is removed)
**When** the job is canceled
**Then** the `state.json` in `specrunner/changes/canceled/<slug>-<jobId8>/` has `status=canceled`, `error.code=USER_CANCELED`, and a `canceledAt` timestamp

### Requirement: Same-slug cancels SHALL NOT collide in canceled/

Canceling two distinct jobs that share the same slug (even on the same calendar day) MUST produce
two distinct directories under `specrunner/changes/canceled/`, disambiguated by the jobId8 suffix.

#### Scenario: Two same-slug jobs canceled the same day

**Given** two jobs A and B with the same slug but different jobIds
**When** both are canceled on the same day
**Then** `specrunner/changes/canceled/<slug>-<jobIdA8>/` and `specrunner/changes/canceled/<slug>-<jobIdB8>/` both exist and neither overwrites the other

### Requirement: Cancel SHALL maintain cleanup of worktree and branches

Cancellation MUST continue to remove the job's worktree and delete both the local and the remote
branch (best-effort). The branch MUST NOT be retained — cancel means "stop and clean up (done)".

#### Scenario: Worktree and branches are removed after cancel

**Given** a local job with a worktree and a branch `change/<slug>-<jobId8>`
**When** the job is canceled
**Then** the worktree is removed, `git branch -D <branch>` is invoked, and `git push origin --delete <branch>` is invoked

### Requirement: `--purge` SHALL skip evacuation

When `--purge` is passed, the system MUST NOT create a `canceled/<slug>-<jobId8>/` gravestone; it
deletes the machine-local sidecar instead, preserving the existing "leave no trace" semantics.

#### Scenario: Purge leaves no gravestone

**Given** a job to cancel with `--purge`
**When** the job is canceled
**Then** no directory is created under `specrunner/changes/canceled/` for that job, and the machine-local sidecar `.specrunner/local/<slug>/` is removed

### Requirement: Cancel of an already-canceled job SHALL remain idempotent

When the target job is already in `canceled` status, the system MUST NOT re-evacuate or rewrite the
state (no new `canceled/` directory, `updatedAt` unchanged); only the idempotent cleanup and marker
unlink run, as before.

#### Scenario: Re-canceling a canceled job does not mutate state

**Given** a job already in `canceled` status
**When** `specrunner job cancel <jobId>` runs again
**Then** the state's `status` stays `canceled` and `updatedAt` is unchanged
