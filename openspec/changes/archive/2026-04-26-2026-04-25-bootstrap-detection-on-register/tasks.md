## 1. Bootstrap Status Detection Logic

- [x] 1.1 Add `detectBootstrapStatus()` helper function to `src/lib/repository-registration-actions.ts`. The function takes `token: string`, `owner: string`, `repo: string`, `defaultBranch: string` and returns `Promise<BootstrapStatus>`. Uses `Promise.all` to check `openspec/project.md` (via `getFileContent`) and `requests/active/` (via `getDirectoryContents`) in parallel on the default branch. Returns `'ready'` if both exist, `'uninitialized'` otherwise
- [x] 1.2 Wrap the `Promise.all` call in a try-catch that returns `'uninitialized'` on any error (network failure, rate limit, unexpected response). Do not re-throw

## 2. Integration into registerRepository

- [x] 2.1 Import `getFileContent` and `getDirectoryContents` from `./github-api` in `repository-registration-actions.ts`
- [x] 2.2 After the GitHub API access verification (`GET /repos/{owner}/{repo}`) succeeds, call `detectBootstrapStatus()` with the user's access token, owner, repo name, and `ghRepo.default_branch`
- [x] 2.3 Replace the hardcoded `bootstrapStatus: 'uninitialized'` in the `db.insert()` call with the result of `detectBootstrapStatus()`

## 3. Tests

- [x] 3.1 Add unit tests for `detectBootstrapStatus()`: both files exist returns `'ready'`, only `openspec/project.md` exists returns `'uninitialized'`, neither exists returns `'uninitialized'`
- [x] 3.2 Add unit test for error fallback: mock `getFileContent`/`getDirectoryContents` to throw, verify `detectBootstrapStatus()` returns `'uninitialized'`
- [x] 3.3 Verify existing `registerRepository` tests still pass
