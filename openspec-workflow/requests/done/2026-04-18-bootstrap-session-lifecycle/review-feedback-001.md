## Code Review Result

**Verdict**: needs-fix
**Score**: 6.95 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: -- (initial)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 7 | 0.30 | 2.10 |
| security | 8 | 0.25 | 2.00 |
| architecture | 7 | 0.15 | 1.05 |
| performance | 7 | 0.10 | 0.70 |
| maintainability | 6 | 0.10 | 0.60 |
| testing | 5 | 0.10 | 0.50 |
| **Total** | | | **6.95** |

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS |
| Type Check | PASS |
| Lint | PASS |
| Tests | PASS (149/149, 100%) |
| Security | PASS (no audit issues) |

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/lib/bootstrap-actions.ts:432-447 | `cancelBootstrapRequestsForRepository` cancels ALL bootstrap-type requests for the repository regardless of their current status. This violates the `ALLOWED_TRANSITIONS` state machine -- requests in `completed` or already `cancelled` terminal states should not be updated. The WHERE clause lacks a status filter, so re-cancelling could overwrite terminal statuses and corrupt the audit trail. | Add a status filter: `eq(requests.status, 'in-progress')` (or include `'reviewing'` and `'draft'` as non-terminal states). Terminal states (`completed`, `cancelled`) must be excluded. |
| 2 | MEDIUM | maintainability | src/lib/bootstrap-actions.ts:240 | Redundant dynamic import: `const { getBranchExists, deleteBranch: deleteBranchFn } = await import('./github-api')` when `deleteBranch` is already statically imported at line 19 and `closePullRequest` is also statically imported. `getBranchExists` should be added to the static import; the dynamic import should be removed. Mixing static and dynamic imports of the same module is confusing and suggests incomplete refactoring. | Add `getBranchExists` to the static import at line 17-20, and replace the dynamic import with direct usage of the statically imported functions. |
| 3 | MEDIUM | maintainability | src/lib/bootstrap-actions.ts:482 | Same issue: `const { getPullRequestStatus } = await import('./github-api')` in `syncBootstrapPrStatus` uses dynamic import when `closePullRequest` and `deleteBranch` are already statically imported from the same module. This is inconsistent. | Add `getPullRequestStatus` to the static import block at line 17-20 and remove the dynamic import. |
| 4 | MEDIUM | correctness | src/lib/bootstrap-actions.ts:236-245 | Vault setup and branch cleanup happen BEFORE the status transition to `bootstrapping` (line 248). If Vault creation succeeds but the status transition fails, there is no rollback of the Vault. More critically, if branch deletion succeeds but subsequent steps fail, the branch is deleted without recovery. The Vault/branch cleanup should happen after the guard checks but the ordering relative to status transition should be reconsidered -- or at minimum the rollback block (lines 296-316) should account for branch-already-deleted state. | Move the Vault setup and branch cleanup after the status transition to `bootstrapping`, or document that the current ordering is intentional (Vault is idempotent so re-creation is safe, and branch deletion before start is also safe as the agent will recreate it). |
| 5 | MEDIUM | testing | src/__tests__/bootstrap-session-lifecycle.test.ts | Many test cases (TC-005, TC-006, TC-008-016, TC-021-023, TC-031-034, TC-040-044) use static source analysis (`toContain` on file text) rather than behavioral testing. These verify that strings exist in source code but do not actually test runtime behavior. For example, TC-015 checks that `findOpenPrByHead` appears in source but does not verify the actual deduplication logic. This significantly reduces test confidence. | Prioritize behavioral tests using mocks for external dependencies (GitHub API, Anthropic SDK). Source-text assertions are acceptable for TC-001/002/003/004 (directive checks) and TC-043 (dead code removal) but should not substitute for behavioral verification of business logic. |
| 6 | MEDIUM | architecture | src/lib/bootstrap-utils.ts:35-38 | `extractPrUrl` is no longer used by any production code (removed from bootstrap-actions.ts import). It is only referenced by existing tests in bootstrap.test.ts. This is dead code in the production path. | Remove `extractPrUrl` from bootstrap-utils.ts and update bootstrap.test.ts to remove the tests for it, or mark it explicitly as deprecated if it serves a future purpose. |
| 7 | LOW | security | src/lib/github-api.ts | No rate-limit handling or retry logic for GitHub API calls. If the app hits GitHub's rate limit (especially during `closePullRequest` which makes 2 sequential API calls), errors will propagate to the caller. Not blocking but should be considered for production robustness. | Consider adding retry-after header parsing or exponential backoff for 429 responses as a future enhancement. |
| 8 | LOW | performance | src/lib/session-completion-handler.ts:43-52 | The JOIN query fetches all columns from sessions, requests, and repositories (`select({ session: sessions, request: requests, repository: repositories })`). Only specific fields are used in the SessionContext. Over-fetching is wasteful. | Use `.select()` with explicit field projections to fetch only the needed columns. |
| 9 | LOW | maintainability | src/lib/vault-actions.ts:134-146 | `isConflictError` uses a message-string fallback (`error.message.includes('409')`) which is fragile and could match non-409 errors that happen to contain "409" in their message. The Anthropic SDK's error type should be checked first. | Import the specific error type from `@anthropic-ai/sdk` (e.g., `ConflictError` or `APIError`) and check `instanceof` instead of string matching. Remove the message fallback. |
| 10 | LOW | correctness | src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx:141 | `startStatusPolling` captures `bootstrapStatus` in its closure via `useCallback([bootstrapStatus, ...])` but the polling condition on line 169 (`data.bootstrapStatus !== bootstrapStatus`) compares against the captured value. If `bootstrapStatus` changes during polling, the closure holds a stale reference. This is mitigated by the stop conditions, but the comparison may be incorrect during state transitions. | Use a ref (`useRef(bootstrapStatus)`) for the comparison inside the interval callback, or remove the stale comparison and rely solely on the terminal-state stop conditions. |

### Summary

- The implementation successfully achieves the core architectural goals: SSE route is free of bootstrap-specific logic, GitHub API calls are centralized in `github-api.ts`, session completion uses role-based dispatch, and IDOR prevention is properly implemented across all endpoints.
- The one HIGH-severity finding (#1) is the unbounded `cancelBootstrapRequestsForRepository` which can overwrite terminal request statuses. This violates the state machine defined in `request-actions.ts`.
- Test coverage is numerically high (149/149 pass) but many test cases rely on source-text analysis rather than behavioral verification, reducing confidence in edge-case correctness.
- Import hygiene in `bootstrap-actions.ts` needs cleanup: mixed dynamic/static imports from the same module.
- Dead code (`extractPrUrl`) should be removed now that the client-side PR URL detection has been replaced by server-side completion handling.
