# Design: slug-occupancy-enforcement

## Context

ADR-20260801 (`architecture/adr/2026-08-01-slug-occupancy-and-attempt-identity.md`) and
`architecture/dynamic-model.md` canonized the slug occupancy invariant: at any moment a slug has
at most one non-terminal (`status ∉ TERMINAL_STATUSES`) job; change-scoped slug→job resolution is
state-based; the liveness sidecar is owned only by non-terminal jobs, claimed via check-and-claim,
released only for the owning jobId; and adjudication of a broken invariant is a human (doctor)
action. The implementation has not caught up — this is the `2026-08-01` known divergence in
`architecture/divergence-status.md`.

The gap caused a real incident on a 0.4.8 project: a `job start` against a halted
(`awaiting-resume`) slug overwrote the liveness sidecar; canceling the new job left the sidecar
behind; `resume <slug>` then selected the newest (canceled) job and rejected; `show <old jobId>`
returned `JOB_NOT_FOUND` because the sidecar index no longer indexed the old job; only `job ls`
still showed the old job. Recovery required hand-surgery of `.specrunner/` files — there was no
exit inside the CLI.

Current-code entry points (verified):

- `src/core/command/pipeline-run.ts:125` — `assertNoDuplicateLiveJob?.(cwd, slug)` runs in the
  pre-`bootstrapJob` preflight slot (alongside reviewer / capability-gate validation). This is the
  correct enforcement point; only its body needs to change.
- `src/core/runtime/duplicate-slug-guard.ts:40-84` — `checkDuplicateLiveJob`: pid-only, fail-open.
- `src/core/runtime/local.ts:910` (delegates to the guard) and `src/core/runtime/managed.ts:596`
  (no-op) implement the port method `assertNoDuplicateLiveJob`.
- `src/core/resume/resolve-job.ts:18-35` — `resolveJobStateBySlug`: `updatedAt`-latest over all
  matches, no status filter.
- `src/core/runtime/local.ts:1423` + `src/core/runtime/workspace-materializer.ts` — liveness
  sidecar writes (unconditional overwrite).
- `src/core/cancel/runner.ts:423-431` (marker unlink, unconditional) and `437-459` (`--purge`
  directory removal, unconditional).
- `src/cli/progress.ts:162-166` — `onPipelineComplete` ignores the payload and always prints the
  archive hint. `pipeline:complete` payload is `{ state: JobState }` (`src/core/event/types.ts:13`)
  and fires on halt too (`src/core/pipeline/pipeline.ts:145-148`).
- `src/core/inbox/run-inbox.ts` — `executeStart` → `startJob` effect → `runRunCore`. `runRunCore`
  (`src/cli/run.ts:100-102`) swallows all errors into exit code 1, so a start rejection is not
  observable as a throw to the inbox.
- `src/store/job-catalog.ts` (`JobStateStore.list`) enumerates states across main checkout, local
  worktrees, archive (opt-in), sidecar supplement, and managed markers, deduped by jobId (newest
  `updatedAt`). It re-throws non-ENOENT I/O errors but **silently skips per-entry parse failures**.

## Goals / Non-Goals

**Goals**:

- Enforce the occupancy invariant at the job-creation entrance (state-based, fail-closed), for both
  runtimes.
- Make the liveness sidecar owned by non-terminal jobs (check-and-claim on write, jobId-scoped
  release on cancel).
- Make change-scoped slug resolution state-based; stop implicitly picking the newest job.
- Give the existing broken cross-sections a repair exit inside the CLI (doctor detection + a
  mechanical, uniqueness-gated sidecar re-point).
- Route halt vs. normal completion to the correct Next guidance.
- Propagate an occupancy rejection to the linked issue idempotently from the inbox.
- Resolve the `2026-08-01` divergence entry.

**Non-Goals** (from request scope-out; do not implement):

- jobId-keying the record layer (sidecar), unifying `ls` / `show` / `resume` / `archive` onto a
  single catalog, or changing `archive`'s slug resolution (future work).
- A `resume <jobId>` direct-selection entry (rejected by ADR-20260801).
- `start` auto-resuming an existing attempt (rejected by ADR-20260801).
- Any change to the `JobStatus` state machine (transition table / status sets).

## Decisions

### D1: Enforce at the job-creation entrance, reusing the existing preflight slot

The guard stays exactly where `assertNoDuplicateLiveJob` is already called
(`pipeline-run.ts:125`), before `bootstrapJob`. "Check and throw = create no state" is the same
pre-work preflight position as the reviewer-definition and capability-gate checks (ADR-20260801 D1;
`dynamic-model.md` capability gate). Only the guard's body changes from pid-only/fail-open to
state-based/fail-closed.

- Rationale: a rejection must leave no state / worktree / branch / sidecar. That is guaranteed only
  before `bootstrapJob`. Moving the check anywhere later would require compensating teardown.
- Alternatives considered: enforce inside `writeLivenessSidecar` (too late — state already exists);
  enforce in the planner (the planner is a pure function without state access and cannot be the
  authoritative enforcement point).

### D2: A single occupancy module owns the invariant's mechanics

Introduce `src/core/occupancy/` as the single owner of "enumerate states for a slug and classify
them by terminal/non-terminal." It exposes a shared scan used by the guard (req 1), the resolver
(req 4), the sidecar claim (req 2), and the doctor detection + repair (req 5). This follows the
"emergent invariant needs a single owner + mechanical teeth" discipline: the invariant spans
multiple call paths (start / cancel / resume / crash / doctor), so its classification logic must
not be duplicated per call site where copies drift.

- Rationale: one classifier means one definition of "occupied," reused everywhere, and one place to
  test fail-closed behavior. The teeth are scenario tests named in the acceptance criteria, not an
  import check (ADR-20260801 structural-implications note).
- Alternatives considered: scatter the classification into each call site (guard, resolve, cancel,
  doctor) — rejected; that is exactly the drift the incident exposed.

### D3: Non-terminal = the complement of `TERMINAL_STATUSES`, not `ACTIVE_STATUSES`

Occupancy uses `!TERMINAL_STATUSES.has(status)` (`src/state/lifecycle.ts`), i.e. the occupancy set
is `{ running, awaiting-resume, awaiting-archive, failed, terminated }`. This is deliberately wider
than `ACTIVE_STATUSES` (`{ running, awaiting-resume }`) and wider than
`src/core/sidecar/orphan.ts`'s local `ACTIVE_STATUSES`.

- Rationale: ADR-20260801 defines occupancy by `status ∉ TERMINAL_STATUSES`. An `awaiting-archive`,
  `failed`, or `terminated` job still owns the slug until it is archived or canceled; starting a new
  job over it would recreate the incident family.
- Consequence (breaking): a slug with an un-archived finished job (`awaiting-archive`) or a
  `failed` / `terminated` job now rejects a new `start`. The rejection message routes the user to
  the correct exit (`archive` / `resume` / `cancel`). This is the intended tightening.

### D4: Fail-closed via a slug-scoped enumeration that surfaces read errors

`JobStateStore.list` silently skips per-entry parse failures, so it cannot signal "state exists but
is unreadable." The occupancy scan therefore enumerates the slug's own candidate state locations
(main checkout `specrunner/changes/<slug>/`, each `.git/specrunner-worktrees/*/specrunner/changes/<slug>/`,
and managed `.specrunner/local/<slug>/` for the marker path), reading each and recording an
`unreadable` reason when a present state cannot be parsed/composed (including `JOURNAL_CORRUPTED`)
or when enumeration I/O fails (non-ENOENT). ENOENT (absent) is "free," not "unreadable."

- Rationale: fail-closed (ADR-20260801 D1) requires distinguishing "absent" from "present but
  unreadable." Relying on `list`'s swallow would silently treat corruption as "free."
- Alternatives considered: reuse `JobStateStore.list` and add a separate corruption probe — two
  mechanisms for one question; rejected. The slug-scoped scanner is cheap (bounded by one slug) and
  keeps the fail-closed signal first-class. The implementer MAY factor shared location logic out of
  `job-catalog.ts` as long as read errors are surfaced rather than swallowed.

### D5: State-based resolution keeps the return type and throws only on breach

`resolveJobStateBySlug` keeps its `Promise<JobState | null>` signature: one non-terminal → that
job; zero non-terminal → `null`; two-or-more non-terminal → **throw** a structured enumeration
error. `updatedAt` is used only to order the enumeration for display.

- Rationale: keeping the signature means the many existing `mockResolvedValue(...)` call sites keep
  compiling; only the ambiguous-breach path is new (a throw). Callers already handle `null`.
- Caller updates required: `src/cli/resume.ts:47` and `src/cli/reopen.ts:58` call the resolver
  outside a try/catch (only to derive repo owner/name) — they must catch the new throw and surface
  its message + exit. `src/core/command/resume.ts:105` and `src/core/command/reopen.ts:113` already
  wrap the call; their generic catch will surface the message, which is acceptable. Set
  `includeArchived: false` (archived is terminal and always filtered out anyway) to avoid scanning
  the archive.
- Alternatives considered: return a discriminated union — cleaner semantics but ripples through
  every mock; rejected for churn. Reference/read paths (history browsing) are unaffected and may
  still see terminal attempts.

### D6: Sidecar ownership — check-and-claim on write, jobId-scoped release on cancel

Liveness sidecar writes become check-and-claim: read the existing sidecar, look up the status of
the job it points to (via the occupancy scan for the same slug), and refuse to overwrite a
different **non-terminal** job's sidecar; a stale (terminal / absent) or same-jobId sidecar is
claimable. Cancel deletes the liveness sidecar and managed marker only when the recorded jobId
matches the canceled job — on normal cancel too (no more residue) — and `--purge`'s directory
removal is likewise jobId-gated. A losing concurrent claimant is refused, never silently
overwriting a foreign non-terminal sidecar. Genuine sidecar write I/O errors remain best-effort so
the liveness reconstruction contract holds.

- Rationale: ADR-20260801 D3. The start guard (D1) is the primary serialization of occupancy; the
  claim is the second line that keeps a foreign non-terminal binding from being clobbered.
- Alternatives considered: exclusive-create-only (`O_EXCL`) — rejected by ADR-20260801 because a
  stale terminal sidecar left by an old version / normal cancel would then block every new start.
  Checking the pointed-to job's status is the correct form.

### D7: Doctor detects (read-only); a separate, uniqueness-gated mechanical repair re-points the sidecar

A new storage-category doctor check reports (a) multiple non-terminal jobs per slug (breach,
enumerate only, no auto-fix) and (b) a sidecar pointing to a terminal/absent job while exactly one
non-terminal job exists (mismatch, hint to the repair). The doctor check is read-only, matching the
existing "detect then point to a command" style (e.g. `orphan-sidecars` → `job prune --force`). The
mechanical repair is a separate testable core function `repairSlugOccupancySidecar(repoRoot, slug,
deps)` that re-points the slug's liveness sidecar to the unique non-terminal job and refuses (with
an enumeration) when the non-terminal job is not unique.

- Rationale: ADR-20260801 D4 — the machine repairs only when the answer is unique; multiple
  candidates are left for human `cancel`. ADR-20260801 also restricts jobId-holding surgery verbs to
  `cancel` / `doctor`, so the repair belongs to the doctor surface, not a general `job` verb.
- CLI shape (recommended): expose the repair as a doctor-scoped entry — `specrunner doctor repair
  <slug>` — so a plain `specrunner doctor` stays purely read-only (backward compatible). The exact
  surface (subcommand vs. an opt-in flag on `doctor`) is an implementer decision; the behavior and
  the testable core function are fixed regardless. See Open Questions.
- Alternatives considered: a mutating `doctor --fix` that repairs all fixable findings — a broader
  change to the doctor runner architecture (every check would need a "fixable/apply" concept) and it
  moves plain `doctor` away from read-only; rejected for scope.

### D8: New error codes; retire the pid-only guard

Add error codes and factories (names at implementer discretion; recommended): `SLUG_OCCUPIED`
(occupancy rejection, both runtimes), `SLUG_STATE_UNREADABLE` (fail-closed), and
`SLUG_OCCUPANCY_AMBIGUOUS` (multiple non-terminal on resolve / repair). Map `SLUG_OCCUPIED` and
`SLUG_STATE_UNREADABLE` to `ARG_ERROR` (exit 2), matching the existing `DUPLICATE_LIVE_JOB`
precedent for pre-run setup rejections; `SLUG_OCCUPANCY_AMBIGUOUS` defaults to `GENERAL_ERROR`
(exit 1). `SLUG_OCCUPIED` carries the prior `jobId` and `status` as structured fields so the inbox
(D10) can build a deduped comment without parsing the message.

- Rationale: the request requires a code distinct from `DUPLICATE_LIVE_JOB`. The new code covers the
  live-prior case too, so `checkDuplicateLiveJob` / `duplicateLiveJobError` / `DUPLICATE_LIVE_JOB`
  become unused by the guard.
- The pid-only `checkDuplicateLiveJob` is removed (its only production caller is the guard). The
  `DUPLICATE_LIVE_JOB` ledger entry + factory + `EXIT_CODE_MAP` row MAY be removed if fully unused;
  removing them is low-risk (verified only the guard + its own tests reference them) but is left to
  implementer discretion to avoid unrelated churn.

### D9: Halt-aware Next guidance from `state.status`

`onPipelineComplete` reads `p.state.status`: `awaiting-archive` → archive hint; `awaiting-resume` →
`Next: specrunner job resume <slug>`. This applies to both the run and resume progress displays
(both wire `pipeline:complete`).

### D10: Inbox rejection as a pre-check in the start path

Because `runRunCore` swallows the guard throw into exit code 1, the inbox start path performs its
own occupancy pre-check for the target slug (reusing the shared occupancy scan, or the already
loaded `allJobStates` filtered to non-terminal for that slug). If the slug is occupied by a
non-terminal prior job, the inbox posts a deduped reject comment via the existing
`postRejectComment` seam (naming prior jobId / status / exit) and does not start. Dedup uses a
machine-readable marker that encodes the prior jobId (mirroring the notification-marker pattern in
`issue-notifier.ts`); the inbox already fetches comments for approved issues into `commentsByIssue`,
so the marker can be checked before posting.

- Rationale: the pipeline-run guard (D1) remains the authoritative enforcement; the inbox pre-check
  exists only to produce the user-facing, idempotent issue comment. Keeping it in the inbox
  execution layer matches "startJob 経路で拒否が発生した場合."
- Alternatives considered: change `runRunCore` to re-throw / return structured rejection info —
  changes the CLI return contract and touches every caller; rejected for scope.

### D11: Managed runtime symmetry

`managed.ts`'s `assertNoDuplicateLiveJob` stops being a no-op and runs the same state-based,
fail-closed guard against the managed record path (`marker.json` + co-located
`.specrunner/local/<slug>/state.json`). Managed cancel's marker teardown is jobId-gated (D6).
Because managed has no local pid, the guard's message defaults to the resume/cancel guidance.

## Risks / Trade-offs

- [Breaking: previously-allowed starts now reject] Slugs with `awaiting-archive` / `failed` /
  `terminated` occupants, or with a dead-pid `running` occupant, now reject new starts (old
  fail-open allowed them). → Mitigation: the rejection message names the occupant and routes to
  `archive` / `resume` / `cancel`; documented as the intended tightening (ADR-20260801 Negative
  outcome).
- [Existing tests fix the old fail-open behavior] `tests/unit/core/runtime/duplicate-slug-guard.test.ts`
  and `tests/unit/core/runtime/local-duplicate-guard.test.ts` assert "dead pid → allow" / "corrupted
  → allow." → Mitigation: update only those expectations, attributing the change to requirements 1 /
  2; all other existing tests must stay green unchanged.
- [Concurrency determinism at the filesystem layer] Two truly-concurrent claimants could both read a
  stale sidecar. → Mitigation: the start guard serializes occupancy; the claim additionally refuses
  to overwrite a foreign non-terminal sidecar (a losing claimant is refused, not silently
  overwriting). The acceptance criteria fix the sequential scenario and the stale/foreign unit
  cases; true FS race-freedom is defense-in-depth, not a tested guarantee.
- [Two scan implementations] The doctor check needs an injectable scan (test override, like
  `createOrphanSidecarsCheck`). → Mitigation: the doctor check calls the same `src/core/occupancy`
  scan with injectable deps; there is one classifier, not two.
- [Resolver throw reaches un-guarded call sites] `cli/resume.ts` / `cli/reopen.ts` call the resolver
  outside try/catch. → Mitigation: wrap those calls (D5); covered by tasks.

## Open Questions

- **Repair CLI surface**: `specrunner doctor repair <slug>` (recommended) vs. an opt-in flag on
  `specrunner doctor`. The behavior and the core `repairSlugOccupancySidecar` function are fixed
  either way; only the CLI wiring differs. Recommendation: doctor subcommand, so plain `doctor`
  stays read-only.
- **`cancelAllTerminated` collateral**: `--all-terminated` (`cancel/runner.ts:479-539`) removes
  `.specrunner/local/<slug>/` for each `failed` / `terminated` / `canceled` job unconditionally.
  Since `failed` / `terminated` are non-terminal occupants, this can collaterally delete a live
  slug's sidecar. It is not named in this request's requirements (req 3 is single-job cancel).
  Applying the same jobId-gate here is a candidate follow-up — flagged for the reviewer rather than
  silently expanding scope.
- **Doctor check severity**: report the breach/mismatch as `warn` (matching existing storage checks
  like `orphan-sidecars`, non-required) vs. `fail` (exit 1, reflecting a broken invariant).
  Recommendation: `warn`, since a repair/cancel exit exists; confirm during spec-review.
