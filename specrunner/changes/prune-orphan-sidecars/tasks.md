# Tasks: Extend `job prune` to orphan sidecars and replace doctor's raw `rm -rf` hint

<!--
Request acceptance criteria are referenced as AC-T1 … AC-T6:
  AC-T1 dry-run enumerates orphan sidecars only, no FS change
  AC-T2 --force deletes orphan sidecars, keeps active ones (+破壊確認)
  AC-T3 doctor hint points to `job prune`, no `rm -rf`
  AC-T4 human details rounded to N + remainder; --json full
  AC-T5 orphan predicate shared by doctor check and prune
  AC-T6 typecheck && test green (prune/doctor tests unchanged except the
        orphan-sidecars hint/details expectation update)
-->

## T-01: Shared sidecar-orphan detection module

- [ ] Create `src/core/sidecar/orphan.ts` as the single source of truth for
      sidecar-orphan classification (imported by both the doctor check and the
      prune runner). Mirror the shape of `src/core/worktree/orphan.ts`.
- [ ] Move `ACTIVE_STATUSES` here verbatim (`running`, `awaiting-resume`,
      `awaiting-archive`, `failed`, `terminated`). Do NOT change the set.
- [ ] Define and export types:
  - `OrphanSidecar { slug: string; sidecarPath: string }` (`sidecarPath` is the
    absolute path to `.specrunner/local/<slug>`).
  - `SidecarScanFs` — read-only fs port: `existsSync(p): boolean`,
    `readdirSync(p): string[]`, `stat(p): Promise<{ isDirectory(): boolean }>`,
    `readFile(p, enc: "utf-8"): Promise<string>`. Keep it a subset that the
    existing `DoctorFs` satisfies structurally (so `ctx.fs` is assignable).
  - `ScanSidecarDeps { repoRoot: string; fs: SidecarScanFs }`.
  - `ScanSidecarsFn = (deps: ScanSidecarDeps) => Promise<OrphanSidecar[]>` (for
    dependency injection in tests / the check factory).
- [ ] Implement `isOrphanSidecar(deps: ScanSidecarDeps, slug, sidecarDir): Promise<boolean>`
      by lifting the current predicate from
      `src/core/doctor/checks/storage/orphan-sidecars.ts:26-77` **without
      changing its semantics**: read `liveness.json` for a `worktreePath`
      fallback; read the main-checkout `specrunner/changes/<slug>/state.json`
      (relative to `deps.repoRoot`); on ENOENT try the worktree copy; orphan when
      status is `archived`/`canceled` or no state exists anywhere; non-orphan for
      `ACTIVE_STATUSES` and for unknown/malformed states. Replace `ctx.fs` →
      `deps.fs` and `ctx.cwd` → `deps.repoRoot`.
- [ ] Implement `scanOrphanSidecars(deps: ScanSidecarDeps): Promise<OrphanSidecar[]>`:
  1. Resolve the base dir `<repoRoot>/.specrunner/local` (use
     `localSidecarBaseDirRel()` from `src/util/paths.ts`).
  2. If the base does not exist or `readdirSync` throws → return `[]`.
  3. For each entry, stat-filter to directories (skip non-directories and stat
     errors), apply `isOrphanSidecar`, and collect `{ slug, sidecarPath }` for
     orphans.
  4. Sort the result by `slug` for deterministic ordering.
- [ ] The module MUST be read-only (no `rm`/`unlink`) — deletion belongs to the
      prune runner (T-04), not the shared scan.

**Acceptance Criteria** (AC-T5):
- `scanOrphanSidecars` returns an orphan entry for `archived`, `canceled`, and
  missing-state sidecars, and omits sidecars whose status is in
  `ACTIVE_STATUSES` — verified with an injected `SidecarScanFs` mock.
- `scanOrphanSidecars` returns `[]` when `.specrunner/local/` is absent.
- A destructive-confirmation unit test: neutralizing the active-status branch of
  `isOrphanSidecar` causes an active-status sidecar to be classified as orphan.
- `typecheck` and `test` pass for the new module.

## T-02: Refactor the `orphan-sidecars` doctor check onto the shared scan

- [ ] Rewrite `src/core/doctor/checks/storage/orphan-sidecars.ts` to delegate to
      `scanOrphanSidecars` (T-01). Remove the private `ACTIVE_STATUSES` and
      `isOrphanSidecar` (now imported) and the inline readdir/stat loop.
- [ ] Adopt the factory shape used by `orphan-worktrees.ts`: export
      `createOrphanSidecarsCheck(overrideScan?: ScanSidecarsFn): DoctorCheck`
      plus a default `orphanSidecarsCheck = createOrphanSidecarsCheck()`. The
      check calls the scan with `{ repoRoot: ctx.cwd, fs: ctx.fs }`.
- [ ] Result mapping:
  - No `.specrunner/local/` or no orphans → `pass` (keep the existing messages).
  - Orphans → `warn` with:
    - `message`: `Found N orphan sidecar director(y|ies) (archived/missing jobs)`.
    - `hint`: `Remove orphan sidecars with:\n  specrunner job prune --force`
      (AC-T3 — no `rm -rf`, no path list in the hint).
    - `details`: every orphan `sidecarPath` (full list, for `--json`).
    - `detailsHuman`: first `SIDECAR_DETAILS_HUMAN_LIMIT` paths, followed by a
      `…and K more` line when `orphans.length > SIDECAR_DETAILS_HUMAN_LIMIT`
      (`K = orphans.length - N`); when `≤ N`, set `detailsHuman` equal to the
      full list (or leave undefined so it falls back to `details`).
  - Preserve `name: "orphan-sidecars"`, `category: "storage"`, `required: false`.
- [ ] Define `SIDECAR_DETAILS_HUMAN_LIMIT` as an exported named constant so tests
      can pin the rounding boundary.
- [ ] Keep the check read-only. Do not touch `index.ts` registration ordering or
      any other check.

**Acceptance Criteria** (AC-T3, AC-T5):
- With orphans present, the check's `hint` contains `specrunner job prune` and
  does NOT contain `rm -rf`.
- A factory-override test (`createOrphanSidecarsCheck(mockScan)`) proves the
  check delegates to the injected scan — i.e. it no longer inlines its own
  predicate.
- `details` still contains every orphan path (so existing `W-01`/`W-02`
  details-presence assertions hold).
- `typecheck` and `test` pass.

## T-03: `DoctorResult.detailsHuman` + human-only rounding in the formatter

- [ ] Add optional `detailsHuman?: string[]` to `DoctorResult` in
      `src/core/doctor/types.ts` (additive; documents that it is a human-only
      rounded view of `details`).
- [ ] In `src/core/doctor/formatter.ts`:
  - `formatHuman`: render `r.detailsHuman ?? r.details` (so checks without
    `detailsHuman` are byte-identical to today).
  - `formatJson`: unchanged — continue emitting `r.details` (full) and never emit
    `detailsHuman` (do not add it to `JsonResultEntry`).

**Acceptance Criteria** (AC-T4, AC-T6):
- A formatter test: a result with `details` of length `> N` and a `detailsHuman`
  of `N + 1` entries renders `N + 1` bullet lines in `formatHuman`, while
  `formatJson` emits the full `details` and no `detailsHuman` key.
- Existing formatter tests (`tests/core/doctor/formatter.test.ts`) pass
  unchanged.

## T-04: `job prune` sidecar runner

- [ ] Create `src/core/prune/sidecar-runner.ts` exporting
      `pruneOrphanSidecars(opts): Promise<PruneResult>` where:
  - `PruneResult` is reused from `src/core/prune/runner.ts`
    (`{ exitCode: 0 | 1; message?; info?; warnings? }`).
  - `opts = { force: boolean; deps: SidecarPruneDeps }`.
  - `SidecarPruneDeps { repoRoot: string; fs: SidecarPruneFs; scan?: ScanSidecarsFn }`
    where `SidecarPruneFs` extends `SidecarScanFs` with
    `rm(path, opts: { recursive: boolean; force: boolean }): Promise<void>`, and
    `scan` defaults to `scanOrphanSidecars` (override enables the T2 destructive
    test).
- [ ] Behavior:
  1. Scan orphans via `deps.scan ?? scanOrphanSidecars({ repoRoot, fs })`. A hard
     scan failure → `{ exitCode: 1, message: "Failed to scan for orphan sidecars: …" }`.
  2. No orphans → `{ exitCode: 0, message: "No orphan sidecar directories found" }`.
  3. Dry-run (`force` false) → one `info` line per orphan
     (`Would remove: <sidecarPath>`) and message
     `Dry-run: N orphan sidecar(s) would be removed. Use --force to delete.`
     Do NOT call `fs.rm`.
  4. `--force` → for each orphan, `fs.rm(sidecarPath, { recursive: true, force: true })`;
     on rejection push a warning and continue (best-effort); count successes;
     message `Removed N orphan sidecar(s)`.
  - `exitCode` is `0` on success/no-op; `1` only on the hard scan failure.

**Acceptance Criteria** (AC-T1, AC-T2):
- **AC-T1**: with a fixture mixing orphan and active sidecars, dry-run lists only
  the orphans and calls no `rm` (assert `fs.rm` not called; assert active
  sidecars absent from `info`).
- **AC-T2**: `--force` calls `rm` for the orphan `sidecarPath`(s) and NOT for the
  active-job `sidecarPath`; the active sidecar remains.
- **AC-T2 破壊確認**: a variant that neutralizes active-status detection (via a
  `scan` override / predicate mutation) causes the active sidecar to be deleted —
  proving the guard is load-bearing (the test asserting "active sidecar remains"
  goes red).
- `typecheck` and `test` pass.

## T-05: `runPrune` CLI composition + usage updates

- [ ] Extend `runPrune` in `src/cli/prune.ts` to run BOTH runners after resolving
      the repo root:
  - `pruneOrphanWorktrees({ force, deps: { repoRoot, spawn, worktreeManager } })`
    — unchanged call.
  - `pruneOrphanSidecars({ force, deps: { repoRoot, fs: <node-fs adapter> } })`.
  - Build the node-fs adapter inline (`existsSync`, `readdirSync`, `fs.promises.stat`,
    `fs.promises.readFile`, `fs.promises.rm`), mirroring `buildRealFs` in
    `src/cli/doctor.ts` plus `rm`.
- [ ] Print the two results under explicit, labeled sections
      ("Orphan worktrees:" / "Orphan sidecars:") so the resource kinds are
      distinguished; keep the existing worktree wording within its section
      (reuse the current `writeResult` for each section body).
- [ ] Combine exit codes: return `worktreeResult.exitCode || sidecarResult.exitCode`.
- [ ] Update usage text to cover worktrees + sidecars:
  - `src/cli/command-registry.ts:82` help line (currently
    "orphan worktree を列挙（--force で削除）").
  - `PRUNE_USAGE` (`src/cli/command-registry.ts:235-248`) — describe the combined
    worktree + sidecar scope and the dry-run/`--force` behavior for both.
- [ ] `job prune` is already in `job.guardedSubcommands` — no change there.

**Acceptance Criteria** (AC-T1, AC-T2, AC-T6):
- `runPrune` invokes both runners and its exit code is the max of the two.
- Sidecar deletion under `--force` goes through `pruneOrphanSidecars` (verified by
  the runner tests in T-04); the CLI wires the real node-fs adapter.
- `specrunner job prune --help` prints the updated `PRUNE_USAGE` mentioning both
  worktrees and sidecars.
- `typecheck` and `test` pass.

## T-06: Tests and full verification

- [ ] Shared module tests (T-01): `scanOrphanSidecars` classification matrix
      (archived / canceled / missing / each active status) + empty-base +
      determinism, and the `isOrphanSidecar` destructive-confirmation.
- [ ] Doctor check tests (T-02): update
      `src/core/doctor/checks/storage/orphan-sidecars.test.ts` for the new hint
      (`W-03`: assert `job prune` in hint and paths in `details`, drop the
      "paths in hint" assertion); add the factory-override delegation test; add
      the rounding test (`> N` orphans → `detailsHuman` has `N + 1` entries with a
      remainder line, `details` has all). This expectation update is the explicit
      T6 carve-out.
- [ ] Formatter tests (T-03): `detailsHuman` renders in human, `details` (full)
      in JSON, no `detailsHuman` key in JSON.
- [ ] Sidecar prune runner tests (T-04): dry-run-no-delete, force-delete-orphan,
      keep-active, best-effort-on-`rm`-failure, idempotent re-run, and the
      破壊確認 variant.
- [ ] Confirm existing `pruneOrphanWorktrees` tests
      (`tests/unit/core/prune/runner.test.ts`) and unrelated doctor tests remain
      green **without modification**.
- [ ] Run the full gate: `typecheck && test` green.

**Acceptance Criteria** (AC-T1 … AC-T6):
- All request acceptance criteria are covered:
  - AC-T1 dry-run enumerates orphan sidecars only, no FS mutation;
  - AC-T2 `--force` deletes orphan sidecars, keeps active ones, with 破壊確認;
  - AC-T3 doctor hint points to `job prune`, no `rm -rf`;
  - AC-T4 human `details` rounded to N + remainder, `--json` full;
  - AC-T5 orphan predicate is the same shared function in both consumers;
  - AC-T6 `typecheck && test` green; existing prune/doctor tests unchanged except
    the orphan-sidecars hint/details expectation update.
