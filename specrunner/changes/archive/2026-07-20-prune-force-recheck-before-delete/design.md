# Design: Re-verify orphan status immediately before deleting a sidecar under `job prune --force`

## Context

`specrunner job prune --force` removes orphan sidecar directories under
`.specrunner/local/<slug>/`. The current runner
(`src/core/prune/sidecar-runner.ts`, `pruneOrphanSidecars`) takes a snapshot in
Step 1 (`scanOrphanSidecars`) and, in Step 4, deletes each returned
`sidecarPath` with `fs.rm(recursive, force)` **without any re-check between scan
and delete** (L99-109).

The guarantee "an active job's sidecar is never touched, in dry-run or under
`--force`" is enforced only by the scan filter (`scanOrphanSidecars` /
`isOrphanSidecar` exclude any slug whose `state.json` status is in
`ACTIVE_STATUSES`). That filter reflects the world **as of the scan**. If a job
for the same slug becomes active *after* the scan but *before* the delete —
e.g. a concurrent `job start` / resume writes `state.json` + a fresh
`liveness.json` — the stale scan snapshot still lists that slug as an orphan and
`fs.rm` deletes the now-live sidecar. This is a classic TOCTOU (time-of-check to
time-of-use) window.

The blast radius of a wrong deletion is not cosmetic. `liveness.json` carries
`{ pid, session, worktreePath, jobId }` for the running process. Its loss
degrades liveness-dependent features:

- `src/core/resume/safety.ts` `isStaleRunning` resolves a running job's PID from
  the sidecar when `state.pid` is absent; a **missing sidecar is treated as
  stale** (L58-61). So deleting a freshly-active sidecar can make a genuinely
  live job look dead, letting resume proceed against a still-running process.
- `src/cli/ps.ts` and other consumers read the sidecar for monitoring display.

Relevant current facts (verified against the tree):

- `src/core/prune/sidecar-runner.ts` — `pruneOrphanSidecars`; scan at L68, the
  best-effort `--force` delete loop at L99-109; `SidecarPruneFs` = `SidecarScanFs`
  + `rm` (L26-28); `SidecarPruneDeps` already carries `repoRoot`, `fs`, and an
  injectable `scan?` (L30-35).
- `src/core/sidecar/orphan.ts` — `isOrphanSidecar(deps, slug, sidecarDir)` is a
  standalone exported predicate (L66); its `deps` is
  `ScanSidecarDeps { repoRoot; fs: SidecarScanFs }`. It **never throws**:
  malformed / unknown / unreadable state resolves to `false` (not orphan), and
  it returns `true` only for `archived` / `canceled` / no-state-anywhere.
  `ACTIVE_STATUSES` = running / awaiting-resume / awaiting-archive / failed /
  terminated (L20-26).
- `src/cli/prune.ts` — `runPrune` is the **only** production caller of
  `pruneOrphanSidecars` (L82); it builds a node-fs `SidecarPruneFs` adapter
  (L50-57) and `writeResult` already prints `warnings[]` to stderr and keeps the
  process exit code from the runner (L114-133).

## Goals / Non-Goals

**Goals**:

- Close the scan→delete TOCTOU window for sidecars by re-evaluating orphan
  status **per slug, immediately before each `fs.rm`**, under `--force`. If the
  slug is no longer an orphan (became active after the scan), skip the deletion
  and surface the skip (slug + reason) in the output.
- Preserve every other observable behavior: dry-run stays a pure enumeration
  (no re-check, no `fs.rm`), deletion stays best-effort, the exit-code contract
  is unchanged (0 on success/no-op/skip, 1 only on a hard scan failure), and the
  output format is unchanged except for the added skip lines.
- Keep the existing runner and CLI unit tests green without modification (aside
  from the new skip-output expectations that the new tests introduce).

**Non-Goals**:

- Worktree-side prune (`pruneOrphanWorktrees` / `scanOrphanWorktrees`) — a
  separate `git worktree` deletion path; out of scope (a separate request if
  ever needed).
- Changing the orphan classification basis (`ACTIVE_STATUSES`, the
  archived/canceled/missing semantics of `isOrphanSidecar`) — reused verbatim.
- Changing the `orphan-sidecars` doctor check.
- Introducing a cross-command lock (run / resume / prune) — evaluated in D3 and
  deliberately deferred; the residual window is documented instead.

## Decisions

### D1: Per-slug re-check immediately before delete, injected as a dependency

`pruneOrphanSidecars` gains an injectable re-check dependency and calls it once
per orphan, in the `--force` loop, right before `fs.rm`:

- Add `recheck?: RecheckSidecarFn` to `SidecarPruneDeps`, where
  `RecheckSidecarFn = (deps: ScanSidecarDeps, slug: string, sidecarDir: string)
  => Promise<boolean>` — structurally the signature of `isOrphanSidecar`.
- In the `--force` loop, for each `orphan`:
  1. `const stillOrphan = await doRecheck({ repoRoot, fs }, orphan.slug,
     orphan.sidecarPath)`.
  2. If `stillOrphan` is `false` → **do not delete**; push a skip warning
     (`… skipped sidecar for '<slug>' at <path>: no longer orphan (became active
     after scan)`) and `continue`.
  3. Otherwise delete exactly as today
     (`fs.rm(sidecarPath, { recursive: true, force: true })`, best-effort).
- The re-check reuses the **same shared predicate** the scan uses
  (`isOrphanSidecar`), so the "active job ⇒ not orphan ⇒ not deleted" rule is
  one source of truth in both check phases — no second, drift-prone predicate.

**Where the production predicate is wired.** `runPrune` (`src/cli/prune.ts`) —
the sole production caller — injects `recheck: isOrphanSidecar` into the sidecar
deps alongside the existing node-fs adapter. The runner's default (when
`recheck` is absent) is a pass-through that trusts the scan classification
(returns `true`, i.e. "still orphan, delete"), which preserves the pre-change
behavior for callers/tests that inject only a `scan`.

**Rationale — why inject rather than default the runner to `isOrphanSidecar`.**
`isOrphanSidecar` returns `false` for *both* an active job *and* an
absent/malformed `state.json`; it cannot distinguish them. The existing
`--force` runner tests stub `fs.readFile` minimally (they inject a `scan`
override and never provide realistic per-slug `state.json`), so a runner that
ran the fs-reading predicate *by default* would classify those fixtures as
non-orphan and skip every deletion, breaking ~7 existing tests. Mirroring the
runner's existing `scan?` seam — where the **runner** accepts an injected
predicate and the **CLI** wires the real one — keeps those tests valid while the
production path (`runPrune`) is fully protected. The wiring is itself pinned by a
test (D1 acceptance below), so protection cannot silently regress into a genuine
production fail-open.

**Rationale — why per-slug at delete time, not a second full scan.** A single
re-scan before the loop still leaves the tail of the list stale while the head
is being deleted (a slug can go active during the loop). Re-checking each slug
in the instant before its own `fs.rm` gives the tightest practical check point.
(This is the architect-accepted choice; whole-scan re-run was rejected.)

**Alternatives considered**:

- *Runner defaults to `isOrphanSidecar` (safe-by-default, no CLI wiring).*
  Rejected: incompatible with keeping existing runner tests unmodified (see
  rationale above) because the predicate cannot tell "active" from "no fixture
  data" apart.
- *Re-scan the whole set once before deleting.* Rejected by the architect: the
  window is narrowed but not per-slug-tight; a slug that activates mid-loop is
  still deleted.
- *Delete first, then verify and "undo".* Rejected: deletion is not reversible;
  the point is to not delete a live sidecar in the first place.

### D2: A skip is a normal outcome — warning + exit 0, not a failure

When the re-check spares a sidecar, that is the command doing its job correctly,
not an error:

- The skip is recorded in `warnings[]` (slug + reason), which `runPrune`'s
  `writeResult` already routes to stderr. `exitCode` stays `0`.
- The success `message` keeps its current shape — `Removed N orphan sidecar(s)`
  — where `N` counts only sidecars actually deleted. Skipped sidecars are absent
  from the removed count and appear only as warnings, so no existing message
  assertion changes.
- Re-check that *rejects* (only possible for an injected predicate;
  `isOrphanSidecar` never throws) is treated fail-safe: **skip the deletion**,
  emit a warning, keep exit 0. The command never deletes when the re-check is
  inconclusive.

**Rationale.** "Refused to delete something that should not be deleted" is the
desired behavior; making it non-zero would generate false alarms in cron / CI
wrappers that treat exit code as health. This matches the request's rejected
alternative ("skip で exit 非ゼロ" — rejected) and the existing best-effort exit
convention (D4 of the original sidecar-prune design: warnings keep exit 0). The
fail-safe direction (skip on uncertainty) is consistent with the protection's
whole purpose — never touch a possibly-live sidecar.

**Alternatives considered**:

- *Non-zero exit on skip.* Rejected (above; and by the architect).
- *Delete on re-check error (fail toward cleanup).* Rejected: it re-opens the
  exact "delete a live sidecar" hole this change closes; leftover orphans are
  reclaimed on the next `job prune` run anyway.

### D3: No cross-command lock; the residual window is documented

The re-check narrows the danger window from "the whole scan→loop duration" to
"the few instructions between the re-check's final `state.json` read and
`fs.rm`". A truly race-free guarantee would need a slug-scoped lock shared by
`run`, `resume`, and `prune`, so that a job cannot transition to active while
prune holds the slug. This change **does not** introduce that lock.

- **Why defer.** A shared lock spans three independent code paths (job start,
  resume, prune) and a new lock lifecycle (acquire/release/stale-lock recovery)
  — a scope jump well beyond "add a re-check to one delete loop", and itself a
  new failure surface (stale locks blocking legitimate runs). The request scopes
  the lock as a design judgment, not a requirement.
- **Residual window.** Between the re-check read and `fs.rm(sidecarPath)`, a
  concurrent `job start`/resume for the same slug could write `state.json` +
  `liveness.json`; prune, already past its re-check, would still delete the
  freshly-written sidecar.
- **Residual impact when it happens.** Only the *machine-local* sidecar
  (`liveness.json` = `{ pid, session, worktreePath, jobId }`, plus any managed
  `marker.json`) is lost. The authoritative job state is branch-borne under
  `specrunner/changes/<slug>/` and is **not** in the sidecar, so the job is not
  lost. The observable degradation is liveness-dependent:
  `isStaleRunning` (resume/safety.ts) treats a missing sidecar as **stale**, so
  a genuinely running job can be misjudged dead until its sidecar is
  re-materialized on the next run/resume; `ps` shows the job without liveness
  detail. There is no state-journal corruption and the loss self-heals on the
  next `run`/`resume` (which rewrites the sidecar).
- **Probability.** The realistic concurrency is a human-triggered `job prune`
  overlapping an automated `job start`/resume. The re-check reduces the exposed
  window by orders of magnitude (from seconds of scanning/looping to the
  sub-millisecond read→rm gap), which is sufficient for that operational
  profile. If a strict guarantee is later required, the lock is the follow-up
  (see Open Questions).

**Rationale.** The request's mandatory requirement is the re-check; the lock is
explicitly left to design judgment "見て別途判断". Documenting the precise
residual window + its bounded, self-healing impact lets that later call be made
on evidence rather than folding a 3-path locking change into this one.

**Alternatives considered**:

- *Introduce the shared slug lock now.* Rejected: scope jump across run/resume/
  prune plus a new stale-lock failure mode; the re-check already closes the
  practical window. Deferred, not dismissed.
- *Use an atomic `rename`-into-trash before `rm`.* Rejected: `rename` is not the
  check — it does not consult job state, so it would still move a live sidecar;
  it only changes *how* the wrong deletion manifests.

### D4: Dry-run and worktree prune are untouched

Dry-run (`force === false`) returns before Step 4 and performs **no** re-check
and **no** `fs.rm` — it remains a pure enumeration of the scan snapshot, exactly
as today. The worktree runner (`pruneOrphanWorktrees`) and `runPrune`'s output
sections/exit-code composition are unchanged except that the sidecar deps now
also carry `recheck: isOrphanSidecar`.

**Rationale.** The request scopes the change to the `--force` delete path;
re-checking during a read-only listing would add cost and could make dry-run
disagree with a subsequent `--force` in ways that confuse operators. Keeping the
worktree path byte-for-byte identical honors the non-goal.

## Risks / Trade-offs

- [Risk] **The runner default is a pass-through ("trust scan"), which looks
  fail-open.** → Mitigation: the sole production caller (`runPrune`) injects the
  real `isOrphanSidecar`, and a CLI test asserts that wiring
  (`deps.recheck === isOrphanSidecar`), so the production path can never silently
  lose the re-check. The runner's own skip logic is pinned by the T1 破壊確認
  (removing the re-check branch makes an active-turned sidecar get deleted →
  test goes red).
- [Risk] **Residual TOCTOU window remains (read→rm gap).** → Mitigation: window
  reduced by orders of magnitude vs. scan→loop; impact bounded to machine-local
  liveness loss that self-heals on next run/resume; documented in D3 with a
  named follow-up (lock) if a strict guarantee is needed.
- [Risk] **Re-check adds a per-slug `state.json` read under `--force`.** →
  Mitigation: bounded by orphan count (already enumerated); dry-run adds nothing;
  `isOrphanSidecar` is the same lightweight read the scan already performs.
- [Risk] **A slug legitimately still orphan but with an unreadable
  `state.json`** could be spared. → Mitigation: `isOrphanSidecar` returns `true`
  (orphan) for the no-state-anywhere case and only `false` for a *present*
  non-terminal/malformed state; a re-run reclaims anything transiently skipped,
  consistent with best-effort/idempotent prune.
- [Risk] **New skip warnings on stderr could surprise a caller parsing output.**
  → Mitigation: they are additive warning lines under the existing
  "Orphan sidecars:" section; exit code and the `Removed N` message are
  unchanged, so exit-code-driven automation is unaffected.

## Open Questions

- None blocking. Deferred (non-blocking): a slug-scoped lock shared by run /
  resume / prune to eliminate the residual read→rm window (D3) — to be decided
  separately if the documented residual impact proves unacceptable in practice.
