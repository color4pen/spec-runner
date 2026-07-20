# Tasks: Re-verify orphan status before deleting a sidecar under `job prune --force`

<!--
Request acceptance criteria referenced as AC-T1 … AC-T4:
  AC-T1 scan→delete race: an active-after-scan sidecar is skipped (+破壊確認)
  AC-T2 a still-orphan sidecar is still deleted (no false skips)
  AC-T3 dry-run/best-effort/exit-code/output preserved; existing runner + CLI
        tests unchanged except added skip-output expectations
  AC-T4 typecheck && test green
-->

## T-01: Add an injectable per-slug re-check to the sidecar prune runner

- [ ] In `src/core/prune/sidecar-runner.ts`, define and export a re-check
      function type mirroring `isOrphanSidecar`:
      `RecheckSidecarFn = (deps: ScanSidecarDeps, slug: string, sidecarDir: string) => Promise<boolean>`
      (import `ScanSidecarDeps` from `../sidecar/orphan.js`).
- [ ] Add an optional `recheck?: RecheckSidecarFn` field to `SidecarPruneDeps`.
      Document it: overrides the per-slug re-check performed immediately before
      each deletion; production wires `isOrphanSidecar`; when absent the runner
      trusts the scan classification (pre-change behavior).
- [ ] In the `--force` branch (Step 4), resolve
      `const doRecheck: RecheckSidecarFn = deps.recheck ?? (async () => true)`.
- [ ] Inside the delete loop, BEFORE `fs.rm`, for each `orphan`:
  - Call `const stillOrphan = await doRecheck({ repoRoot, fs }, orphan.slug, orphan.sidecarPath)`
    inside a `try/catch`.
  - If the call rejects (only possible for an injected predicate;
    `isOrphanSidecar` itself never throws) → push a skip warning
    (`Warning: skipped sidecar for '<slug>' at <sidecarPath>: re-check failed (<msg>)`)
    and `continue` (fail-safe: do not delete).
  - If `stillOrphan === false` → push a skip warning
    (`Warning: skipped sidecar for '<slug>' at <sidecarPath>: no longer orphan (became active after scan)`)
    and `continue` (do NOT call `fs.rm`, do NOT count as removed).
  - Otherwise, delete exactly as today
    (`fs.rm(sidecarPath, { recursive: true, force: true })`, best-effort:
    per-item rejection → warning + continue; count successes in `removed`).
- [ ] Keep the success message as `Removed ${removed} orphan sidecar(s)` where
      `removed` counts only actually-deleted sidecars (skips excluded). Keep
      `exitCode: 0` for success/no-op/skip; `1` only on the hard scan failure.
- [ ] Do NOT re-check in the dry-run branch (Step 3) and do NOT change Steps 1–3
      or the no-orphans path.

**Acceptance Criteria** (AC-T1, AC-T2, AC-T3):
- The `--force` loop calls the resolved re-check exactly once per scanned orphan,
  immediately before that orphan's `fs.rm`.
- When the re-check returns `false` for a slug, `fs.rm` is not called for it, a
  warning naming the slug and reason is present, and `exitCode` is `0`.
- When the re-check returns `true`, deletion proceeds unchanged (best-effort,
  counted).
- Dry-run performs neither the re-check nor `fs.rm`.
- `typecheck` passes.

## T-02: Wire the real `isOrphanSidecar` re-check in the CLI (`runPrune`)

- [ ] In `src/cli/prune.ts`, import `isOrphanSidecar` from
      `../core/sidecar/orphan.js` (value import; `sidecar/orphan.js` is not
      mocked by the CLI tests, so a top-level import is safe).
- [ ] Pass `recheck: isOrphanSidecar` in the `pruneOrphanSidecars` deps alongside
      the existing `repoRoot` and `fs` node-fs adapter (L82-88 region). Do NOT
      change the worktree runner call, the section headers, `writeResult`, or the
      combined exit-code composition.
- [ ] Confirm skip warnings surface correctly: `writeResult` already routes
      `result.warnings[]` to stderr and preserves the exit code — no change
      needed there.

**Acceptance Criteria** (AC-T1, AC-T3):
- `runPrune` passes `deps.recheck === isOrphanSidecar` to `pruneOrphanSidecars`
  (production protection is wired, not left to the runner default).
- Worktree prune behavior, output sections, and combined exit code are unchanged.
- `typecheck` passes.

## T-03: Runner tests — race skip, 破壊確認, and no-false-skip

- [ ] Add tests to `tests/unit/core/prune/sidecar-runner.test.ts` (new `describe`
      blocks; do NOT modify the existing TC-004/006/007/008/020/021 blocks).
- [ ] **AC-T1 (race skip)**: scan (injected) returns `slug-x` as an orphan;
      inject a `recheck` that reports `slug-x` is NOT an orphan at delete time
      (simulating an active transition via deps injection — either a stateful
      `recheck` or `recheck: async () => false`). Assert under `force: true`:
      `fs.rm` is NOT called for `slug-x`'s path; a warning names `slug-x` and
      mentions it is no longer orphan / became active; `exitCode === 0`.
- [ ] **AC-T1 破壊確認**: document/verify that if the per-slug re-check branch is
      removed from the runner, this test's "rm not called" assertion fails
      (`fs.rm` gets called for the active-turned sidecar). Encode this as an
      assertion strong enough to go red when the skip branch is deleted (e.g.
      assert `rm` was not called with `slug-x`'s path AND the warning is present).
- [ ] **AC-T2 (no false skip)**: scan returns two orphans; inject a `recheck`
      that reports both are still orphans (`async () => true` or a realistic
      predicate). Assert both `fs.rm` calls happen and the message is
      `Removed 2 orphan sidecar(s)`.
- [ ] **Mixed case**: scan returns `[orphan-keep, orphan-gone]`; `recheck`
      returns `true` for `orphan-keep` and `false` for `orphan-gone`. Assert
      `fs.rm` called only for `orphan-keep`, message `Removed 1 orphan sidecar(s)`,
      warning names `orphan-gone`, `exitCode === 0`.
- [ ] **Re-check failure is fail-safe**: inject a `recheck` that rejects for one
      slug; assert that slug is skipped (no `fs.rm`), a warning is present, and
      `exitCode === 0`.

**Acceptance Criteria** (AC-T1, AC-T2):
- The race-skip test is green with the re-check and red when the re-check branch
  is removed (破壊確認 holds).
- Still-orphan sidecars are deleted (no regression to false skips).
- All new assertions pass under `test`.

## T-04: Preserve existing behavior — dry-run, best-effort, exit codes, wiring

- [ ] Verify the existing runner tests in
      `tests/unit/core/prune/sidecar-runner.test.ts` (TC-004 dry-run-no-rm,
      TC-006 force-delete, TC-007 破壊確認, TC-008 idempotent no-op, TC-020
      best-effort, TC-021 hard-scan-fail) remain green **without modification** —
      they inject only a `scan`, so the runner's default re-check (trust-scan)
      keeps them deleting as before.
- [ ] In `tests/unit/cli/prune-combined.test.ts`, ADD one test asserting
      `runPrune` wires the re-check: after `runPrune({ force: true })`, assert the
      captured `mockPruneOrphanSidecars` call arg has
      `deps.recheck === isOrphanSidecar` (import `isOrphanSidecar` from
      `src/core/sidecar/orphan.js`; it is not mocked). Do NOT modify the existing
      TC-005/013/022 blocks.
- [ ] Add a dry-run assertion (in the runner test file) that under `force: false`
      the injected `recheck` is never invoked and `fs.rm` is not called.

**Acceptance Criteria** (AC-T3):
- All pre-existing runner and CLI tests pass unchanged.
- The new wiring test proves production injects the real predicate (guards
  against a silent regression of D1's protection).
- Dry-run invokes neither the re-check nor `fs.rm`.

## T-05: Full verification

- [ ] Run the full gate: `typecheck && test` green.
- [ ] Confirm no changes leaked into worktree prune (`runner.ts` /
      `worktree/orphan.ts`), the orphan classification (`ACTIVE_STATUSES` /
      `isOrphanSidecar` semantics), or the doctor check — all out of scope.

**Acceptance Criteria** (AC-T4):
- `typecheck && test` pass.
- Out-of-scope files are untouched; only `src/core/prune/sidecar-runner.ts`,
  `src/cli/prune.ts`, and the two prune test files change.
