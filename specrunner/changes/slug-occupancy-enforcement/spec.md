# Spec: slug-occupancy-enforcement

> This spec supersedes the behavior fixed by `archive/2026-07-04-reject-duplicate-slug-run`.
> The pid-only, fail-open start guard is replaced by a state-based, fail-closed occupancy
> guard, and the managed runtime no longer treats the guard as a no-op.
> Semantics are canonized by ADR-20260801 (`architecture/adr/2026-08-01-slug-occupancy-and-attempt-identity.md`)
> and `architecture/dynamic-model.md`. This change resolves the `2026-08-01` entry in
> `architecture/divergence-status.md`.

Terminology: **non-terminal** = `status ∉ TERMINAL_STATUSES` (i.e. one of
`running | awaiting-resume | awaiting-archive | failed | terminated`). **terminal** =
`{ archived, canceled }`. The canonical sets live in `src/state/lifecycle.ts`.

## Requirements

### Requirement: start guard enforces the slug occupancy invariant

At the job-creation entrance (`specrunner job start` / `run`, both runtimes), the system
SHALL, before creating any job state or worktree, enumerate all states for the target slug
and refuse to create a job if any **non-terminal** prior job exists for that slug. The check
runs in the existing pre-`bootstrapJob` preflight slot (`src/core/command/pipeline-run.ts`),
so a rejected run creates no job state, no worktree, no branch, and no liveness/marker sidecar.

The guard SHALL be **fail-closed**: when the slug's state cannot be read (parse failure,
journal corruption, or non-ENOENT I/O failure), the system MUST refuse rather than assume the
slug is free.

The guard SHALL classify occupancy by `status` only; process liveness (`pid`) MUST NOT decide
whether the slug is occupied (it only shapes the rejection message, see next Requirement).

#### Scenario: non-terminal prior job (awaiting-resume / halt) blocks a new start

**Given** slug S has a prior job A with status `awaiting-resume`
**When** `specrunner run` / `specrunner job start` is invoked for slug S
**Then** the run is refused with the occupancy error code
**Then** `bootstrapJob` is not called and no new state / worktree / liveness sidecar is created

#### Scenario: running prior job with a dead pid still blocks a new start

**Given** slug S has a prior job A with status `running` whose recorded `pid` is dead
**When** a new run is invoked for slug S
**Then** the run is refused (a dead pid does NOT reopen the slug — occupancy is state-based)

#### Scenario: terminal-only history allows a new start

**Given** slug S has prior jobs only in terminal statuses (`archived` and/or `canceled`)
**When** a new run is invoked for slug S
**Then** the guard allows the run and `bootstrapJob` is called

#### Scenario: unreadable slug state refuses the start (fail-closed)

**Given** slug S has a state file that exists but cannot be parsed / composed (corruption or I/O failure)
**When** a new run is invoked for slug S
**Then** the run is refused with a reason describing that occupancy could not be determined
**Then** `bootstrapJob` is not called

---

### Requirement: guard rejection names the prior job and routes to an exit

The occupancy rejection SHALL be a structured `SpecRunnerError` carrying a new error code
distinct from `DUPLICATE_LIVE_JOB`. The message MUST name the prior job's `jobId` and `status`,
and MUST offer a status-appropriate exit plus `cancel`:

- prior job is `running` with a live `pid` → advise waiting for completion or `specrunner job cancel <priorJobId>`.
- prior job is `running` with a dead `pid`, `awaiting-resume`, `failed`, or `terminated` →
  advise `specrunner job resume <slug>` or, to start over, `specrunner job cancel <priorJobId>`.
- prior job is `awaiting-archive` → advise `specrunner job archive <slug>` or `specrunner job cancel <priorJobId>`.

The process-liveness decision MUST reuse the existing `isProcessAlive` from
`src/core/resume/safety.ts`; no new pid-probing logic is introduced.

#### Scenario: rejection message content for a live prior job

**Given** slug S is occupied by a `running` prior job A (pid alive), jobId `abcd1234-...`
**When** the start is refused
**Then** the error names jobId `abcd1234-...` and status `running`
**Then** the error advises waiting or `specrunner job cancel abcd1234-...`

#### Scenario: rejection message content for a halted prior job

**Given** slug S is occupied by an `awaiting-resume` prior job A, jobId `abcd1234-...`
**When** the start is refused
**Then** the error names jobId `abcd1234-...` and status `awaiting-resume`
**Then** the error advises `specrunner job resume S` or `specrunner job cancel abcd1234-...`

---

### Requirement: liveness sidecar write is a check-and-claim owned by non-terminal jobs

Writing the liveness sidecar (`.specrunner/local/<slug>/liveness.json`) SHALL NOT
unconditionally overwrite. Before writing for job J, the system MUST read the existing sidecar
and determine the status of the job it points to:

- the existing sidecar is absent, points to a terminal job, or points to a job that no longer
  exists in state → it is **stale** and MAY be claimed (overwritten) by J.
- the existing sidecar points to the **same** jobId J → it MAY be refreshed (re-established).
- the existing sidecar points to a **different non-terminal** job K → it MUST NOT be overwritten;
  the claim is refused with a structured error (defense-in-depth; the start guard normally
  prevents reaching this).

Concurrent claims MUST resolve so that at most one non-terminal job owns the slug's sidecar; a
losing claimant is refused rather than silently overwriting a foreign non-terminal sidecar.
Genuine sidecar I/O write failures (not claim refusal) MAY remain best-effort, preserving the
liveness reconstruction contract.

#### Scenario: stale sidecar is claimed

**Given** `.specrunner/local/S/liveness.json` points to a `canceled` job B
**When** job A materializes its workspace and writes the liveness sidecar for slug S
**Then** the sidecar is overwritten to point to A (the stale terminal sidecar is claimed)

#### Scenario: foreign non-terminal sidecar is not claimed

**Given** `.specrunner/local/S/liveness.json` points to a `running` job B (B ≠ A, non-terminal)
**When** job A attempts to write the liveness sidecar for slug S
**Then** the claim is refused with a structured error and B's sidecar is left intact

---

### Requirement: cancel tears down sidecar and marker only for its own jobId

`specrunner job cancel <jobId>` SHALL delete the liveness sidecar and the managed marker only
when the recorded `jobId` matches the job being canceled. This deletion happens on **normal**
cancel (not only under `--purge`); leaving a stale sidecar behind is no longer allowed.

Records established by a different job MUST NOT be deleted. Under `--purge`, the removal of the
`.specrunner/local/<slug>/` directory SHALL likewise be conditioned on the contained
sidecar/marker matching this jobId; if it belongs to a different non-terminal job, the directory
removal is skipped with a warning.

#### Scenario: normal cancel deletes its own sidecar

**Given** `.specrunner/local/S/liveness.json` records `jobId` = A and job A is being canceled
**When** `specrunner job cancel A` runs (without `--purge`)
**Then** the liveness sidecar for slug S is deleted (not left behind)

#### Scenario: cancel leaves a foreign sidecar intact

**Given** `.specrunner/local/S/liveness.json` records `jobId` = B, and job A (same slug) is being canceled
**When** `specrunner job cancel A` runs
**Then** the liveness sidecar is left intact (it belongs to B, not A)

---

### Requirement: change-scoped slug resolution is state-based, not time-based

`resolveJobStateBySlug` (used by `resume` / `reopen`) SHALL select the target job by state, not
by `updatedAt`:

- exactly one non-terminal job for the slug → return it.
- zero non-terminal jobs → return `null` (the caller reports that there is no continuable attempt).
- two or more non-terminal jobs (occupancy invariant breach) → do NOT select implicitly; throw a
  structured error that enumerates the candidates (`jobId`, `status`, `updatedAt`) and points to
  `specrunner doctor`.

`updatedAt` MAY be used only to order the enumeration for display; it MUST NOT be the basis for
selecting the target job.

#### Scenario: non-terminal is chosen over a newer terminal job

**Given** slug S has one `awaiting-resume` job A and one `canceled` job B whose `updatedAt` is newer than A's
**When** `resolveJobStateBySlug("S", ...)` is called
**Then** it returns A (the non-terminal job), ignoring B's newer timestamp

#### Scenario: multiple non-terminal jobs stop with a candidate enumeration

**Given** slug S has two non-terminal jobs A and B
**When** `resolveJobStateBySlug("S", ...)` is called
**Then** it throws an error enumerating A and B (jobId / status / updatedAt) and pointing to `specrunner doctor`

---

### Requirement: doctor detects occupancy breaches and offers a mechanical sidecar repair

A new storage-category doctor check SHALL report, per slug:

- (a) when two or more non-terminal jobs exist for a slug → an occupancy-invariant breach,
  enumerating the candidates. The check performs NO automatic selection (breaches with multiple
  non-terminal jobs are for human `cancel` judgment).
- (b) when the liveness sidecar points to a terminal or non-existent job while exactly one
  non-terminal job exists for the same slug → a sidecar/state mismatch, with a hint pointing to
  the mechanical repair entry.

The mechanical repair SHALL re-point the slug's liveness sidecar to the **unique** non-terminal
job (its `jobId` and `worktreePath`) and MUST only act when the non-terminal job is unique. When
two or more non-terminal jobs exist, the repair MUST refuse and enumerate the candidates instead
of choosing one. The doctor check itself remains read-only, consistent with the existing
detect-then-point-to-a-command style.

#### Scenario: mismatch detection with a unique non-terminal job

**Given** slug S has an `awaiting-resume` job A placed aside and a liveness sidecar pointing to a `canceled` job B
**When** the doctor occupancy check runs
**Then** it reports the sidecar/state mismatch for slug S and hints at the repair entry

#### Scenario: mechanical repair re-points the sidecar when unique

**Given** the mismatch above (unique non-terminal job A)
**When** the mechanical repair for slug S runs
**Then** the liveness sidecar is re-pointed to A (jobId and worktreePath from A's state)

#### Scenario: repair refuses when the non-terminal job is not unique

**Given** slug S has two non-terminal jobs A and B
**When** the mechanical repair for slug S runs
**Then** it refuses to repair and enumerates A and B (no automatic selection)

---

### Requirement: pipeline-complete Next guidance branches on the final state

The `pipeline:complete` handler SHALL branch on the payload's `state.status`:

- `awaiting-archive` → `Next: specrunner job archive <slug>`.
- `awaiting-resume` (halt) → `Next: specrunner job resume <slug>`.

The unconditional archive hint is removed.

#### Scenario: halt completion advises resume

**Given** a pipeline run that halts and returns state with status `awaiting-resume`
**When** `pipeline:complete` fires
**Then** the printed guidance is `Next: specrunner job resume <slug>`

#### Scenario: normal completion advises archive

**Given** a pipeline run that completes with state status `awaiting-archive`
**When** `pipeline:complete` fires
**Then** the printed guidance is `Next: specrunner job archive <slug>`

---

### Requirement: inbox propagates an occupancy rejection to the issue, idempotently

When the inbox start path targets a slug that is occupied by a non-terminal prior job, the
system SHALL post an issue comment (via the existing `postRejectComment` seam) describing the
situation (prior `jobId`, prior `status`, and the recommended exit), instead of starting a job.
The comment MUST be idempotent for a given prior job: the same prior job MUST NOT be commented
more than once across polling cycles (dedup via a machine-readable marker that encodes the prior
jobId).

#### Scenario: occupancy rejection is commented once

**Given** an approved issue whose slug is occupied by a non-terminal prior job A
**When** the inbox start path runs
**Then** a reject comment naming A's jobId, status, and exit is posted to the issue

#### Scenario: repeated polling does not repeat the comment

**Given** the reject comment for prior job A already exists on the issue
**When** the inbox start path runs again for the same occupied slug and same prior job A
**Then** no duplicate comment is posted

---

### Requirement: the guard and jobId-scoped teardown apply to the managed runtime

The occupancy start guard (state-based, fail-closed) and the jobId-scoped teardown SHALL apply
symmetrically to the managed runtime via the managed marker (`marker.json`). The managed
runtime's start guard is no longer a no-op.

#### Scenario: managed start guard rejects an occupied slug

**Given** the runtime is managed and slug S has a non-terminal prior managed job A (recorded via `marker.json` + co-located state)
**When** a managed run is invoked for slug S
**Then** the run is refused with the occupancy error code before any state is created

#### Scenario: managed cancel deletes only its own marker

**Given** `marker.json` for slug S records `jobId` = A and job A is being canceled
**When** `specrunner job cancel A` runs
**Then** the marker is deleted only because its jobId matches A
