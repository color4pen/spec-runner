# Tasks: ps.checkPrMerged unit tests

## T-01: Add unit test file for `checkPrMerged`

Create `tests/unit/cli/ps-check-pr-merged.test.ts` with the following:

- [x] Import `checkPrMerged` from `../../../src/cli/ps.js`
- [x] Import `JobState` type from `../../../src/state/schema.js`
- [x] Import `GitHubClient` type from `../../../src/core/port/github-client.js`
- [x] Define a `makeJob` fixture that returns a minimal `JobState` — with `pullRequest: { url, number, createdAt }` by default, and accepts overrides
- [x] Define an `makeMockClient(impl)` helper that returns `{ getPullRequest: vi.fn().mockImplementation(impl) } as unknown as GitHubClient`
- [x] **TC-01** — `job.pullRequest` is null: call `checkPrMerged({ ...job, pullRequest: undefined }, mockClient)` → expect result to be `null`
- [x] **TC-02** — `githubClient` is null: call `checkPrMerged(job, null)` → expect result to be `null`
- [x] **TC-03** — `getPullRequest` returns `{ state: "MERGED" }`: call `checkPrMerged(job, mockClient)` → expect result to be `true`
- [x] **TC-04** — `getPullRequest` returns `{ state: "OPEN" }`: call `checkPrMerged(job, mockClient)` → expect result to be `false`
- [x] **TC-05** — `getPullRequest` throws: `vi.fn().mockRejectedValue(new Error("API error"))` → expect result to be `null`

**Acceptance Criteria**:
- All 5 test cases exist in `tests/unit/cli/ps-check-pr-merged.test.ts`
- `src/` contains no modifications
- `bun run typecheck && bun run test` exits 0
