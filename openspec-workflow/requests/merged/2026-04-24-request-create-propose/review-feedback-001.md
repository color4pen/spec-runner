## Code Review Result

**Verdict**: needs-fix
**Score**: 6.60 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: -- (initial)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 6 | 0.30 | 1.80 |
| security | 6 | 0.25 | 1.50 |
| architecture | 7 | 0.15 | 1.05 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **6.55** |

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS |
| Type Check | PASS |
| Lint | PASS |
| Tests | PASS (186/186, 100%) |
| Security | N/A (security-reviewer disabled) |

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/lib/github-api.ts:264 | `getDirectoryContents()` uses `encodeURIComponent(path)` which encodes `/` to `%2F`. When called with `openspec/changes/{slug}`, the URL becomes `contents/openspec%2Fchanges%2F...` instead of `contents/openspec/changes/...`, causing a 404 from GitHub API. Same issue in `getFileContent()` at line 315. | Remove `encodeURIComponent()` wrapping on `path` parameter in both functions. Path segments with special characters (spaces etc.) should be handled per-segment if needed, but for the current use case (paths like `openspec/changes/slug/proposal.md`), the slashes must remain unencoded. |
| 2 | HIGH | security | src/lib/propose-actions.ts:186 | `getChangeFolderFileContent()` accepts a `filePath` parameter from the client without path traversal validation. Although ownership is verified (the user owns the repository), the function reads any file from the repository at any path on the branch -- not restricted to the change folder. A malicious client could read `src/secrets.ts` or any other file via this Server Action. | Validate that `filePath` starts with the expected change folder prefix (`openspec/changes/{slug}/`). Reject paths containing `..` or paths that don't match the expected prefix. Example: `if (!filePath.startsWith(changeFolderPath) || filePath.includes('..')) throw new Error('Invalid file path');` |
| 3 | MEDIUM | correctness | src/lib/propose-actions.ts:63-64 | `startPropose()` generates the slug using `new Date().toISOString().slice(0, 10)` (current date), but `getChangeFolderFiles()` at line 165 re-derives the slug using `request.createdAt.slice(0, 10)`. If `startPropose()` is called on a different day than the request was created (e.g., request created at 23:59 UTC, propose started at 00:01 UTC the next day), the slugs will mismatch, and the change folder viewer will look at the wrong branch/path. | Store the generated slug on the request record (as noted in tasks.md T-4.6 "Add slug storage") so all downstream code uses the same slug deterministically. Alternatively, use `request.createdAt` as the date source in `startPropose()` as well. |
| 4 | MEDIUM | correctness | src/lib/session-completion-handler.ts:128-129 | `handleProposeCompleted()` re-derives the slug using `ctx.requestCreatedAt.slice(0, 10)`. This is consistent with `getChangeFolderFiles()` but inconsistent with `startPropose()` which uses `new Date()`. This creates the same timezone/date boundary mismatch risk as finding #3. | Use the same slug source consistently. See fix for finding #3. |
| 5 | MEDIUM | security | src/lib/propose-actions.ts:99 | `buildProposeMessage()` includes the full request content in the instruction message sent to the managed agent. If request content contains prompt injection attempts, they would be passed directly to the agent as part of its instructions. | Wrap user-provided content in clear delimiters (e.g., XML tags like `<user-request>...</user-request>`) in the message template to make content boundaries explicit. This does not eliminate injection risk but follows defense-in-depth. |
| 6 | MEDIUM | testing | src/__tests__/request-create-propose.test.ts:443-472 | TC-014, TC-015, TC-016 use static analysis (source file string matching with `toContain`) to verify `startPropose()` behavior. Per review-lessons.md: "ソースコード静的解析テスト（toContain による文字列検証）がビジネスロジックの検証に使われていないか。指示系チェックに限定されているか". These tests verify business logic (draft status check, ownership verification) via string presence, not via actual function invocation. | Refactor to mock-based integration tests. Mock `getDb()`, `getAuthenticatedUser()`, and external APIs, then call `startPropose()` directly and assert on actual behavior (thrown errors, DB state changes). If `better-sqlite3` import is the blocker, use the same `createTestDb()` approach and mock the `getDb` import. |
| 7 | MEDIUM | maintainability | src/lib/propose-actions.ts:35-47,144-156,190-202 | Three nearly identical ownership verification + repository join queries exist in `startPropose()`, `getChangeFolderFiles()`, and `getChangeFolderFileContent()`. Per constraints.md: "所有権検証ロジックは既存のヘルパー関数に委譲し、インラインで同等のクエリを書かない". `verifyRequestOwnership()` in request-actions.ts already exists but does not return repository data. | Extract a shared helper function (e.g., `verifyRequestWithRepository(requestId)`) that returns both `request` and `repository`, then use it in all three functions. This eliminates 40+ lines of duplicate code. |
| 8 | MEDIUM | correctness | src/lib/propose-actions.ts:118-131 | `startPropose()` rollback catches errors after session creation + message send, but only reverts the request status to 'draft'. It does not cancel or clean up the created session. Per tasks.md T-4.5: "cancel session if partially created". The orphaned session will remain with 'active' status in the DB. | After reverting request status, also update the session status to a terminal state. Retrieve the session ID from the `createBoundSession` result (which is in scope within the try block) and set it to 'archived' or add a new terminal status in the catch block. |
| 9 | LOW | maintainability | src/lib/propose-utils.ts:93 | `enabled.map((opt) => opt).join(', ')` is a no-op map. `enabled.join(', ')` achieves the same result. | Replace with `enabled.join(', ')`. |
| 10 | LOW | architecture | src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx:33 | Comment "DirectoryEntry is imported from github-api directly to avoid 'use server' re-export issues" hints at a module boundary concern. github-api.ts is not a `'use server'` module, so re-export from propose-actions.ts would fail since propose-actions.ts has `'use server'`. This is correctly handled but the comment could be more precise. | Update comment to: "DirectoryEntry type is imported from github-api.ts because propose-actions.ts ('use server') cannot re-export types to client components." |

### Iteration Comparison

N/A (initial iteration)

### Summary

- **correctness (6/10)**: Two HIGH issues. The `encodeURIComponent` bug on directory/file paths will cause the change folder viewer to fail in production (GitHub API 404). The slug date mismatch between `startPropose()` and downstream consumers creates a latent bug at date boundaries.
- **security (6/10)**: `getChangeFolderFileContent()` has no path traversal guard -- ownership is verified, but any file in the repository is readable, not just change folder files. Prompt injection in request content is a secondary concern.
- **architecture (7/10)**: Clean separation between utils, actions, and completion handler. The `startBootstrap()` pattern is reused effectively. Duplicate ownership verification queries should be extracted.
- **performance (8/10)**: No N+1 queries detected. DB queries use JOINs appropriately. GitHub API calls are user-initiated, not polled.
- **maintainability (7/10)**: Well-structured code with clear naming. Three duplicate ownership blocks reduce maintainability.
- **testing (7/10)**: 42 test cases covering must TCs. Strong coverage on pure utilities. Weakness: Server Action tests rely on static analysis rather than behavioral testing (review-lessons pattern).
