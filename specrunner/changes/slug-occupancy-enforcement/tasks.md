# Tasks: slug-occupancy-enforcement

> Requirement numbers (R1–R8) refer to request.md. Spec requirements live in spec.md.
> Design decisions (D1–D11) live in design.md. The acceptance-criteria scenario teeth from
> request.md are covered by T-03/T-05/T-06/T-07/T-09/T-11 (unit) and T-12 (end-to-end).
> Error-code / port-method / repair-CLI names are implementer discretion (design.md D7/D8);
> the names below are recommendations.

## T-01: Occupancy scan core module (foundation)

- [ ] Create `src/core/occupancy/scan.ts` with `scanSlugOccupancy(repoRoot, slug, deps?)` returning
      `{ slug, nonTerminal: OccupantRef[], terminal: OccupantRef[], unreadable: string | null }`,
      where `OccupantRef = { jobId, status, updatedAt, pid: number | null, worktreePath: string | null }`.
- [ ] Enumerate the slug's candidate state locations: main checkout `specrunner/changes/<slug>/`,
      each `.git/specrunner-worktrees/*/specrunner/changes/<slug>/`, and managed
      `.specrunner/local/<slug>/` (co-located state for the marker path). Read each via the same
      split-layout composition used by the catalog. Dedup by jobId (newest `updatedAt`).
- [ ] Classify by `!TERMINAL_STATUSES.has(status)` (`src/state/lifecycle.ts`) — non-terminal set is
      `{ running, awaiting-resume, awaiting-archive, failed, terminated }` (D3). Do NOT use
      `ACTIVE_STATUSES`.
- [ ] Fail-closed (D4): set `unreadable` (with a reason) when a present state cannot be
      parsed/composed (including `JOURNAL_CORRUPTED`) or enumeration I/O fails (non-ENOENT). ENOENT
      (absent) is not unreadable. Inject fs/read deps for deterministic tests.
- [ ] Keep imports within core boundaries (store / state / util / errors). Do not import runtime or
      adapters.

**Acceptance Criteria**:
- Unit tests: one non-terminal + N terminal → `nonTerminal.length === 1`; terminal-only →
  `nonTerminal.length === 0`; two non-terminal → `nonTerminal.length === 2`; present-but-corrupted
  slug state → `unreadable !== null`; absent slug → `nonTerminal/terminal` empty and `unreadable === null`.
- `typecheck` passes.

## T-02: Error codes and factories

- [ ] Add to `src/errors.ts` `ERROR_CODES`: `SLUG_OCCUPIED`, `SLUG_STATE_UNREADABLE`,
      `SLUG_OCCUPANCY_AMBIGUOUS` (names at discretion).
- [ ] Add `EXIT_CODE_MAP` rows: `SLUG_OCCUPIED` and `SLUG_STATE_UNREADABLE` → `ARG_ERROR`
      (matching the `DUPLICATE_LIVE_JOB` precedent); `SLUG_OCCUPANCY_AMBIGUOUS` → default (`GENERAL_ERROR`).
- [ ] Add factories: `slugOccupiedError(slug, prior)` — message names prior `jobId` + `status` and a
      status-appropriate exit (D8); expose the prior `jobId` and `status` as structured fields on the
      error so the inbox (T-10) can dedup without parsing. `slugStateUnreadableError(slug, reason)`.
      `slugOccupancyAmbiguousError(slug, candidates)` — enumerates `jobId` / `status` / `updatedAt`
      and points to `specrunner doctor`.

**Acceptance Criteria**:
- Unit tests assert each factory's `code`, `exitCode`, and that `slugOccupiedError` exposes the prior
  jobId/status structurally and includes them in the message.

## T-03: Occupancy start guard (R1, R2 defense, R8)

- [ ] Add `src/core/occupancy/guard.ts` `assertSlugUnoccupied(repoRoot, slug, deps?)`: run
      `scanSlugOccupancy`; if `unreadable` → throw `slugStateUnreadableError` (fail-closed); else if
      `nonTerminal.length >= 1` → throw `slugOccupiedError` naming the prior job. Shape the message
      by `status` + `isProcessAlive(prior.pid)` (reuse `src/core/resume/safety.ts`): running+alive →
      wait/cancel; running+dead / awaiting-resume / failed / terminated → resume/cancel;
      awaiting-archive → archive/cancel.
- [ ] Rewire the port method `assertNoDuplicateLiveJob` (keep the name to bound port churn, D5/D8)
      in `src/core/runtime/local.ts` and `src/core/runtime/managed.ts` to delegate to
      `assertSlugUnoccupied`. Managed is no longer a no-op (R8). The call site at
      `src/core/command/pipeline-run.ts:125` is unchanged (still pre-`bootstrapJob`).
- [ ] Remove the pid-only `checkDuplicateLiveJob` (`src/core/runtime/duplicate-slug-guard.ts`); it
      has no other production caller. `DUPLICATE_LIVE_JOB` / `duplicateLiveJobError` may remain as a
      legacy ledger entry or be removed if fully unused (D8).

**Acceptance Criteria** (guard scenario tooth):
- Unit tests: non-terminal prior (`awaiting-resume`) → reject; `running` + pid alive → reject;
  `running` + pid dead → reject; terminal-only → allow; `unreadable` → reject. Rejection error names
  prior jobId + status.
- Managed guard rejects a non-terminal managed occupant (marker + co-located state) before any state
  is created; managed guard allows a terminal-only slug.
- The rejection creates no job state / worktree / sidecar (assert via the pre-`bootstrapJob` position
  — no persist occurs).

## T-04: Liveness sidecar check-and-claim (R2)

- [ ] Add `src/core/occupancy/claim.ts` `claimLivenessSidecar(repoRoot, slug, record, deps?)` where
      `record = { jobId, worktreePath, pid, session }`: read the existing sidecar; if it points to a
      different **non-terminal** job (via `scanSlugOccupancy`) → throw a structured claim-refusal
      error; else (absent / terminal / same jobId) → write atomically.
- [ ] Route `LocalRuntime.writeLivenessSidecar` (`src/core/runtime/local.ts:1423`) and the
      materializer write sites (`src/core/runtime/workspace-materializer.ts` lines 91/117/149/177)
      through the claim. Preserve best-effort swallow for genuine sidecar **I/O** write failures, but
      let the claim-refusal error propagate (fail-closed defense).

**Acceptance Criteria**:
- Unit tests: existing sidecar → terminal job → claim succeeds (overwrite); existing sidecar → same
  jobId → claim succeeds (refresh); existing sidecar → different non-terminal job → claim refused
  (sidecar left intact).

## T-05: Cancel jobId-scoped teardown (R3, R8)

- [ ] In `src/core/cancel/runner.ts`, gate the managed marker unlink (currently 423-431 unconditional)
      on the marker's recorded `jobId === state.jobId`.
- [ ] Add liveness-sidecar deletion on **normal** cancel (not only `--purge`), gated on the sidecar's
      recorded `jobId === state.jobId`. Do not delete a foreign job's sidecar.
- [ ] Gate the `--purge` directory removal (currently 437-459) so `.specrunner/local/<slug>/` is
      removed only when its contained sidecar/marker matches this jobId (or is absent/stale terminal);
      if it belongs to a different non-terminal job, skip with a warning.

**Acceptance Criteria** (cancel scenario tooth):
- Unit tests: sidecar/marker jobId matches → deleted on normal cancel; foreign jobId → left intact;
  `--purge` removes the dir only for a matching/stale sidecar and skips (with warning) for a foreign
  non-terminal sidecar.

## T-06: State-based slug resolution (R4)

- [ ] Rewrite `src/core/resume/resolve-job.ts` `resolveJobStateBySlug` to classify via non-terminal
      status (reuse the occupancy scan or `JobStateStore.list` with `includeArchived: false` filtered
      to non-terminal): one non-terminal → return it; zero → `null`; ≥2 → throw
      `slugOccupancyAmbiguousError` (enumerate candidates). `updatedAt` is display-order only (D5).
- [ ] Update callers that invoke the resolver outside a try/catch: `src/cli/resume.ts:47` and
      `src/cli/reopen.ts:58` must catch the ambiguous throw and surface message + exit. Confirm
      `src/core/command/resume.ts:105` and `src/core/command/reopen.ts:113` surface the message via
      their existing catch.

**Acceptance Criteria** (resolution scenario tooth):
- Unit tests: one non-terminal + N terminal (terminal `updatedAt` newer) → returns the non-terminal
  job; zero non-terminal → `null`; ≥2 non-terminal → throws enumeration error listing jobId / status
  / updatedAt.
- Existing `resolveJobStateBySlug` mocks in resume/reopen tests still compile (signature unchanged).

## T-07: Doctor occupancy check (R5, detection)

- [ ] Add `src/core/doctor/checks/storage/slug-occupancy.ts` (storage category, read-only) via a
      `createSlugOccupancyCheck(overrideScan?)` factory mirroring `orphan-sidecars`. Register it in
      `src/core/doctor/checks/index.ts` (`commonChecks`, storage block) and its re-export.
- [ ] Detect per slug (union of `specrunner/changes/*` and `.specrunner/local/*`): (a) ≥2 non-terminal
      → breach, enumerate candidates, no auto-selection; (b) sidecar points to a terminal/absent job
      while exactly one non-terminal job exists → mismatch, hint pointing to the repair entry (T-08).
- [ ] Report severity per design.md Open Question (recommended `warn`); pass when no breach/mismatch.

**Acceptance Criteria** (doctor scenario tooth, detection half):
- Unit tests (injected scan/fs): "sidecar points to a canceled job, a non-terminal job placed aside"
  → mismatch reported with repair hint; two non-terminal for a slug → breach enumerated with no
  auto-selection; clean repo → pass.

## T-08: Mechanical sidecar repair (R5, repair)

- [ ] Add `src/core/occupancy/repair.ts` `repairSlugOccupancySidecar(repoRoot, slug, deps?)`: run the
      occupancy scan; if exactly one non-terminal job and the sidecar points elsewhere
      (terminal/absent) → re-point the liveness sidecar to that job (`jobId` + `worktreePath` from its
      state; `pid`/`session` null) via `claimLivenessSidecar`; if ≥2 non-terminal → refuse with an
      enumeration; if zero non-terminal or already correct → no-op with a clear message.
- [ ] Wire the repair to the doctor surface (recommended `specrunner doctor repair <slug>`, D7): add
      the CLI entry + command-registry wiring; keep plain `specrunner doctor` read-only.

**Acceptance Criteria** (doctor scenario tooth, repair half):
- Unit tests: unique non-terminal + mismatched sidecar → sidecar re-pointed to the non-terminal job;
  ≥2 non-terminal → repair refused with enumeration (no auto-selection); already-correct / no
  non-terminal → no-op.

## T-09: Halt-aware Next guidance (R6)

- [ ] Change `src/cli/progress.ts` `onPipelineComplete(p)` to read `p.state.status` (payload type
      `{ state: JobState }`): `awaiting-archive` → `Next: specrunner job archive <slug>`;
      `awaiting-resume` → `Next: specrunner job resume <slug>`. Remove the unconditional archive hint.

**Acceptance Criteria** (Next-guidance scenario tooth):
- Unit tests: `pipeline:complete` with `awaiting-resume` → resume guidance; with `awaiting-archive`
  → archive guidance.

## T-10: Inbox occupancy-rejection propagation (R7)

- [ ] In `src/core/inbox/run-inbox.ts` start path (`executeStart` / default `startJob` effect), add an
      occupancy pre-check for the target slug (reuse the occupancy scan or filter `allJobStates` to
      non-terminal for that slug). If occupied by a non-terminal prior job, post a reject comment via
      the existing `postRejectComment` seam naming the prior `jobId` / `status` / exit, and do not
      start.
- [ ] Make the comment idempotent: dedup with a machine-readable marker encoding the prior jobId
      (mirror `issue-notifier.ts` markers); skip posting when a matching marker already exists in the
      issue's fetched comments (`commentsByIssue`). Add a comment builder (e.g.
      `buildOccupancyRejectComment`).

**Acceptance Criteria**:
- Unit tests: occupied slug → one reject comment naming prior jobId/status/exit; a second inbox cycle
  with the same prior job → no duplicate comment (marker dedup).

## T-11: End-to-end occupancy scenario tooth (R1–R3, R8)

- [ ] Add an integration test fixing the full loop: a job at `awaiting-resume` (halt) → a same-slug
      `start` is refused with the new occupancy error and creates no new state / sidecar → canceling
      the prior job deletes its own-jobId sidecar → a subsequent `start` for the slug succeeds.

**Acceptance Criteria**:
- The scenario passes end-to-end with real (temp-dir) state/sidecar fixtures; the refused start leaves
  no new state or liveness sidecar; the post-cancel start succeeds.

## T-12: Resolve the architecture divergence entry

- [ ] Update `architecture/divergence-status.md`: move the `2026-08-01` slug-occupancy known-divergence
      entry to the burn-down table, attributing it to change `slug-occupancy-enforcement` (per that
      doc's instruction "完了時に burn-down 表へ移す"). This touches out-of-loop `architecture/`
      (CODEOWNERS); if outside the implementer's write-scope, surface it as a required out-of-loop
      follow-up rather than force the edit.

**Acceptance Criteria**:
- The `2026-08-01` divergence is no longer listed as unresolved; the burn-down table names this change.

## T-13: Full verification

- [ ] Update only the existing tests that fixed the old fail-open guard behavior
      (`tests/unit/core/runtime/duplicate-slug-guard.test.ts`,
      `tests/unit/core/runtime/local-duplicate-guard.test.ts`), attributing the expectation changes to
      R1/R2. All other existing tests stay green unchanged.
- [ ] `typecheck && test` green.

**Acceptance Criteria**:
- `bun run typecheck` and `bun run test` both pass; no unrelated test expectations were modified.
