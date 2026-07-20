# Design: Extend `job prune` to orphan sidecars and replace doctor's raw `rm -rf` hint

## Context

Cleanup of orphan resources is asymmetric today.

- Orphan **worktrees** already have a full cleanup path: the `orphan-worktrees`
  doctor check (read-only warn) and a `specrunner job prune` command (dry-run by
  default, `--force` to delete). Both consumers share one detection
  implementation — `scanOrphanWorktrees` in `src/core/worktree/orphan.ts`
  (imported by `src/core/doctor/checks/storage/orphan-worktrees.ts` and
  `src/core/prune/runner.ts`).
- Orphan **sidecars** (`.specrunner/local/<slug>/` — machine-local liveness /
  managed markers for jobs that are archived, canceled, or whose state has
  disappeared) have a read-only detector (`orphan-sidecars` check) but **no
  cleanup command**. When orphans are found, the check hands the operator a raw
  `rm -rf` string to copy-paste.

The failure mode observed at scale (74 accumulated sidecars):

- `src/core/doctor/checks/storage/orphan-sidecars.ts:131-139` builds one ~8 KB
  `rm -rf` line by quote-joining 74 absolute paths into the `hint`, then repeats
  all 74 paths in `details`.
- `src/core/doctor/formatter.ts:60-64` prints every `details` entry, so the human
  output balloons past 150 lines and buries the other checks.

The detector being read-only is correct doctor design. The real gap is that the
deletion has no product-owned home, and the human report does not scale.

Relevant current facts (verified against the tree):

- `src/core/doctor/checks/storage/orphan-sidecars.ts:17-77` — `ACTIVE_STATUSES`
  (`running`, `awaiting-resume`, `awaiting-archive`, `failed`, `terminated`) and
  `isOrphanSidecar` are **private** to the check file. `isOrphanSidecar` reads
  `liveness.json` (for a `worktreePath` fallback), the main-checkout
  `specrunner/changes/<slug>/state.json`, and — on ENOENT — the worktree copy;
  it returns orphan when the status is `archived`/`canceled` or no state exists
  anywhere, and non-orphan for active statuses.
- `src/core/doctor/types.ts:19-30` — `DoctorResult` carries a single
  `details?: string[]` consumed by both formatters.
- `src/core/doctor/formatter.ts` — `formatHuman` prints all `details`;
  `formatJson` emits `details` verbatim when present and omits it when undefined.
- `src/cli/prune.ts:26-61` — `runPrune` resolves the repo root and delegates to
  `pruneOrphanWorktrees` (worktree-only), then writes `info`/`warnings`/`message`.
- `src/cli/command-registry.ts:82` / `:235-248` — the top-level help line and
  `PRUNE_USAGE` describe a worktree-only scope. `job prune` is already a
  worktree-guarded subcommand (`job.guardedSubcommands`, `:403`).
- `src/util/paths.ts:298-333` — sidecar path helpers: `localSidecarDir(slug)` →
  `.specrunner/local/<slug>`, `localSidecarBaseDirRel()` → `.specrunner/local`.
- The doctor real-fs adapter (`src/cli/doctor.ts:34-43`, `buildRealFs`) already
  exposes exactly `existsSync` / `readdirSync` / `stat` / `readFile`, so a
  read-only fs port is satisfied by both the injected `DoctorFs` mock and node's
  fs.

This change follows the symmetry the orphan-worktree work established ("the check
and prune share one scan implementation"); no new design axis is introduced.

## Goals / Non-Goals

**Goals**:

- Give orphan sidecars the same cleanup path worktrees have: `specrunner job
  prune` lists orphan worktrees **and** orphan sidecars (as distinct sections) in
  dry-run, and `--force` removes both. Active jobs' sidecars are never touched.
- Establish a single sidecar-orphan detection implementation, shared by the
  `orphan-sidecars` doctor check and the prune runner (mirror of
  `scanOrphanWorktrees`), preserving the exact current classification semantics.
- Replace the doctor `rm -rf` hint with an actionable `specrunner job prune`
  pointer.
- Round the human `details` to the first N + a remainder line, while keeping the
  full list in `--json`.

**Non-Goals**:

- Changing worktree-side prune logic (`pruneOrphanWorktrees`,
  `scanOrphanWorktrees`, work-guard) — untouched. `runPrune` only composes an
  additional sidecar step around it.
- Changing the orphan classification basis (the `ACTIVE_STATUSES` set and the
  archived/canceled/missing semantics are preserved verbatim).
- Changing the output format of any other doctor check.
- `--json` output for `job prune` itself, or auto/flag-less pruning.

## Decisions

### D1: One shared sidecar-orphan detection module

Extract the sidecar classification into a new
`src/core/sidecar/orphan.ts` — the direct analogue of
`src/core/worktree/orphan.ts`. It exports:

- `ACTIVE_STATUSES` — the same five non-terminal statuses, moved here unchanged.
- `isOrphanSidecar(deps, slug, sidecarDir): Promise<boolean>` — the current
  predicate, verbatim in behavior, rewritten to read through an injected
  read-only fs port and a `repoRoot` instead of a `DoctorContext`.
- `scanOrphanSidecars(deps): Promise<OrphanSidecar[]>` — enumerates
  `<repoRoot>/.specrunner/local/*`, keeps directory entries, applies
  `isOrphanSidecar`, and returns `{ slug, sidecarPath }` for each orphan, sorted
  by slug for deterministic output.
- Types: `OrphanSidecar { slug: string; sidecarPath: string }`,
  `SidecarScanFs` (read-only subset: `existsSync`, `readdirSync`, `stat`,
  `readFile`), `ScanSidecarDeps { repoRoot: string; fs: SidecarScanFs }`, and a
  `ScanSidecarsFn` alias for injection.

Both the doctor check and the prune runner import `scanOrphanSidecars`. The fs
port is deliberately the read-only subset that `DoctorFs` already satisfies
structurally, so the doctor check passes `{ repoRoot: ctx.cwd, fs: ctx.fs }`
directly and the prune CLI passes a node-fs adapter.

**Rationale**: requirement #2 forbids re-deriving orphan status in prune. A
shared, dependency-injected module keeps a single source of truth — if the check
and prune disagreed, doctor would count sidecars that prune refuses to delete
(or vice versa). Reading through an injected fs port (instead of `DoctorContext`)
lets the same function serve a read-only doctor mock and a real filesystem.

**Alternatives considered**:

- *Re-implement the predicate in prune.* Rejected: it is exactly the drift
  requirement #2 exists to prevent.
- *Keep the predicate in the doctor check file and have prune import from
  `checks/storage/`.* Rejected: makes `prune` depend on the `doctor` subtree and
  keeps the classification coupled to the check's presentation concerns. A
  neutral `src/core/sidecar/` home mirrors `src/core/worktree/orphan.ts`.
- *Fold sidecar statuses into the worktree module's `NON_TERMINAL_STATUSES`.*
  Rejected: merging the two sets is scope creep (it can regress worktree
  behavior) and the request scopes the `ACTIVE_STATUSES` set as immutable.

### D2: `job prune` prunes worktrees and sidecars as two sections; worktree logic untouched

`job prune` stays the single cleanup door. A new
`pruneOrphanSidecars(opts): Promise<PruneResult>` in
`src/core/prune/sidecar-runner.ts` mirrors the worktree runner's contract
(`PruneResult = { exitCode; message?; info?; warnings? }`, reused from
`src/core/prune/runner.ts`):

1. `scanOrphanSidecars(...)` (or an injected `scan` override) to get orphans.
2. No orphans → success message "No orphan sidecar directories found".
3. Dry-run (`force` false) → one `info` line per orphan ("Would remove: <path>")
   plus a "Dry-run: N orphan sidecar(s) would be removed. Use --force to delete."
   message; the filesystem is not touched.
4. `--force` → `fs.rm(sidecarPath, { recursive: true, force: true })` per orphan;
   per-orphan failures become warnings (best-effort), successes are counted, and
   the message reports "Removed N orphan sidecar(s)".

`runPrune` (`src/cli/prune.ts`) composes the two runners: it calls
`pruneOrphanWorktrees` and `pruneOrphanSidecars`, prints each under an explicit
section header ("Orphan worktrees:" / "Orphan sidecars:") so the two resource
kinds are visibly distinguished, and returns a combined exit code
(`worktree.exitCode || sidecar.exitCode`). Active sidecars are excluded by the
scan, so they are never listed and never deleted, under either mode.

**Rationale**: matches the worktree cleanup path exactly (dry-run default,
explicit `--force`, best-effort deletion), so operators learn one command. The
architect already rejected the alternatives: `doctor --fix` would break doctor's
read-only contract and invite fix-expectations on other checks; a new `clean`
command would create a second cleanup door and re-introduce the asymmetry in a
new shape. Composing at `runPrune` keeps `pruneOrphanWorktrees` byte-for-byte
unchanged (Non-Goal honored) — only the CLI orchestration grows.

**Alternatives considered**:

- *`doctor --fix`* / *new `clean` command* — rejected by the architect (see
  request "architect 評価済みの設計判断").
- *One merged scan that returns worktrees and sidecars together.* Rejected:
  worktree detection is git-porcelain + `JobStateStore.list` based; sidecar
  detection is fs-scan + per-slug state lookup. They share nothing but a status
  vocabulary; a merged scan would couple two unrelated I/O shapes.

### D3: Doctor hint points to `job prune`, not `rm -rf`

The `orphan-sidecars` check's `hint` changes from the quote-joined `rm -rf`
string to `Remove orphan sidecars with:\n  specrunner job prune --force` — the
same wording family the `orphan-worktrees` check already uses. The paths move out
of the hint entirely; they live only in `details` (full, for machines) and
`detailsHuman` (rounded, for people).

**Rationale**: the hint should name the product-owned action now that one exists,
not a raw destructive shell command. This also collapses the ~8 KB hint line to a
single short pointer.

### D4: Human `details` are rounded; `--json` keeps every entry

`DoctorResult` gains an optional `detailsHuman?: string[]`.

- `formatHuman` renders `r.detailsHuman ?? r.details`. Checks that do not set
  `detailsHuman` (all except `orphan-sidecars`) render exactly as before.
- `formatJson` continues to emit `r.details` (the full list) and never emits
  `detailsHuman`.

The `orphan-sidecars` check computes both: `details` = every orphan path;
`detailsHuman` = the first `N` paths followed by a `…and K more` line when
`orphans.length > N` (where `K = orphans.length - N`). `N` is a named constant
(`SIDECAR_DETAILS_HUMAN_LIMIT`) so tests can pin the boundary.

**Rationale**: rounding is a display concern, not a data concern — machine
consumers need the full set (the architect rejected rounding JSON). A dedicated
human field keeps the change localized to `orphan-sidecars`: because only that
check sets `detailsHuman`, no other check's human or JSON output changes
(Non-Goal honored). The `?? details` fallback means the type addition is purely
additive.

**Alternatives considered**:

- *Truncate generically inside `formatHuman` for every check.* Rejected: it would
  change the human output of any other check with a long `details` list (e.g.
  `orphan-worktrees`), violating the "other checks' output format is out of
  scope" boundary.
- *Round `details` in the check and drop the full list.* Rejected: `--json` must
  keep all entries (T4 / architect decision).

### D5: Active-sidecar protection is the deletion guard, preserved from the current predicate

Because prune deletes exactly what `scanOrphanSidecars` returns, and the scan
excludes any sidecar whose job status is in `ACTIVE_STATUSES` (or whose state is
otherwise non-terminal), active jobs' sidecars are structurally protected in both
dry-run and `--force`. The guard is the shared predicate itself — there is no
second, prune-local check to drift. Neutralizing the active-status branch (the
T2 "破壊確認") makes an active sidecar be classified as orphan and therefore
deleted, which the acceptance test detects by asserting the active sidecar
survives `--force`.

**Rationale**: keeping the guard inside the shared predicate (D1) means the same
logic that lets doctor *not warn* about active sidecars is what stops prune from
*deleting* them — one tooth, two consumers.

## Risks / Trade-offs

- [Risk] **fs-port compatibility.** The shared scan needs a port satisfied by both
  the `DoctorFs` mock and node's fs. → Mitigation: define `SidecarScanFs` as the
  read-only subset (`existsSync`, `readdirSync`, `stat`, `readFile`) that
  `DoctorFs` already provides and `buildRealFs` already constructs; deletion
  (`rm`) lives only in the prune deps, never in the scan or the doctor path
  (preserves read-only doctor).
- [Risk] **Existing `orphan-sidecars` tests assert the old hint.** `W-03` asserts
  paths appear in `hint`. → Mitigation: this is the explicit T6 carve-out; the
  test's hint assertions become details/`job prune` assertions. `details` keeps
  every path, so `W-01`/`W-02` details assertions stay valid.
- [Risk] **`runPrune` output/exit-code change** could surprise a caller. →
  Mitigation: no test asserts `job prune` CLI stdout today; the worktree section
  keeps its existing wording, only gaining a preceding header; exit code is the
  max of the two runners (1 only on a hard scan failure).
- [Risk] **Partial `--force` deletion** (some `fs.rm` fail). → Mitigation:
  best-effort — each failure is a warning, the command continues and still exits
  0, matching worktree-prune semantics; a re-run is idempotent (already-removed
  sidecars are simply absent from the next scan).
- [Risk] **Slug directory that is not actually a sidecar** (stray dir). →
  Mitigation: the scan already stat-filters to directories and classifies by
  state lookup; an unrelated directory with no job state is, by the preserved
  semantics, an orphan — same behavior as today's check.

## Open Questions

- None blocking. (`--json` for `job prune` and a shared status-vocabulary
  constant between the worktree and sidecar modules are deliberately deferred.)
