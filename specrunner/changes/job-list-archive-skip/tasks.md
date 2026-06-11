# Tasks: job-list-archive-skip

## T-01: Add `includeArchived` option to `JobStateStore.list`

- [x] Add `opts?: { includeArchived?: boolean }` parameter to the `JobStateStore.list` static method signature (`src/store/job-state-store.ts`)
- [x] Wrap section 1b (archive directory scan, lines ~237-259) in `if (opts?.includeArchived === true) { ... }` so it is skipped by default
- [x] Ensure the rest of the method (sections 2, 3, 4) is unaffected

**Acceptance Criteria**:
- `JobStateStore.list(root)` (no opts) does not enter the archive scan block
- `JobStateStore.list(root, { includeArchived: true })` loads and returns archived states as before
- TypeScript compiles without errors

## T-02: Update display and resolution callers to opt in

- [x] `src/cli/ps.ts` line ~130: replace `JobStateStore.list(repoRoot)` with `JobStateStore.list(repoRoot, { includeArchived: opts.all === true || opts.status === 'archived' })`
- [x] `src/cli/job-show.ts` line ~65: replace `JobStateStore.list(repoRoot)` with `JobStateStore.list(repoRoot, { includeArchived: true })`
- [x] `src/store/job-state-store.ts` `resolveId` method (~line 374): replace `JobStateStore.list(repoRoot)` with `JobStateStore.list(repoRoot, { includeArchived: true })`
- [x] `src/core/finish/resolve-target.ts` `resolveBySlug`: add `{ includeArchived: true }` (required for existing multi-slug tests)
- [x] `src/core/resume/resolve-job.ts` `resolveJobStateBySlug`: add `{ includeArchived: true }` (required for existing multi-slug tests)

**Acceptance Criteria**:
- `runPs({})` calls `list` without `includeArchived: true`
- `runPs({ all: true })` calls `list` with `includeArchived: true`
- `runPs({ status: 'archived' })` calls `list` with `includeArchived: true`
- `runJobShow` always calls `list` with `includeArchived: true`
- `resolveId` always calls `list` with `includeArchived: true`

## T-03: Add archive-skip test

- [x] Create `src/store/__tests__/job-state-store-archive-skip.test.ts`
- [x] Set up a temporary `repoRoot` with `specrunner/changes/archive/` containing at least 3 stub subdirectories (each with a minimal valid `state.json`)
- [x] Spy on `fs.readdir` (from `node:fs/promises`) to capture call arguments (via `vi.mock` — ESM namespace is not configurable by `vi.spyOn`)
- [x] Call `JobStateStore.list(repoRoot)` (default, no opts)
- [x] Assert that `fs.readdir` was never called with a path starting with the archive directory
- [x] Call `JobStateStore.list(repoRoot, { includeArchived: true })`
- [x] Assert that `fs.readdir` was called with the archive path at least once

**Acceptance Criteria**:
- Test is green under `bun run test`
- Archive scan is provably zero-call in the default path

## T-04: Verify `typecheck && test`

- [x] Run `bun run typecheck` — zero type errors
- [x] Run `bun run test` — all tests green, including pre-existing tests

**Acceptance Criteria**:
- No regressions in existing test suite
- `typecheck` exits 0
