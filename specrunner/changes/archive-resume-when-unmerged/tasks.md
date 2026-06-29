# Tasks: archive-resume-when-unmerged

## T-01: Fix orchestrator.ts — pass includeArchived to list()

- [ ] In `src/core/archive/orchestrator.ts` at the `JobStateStore.list(cwd)` call in Phase 0, change it to `JobStateStore.list(cwd, { includeArchived: true })`

**Acceptance Criteria**:
- The `JobStateStore.list` call in `orchestrator.ts` Phase 0 includes `{ includeArchived: true }`
- `bun run typecheck` passes with no new errors

## T-02: Fix merge-then-archive.ts — pass includeArchived to list()

- [ ] In `src/core/archive/merge-then-archive.ts` at the `JobStateStore.list(cwd)` call in Step 1, change it to `JobStateStore.list(cwd, { includeArchived: true })`

**Acceptance Criteria**:
- The `JobStateStore.list` call in `merge-then-archive.ts` Step 1 includes `{ includeArchived: true }`
- `bun run typecheck` passes with no new errors

## T-03: Test — orchestrator resolves archived job and returns idempotently

- [ ] Add a new test case to `src/core/archive/__tests__/orchestrator.test.ts`
- [ ] Give the test the label `T-07: archived job resolves via includeArchived and returns Already finished`
- [ ] Mock `JobStateStore.list` to return a job with `status: "archived"` (use `makeState({ status: "archived" })`)
- [ ] Call `runArchiveOrchestrator` with the matching slug
- [ ] Assert `result.exitCode === 0`
- [ ] Assert `JobStateStore.list` was called with `cwd` and `{ includeArchived: true }` as arguments
- [ ] Assert `commitArchive` was NOT called (no archive side effects re-executed)
- [ ] Assert `archiveChangeFolder` was NOT called

**Acceptance Criteria**:
- Test passes with the fix applied (T-01)
- Test fails on unmodified code (list called without `includeArchived`)

## T-04: Test — merge-then-archive resolves archived+MERGED job and runs cleanup

- [ ] Create `src/core/archive/__tests__/merge-then-archive.test.ts`
- [ ] Set up `vi.mock` for: `../../../store/job-state-store.js`, `../orchestrator.js`, `./post-merge-cleanup.js`, `../../../logger/stdout.js`, `../../../git/transport-auth.js`
- [ ] Implement a `makeState(overrides)` helper (same shape as in orchestrator.test.ts) and a `makeGithubClient()` helper returning a mock `GitHubClient`
- [ ] Add test `T-01: archived+MERGED job runs runPostMergeCleanup and returns exitCode 0`:
  - [ ] Mock `JobStateStore.list` to return a job with `status: "archived"` and `pullRequest: { number: 42 }`
  - [ ] Mock `githubClient.getPullRequest` to return `{ state: "MERGED" }`
  - [ ] Call `runMergeThenArchive` with slug and the mock github client
  - [ ] Assert `result.exitCode === 0`
  - [ ] Assert `runPostMergeCleanup` was called
  - [ ] Assert `runArchiveOrchestrator` was NOT called (cleanup short-circuit, no re-record)
  - [ ] Assert `JobStateStore.list` was called with `{ includeArchived: true }`

**Acceptance Criteria**:
- Test passes with the fix applied (T-02)
- Test fails on unmodified code

## T-05: Test — merge-then-archive resolves archived+unmerged job without No-job-found

- [ ] In `src/core/archive/__tests__/merge-then-archive.test.ts`
- [ ] Add test `T-02: archived+unmerged job is resolved and does not return No job found`:
  - [ ] Mock `JobStateStore.list` to return a job with `status: "archived"` and `pullRequest: { number: 42 }`
  - [ ] Mock `githubClient.getPullRequest` to return `{ state: "OPEN", mergeStateStatus: "CLEAN", mergeable: "MERGEABLE" }`
  - [ ] Mock `runArchiveOrchestrator` to return `{ exitCode: 1, message: "stub-failure" }` (causes the function to exit early after the job-found gate — simpler than mocking the full CI-wait loop)
  - [ ] Call `runMergeThenArchive` with the slug
  - [ ] Assert the result is NOT `{ exitCode: 2, message: containing "No job found" }` (the job was found)
  - [ ] Assert `JobStateStore.list` was called with `{ includeArchived: true }`

**Acceptance Criteria**:
- Test passes with the fix applied (T-02)
- Test fails on unmodified code (list returns empty → exitCode 2 / "No job found")

## T-06: Confirm non-target list() calls are unchanged

- [ ] Grep `src/core/cancel/runner.ts`, `src/core/inbox/run-inbox.ts`, and `src/core/lifecycle/exit-guard.ts` for `JobStateStore.list` calls and confirm none of them have `includeArchived` added as part of this change
- [ ] Run `bun test` and confirm no existing tests regress

**Acceptance Criteria**:
- The three non-target files retain `JobStateStore.list` calls without `includeArchived: true`
- `bun test` exits 0 with no regressions

## T-07: Final verification

- [ ] Run `bun run build`
- [ ] Run `bun run typecheck`
- [ ] Run `bun test`

**Acceptance Criteria**:
- All three commands exit 0
