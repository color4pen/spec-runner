# Tasks: inbox-reject-dedup

## T-01: Add `removeLabel` to GitHubClient port and adapter

- [x] In `src/kernel/github-client.ts`: add `removeLabel(owner: string, repo: string, issueNumber: number, label: string): Promise<void>` to the `GitHubClient` interface. JSDoc: `DELETE /repos/{owner}/{repo}/issues/{issueNumber}/labels/{label}`. 200 or 204 → success; 404 → success (idempotent); other non-2xx → throws `SpecRunnerError(GITHUB_API_ERROR)`; 401 → throws via `request()`.
- [x] In `src/adapter/github/github-client.ts`: implement `removeLabel` on `GitHubApiClient`. Use `this.request(url, { method: "DELETE" })`. URL: `${this.baseUrl}/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`. Handle 200, 204 (success), 404 (idempotent success), other status → `throw githubApiError(resp.status, ...)`.

**Acceptance Criteria**:
- `GitHubApiClient` satisfies the updated `GitHubClient` interface (TypeScript compilation passes).
- `removeLabel` with 204 response resolves without throwing.
- `removeLabel` with 404 response resolves without throwing (idempotent).
- `removeLabel` with 422 response throws `SpecRunnerError(GITHUB_API_ERROR)`.

---

## T-02: Add `removeApprovalLabel` effect and wire label removal in execute-rejects

- [x] In `src/core/inbox/run-inbox.ts`: add `removeApprovalLabel(issueNumber: number): Promise<void>` to the `InboxEffects` interface.
- [x] In `buildEffects`: implement the default as `await githubClient.removeLabel(owner, repo, issueNumber, opts.approveLabel)`. `opts.approveLabel` is already in scope.
- [x] In the execute-rejects loop (after the existing `postRejectComment` call): add an inner `try/catch` that calls `await effects.removeApprovalLabel(action.issue.number)`. On catch: `stderrWrite(`[inbox] warn: failed to remove approval label from issue#${action.issue.number}: ${(err as Error).message}`)`. Do not rethrow. Continue to `summary.rejected.push`.
- [x] `removeApprovalLabel` must not be called if `postRejectComment` throws (it is called only in the try-body after postRejectComment succeeds).

**Acceptance Criteria**:
- After a successful `postRejectComment`, `removeApprovalLabel` is called with the correct `issueNumber`.
- If `removeApprovalLabel` throws, the error is written to stderr as a warn and `summary.rejected` still contains the entry (rejection is not marked as error).
- If `postRejectComment` throws, `removeApprovalLabel` is not called and the error lands in `summary.errors`.

---

## T-03: Fetch comments for unlinked approved issues in collection phase

- [x] In `run-inbox.ts`, after `allJobStates` is available, compute the set of issue numbers already linked to any job: `linkedIssueNumbers = new Set(allJobStates.filter(s => s.issueNumber != null).map(s => s.issueNumber!))`.
- [x] Find `unlinkedApprovedIssues`: `approvedIssues.filter(i => !linkedIssueNumbers.has(i.number))`.
- [x] In the `commentsByIssue` population block (after the existing awaiting-resume fetch), add a parallel fetch for `unlinkedApprovedIssues`: for each, call `githubClient.listIssueComments(owner, repo, issue.number)` and store in `commentsByIssue`. Wrap in `try/catch`; on failure log `[inbox] warn: failed to fetch comments for issue #${n}: ...` and continue (same pattern as the existing awaiting-resume comment fetch).
- [x] Both fetch batches (awaiting-resume and unlinked-approved) may be combined into a single `Promise.all` or kept as two sequential `Promise.all` blocks — either is acceptable. The result must be stored in the same `commentsByIssue` map before `planInbox` is called.

**Acceptance Criteria**:
- When an approved unlinked issue exists, `listIssueComments` is called for it before `planInbox`.
- If `listIssueComments` throws for an unlinked approved issue, the orchestrator logs a warn and proceeds (no exception propagated).
- For issues already linked to a job, `listIssueComments` is not called again for the dedup path (to avoid double-fetching — awaiting-resume jobs handle their own fetch).

---

## T-04: Add dedup logic to `planStarts`

- [x] Change the signature of `planStarts` to accept `commentsByIssue?: Map<number, IssueComment[]>` as an optional fourth parameter (optional to preserve backward compatibility for callers that don't supply it).
- [x] Add a private helper `hasLatestRejectNotification(comments: IssueComment[], issueNumber: number): boolean` in `planner.ts`. Logic:
  1. Iterate `comments` and find the comment with the latest `createdAt` among comments where `isNotificationComment(body)` returns `true` (use the existing import from `issue-notifier`).
  2. If no such comment exists, return `false`.
  3. Return `true` iff that comment's body contains `kind="reject" issue="${issueNumber}"`.
- [x] In the reject branch of `planStarts` (after `parseRequestMdContent` throws): before `rejects.push(...)`, check:
  ```
  if (commentsByIssue) {
    const comments = commentsByIssue.get(issue.number) ?? [];
    if (hasLatestRejectNotification(comments, issue.number)) continue;
  }
  ```
- [x] In `planInbox`: pass `input.commentsByIssue` as the fourth argument to `planStarts`.

**Acceptance Criteria**:
- `planStarts` with no `commentsByIssue` behaves identically to before (no regression).
- Issue with invalid body and no prior notification → `RejectAction` is produced.
- Issue with invalid body and latest notification comment is `kind="reject"` for that issue → no action (neither `StartAction` nor `RejectAction`).
- Issue with invalid body and latest notification comment is `kind="escalation"` (not reject) → `RejectAction` is produced (dedup only suppresses reject-kind).
- Issue with valid body and a prior `kind="reject"` notification → `StartAction` is produced (dedup is not in the reject branch).

---

## T-05: Tests — planner dedup

Create `src/core/inbox/__tests__/planner.test.ts`.

- [x] **TC-P1** — no comments map: `planStarts([invalidIssue], [], 5, undefined)` → `rejects` has 1 entry; `starts` is empty.
- [x] **TC-P2** — dedup suppresses: `planStarts([invalidIssue], [], 5, mapWith(rejectNotificationComment))` → both `rejects` and `starts` are empty.
- [x] **TC-P3** — dedup does not fire for valid body: `planStarts([validIssue], [], 5, mapWith(rejectNotificationComment))` → `starts` has 1 entry; `rejects` is empty.
- [x] **TC-P4** — wrong kind does not dedup: `planStarts([invalidIssue], [], 5, mapWith(escalationNotificationComment))` → `rejects` has 1 entry.
- [x] **TC-P5** — re-apply start after rejection fixed (acceptance criterion 3): issue has reject notification comment; issue body is now valid → `starts` has 1 entry.
- [x] **TC-P6** — `planInbox` passes `commentsByIssue` to `planStarts`: construct a `planInbox` call with a reject-notification for the unlinked issue; assert `rejects` is empty (integration of wiring).

Helper constants: use `NOTIFICATION_COMMENT_PREFIX` from `issue-notifier` to build test comment bodies. Invalid issue body: any string that fails `parseRequestMdContent`. Valid issue body: same shape as in the existing `run-inbox.test.ts` `makeIssueBody` helper.

**Acceptance Criteria**:
- All TC-P1 through TC-P6 pass.
- `bun run typecheck` passes with the new test file.

---

## T-06: Tests — run-inbox label removal

Extend `src/core/inbox/__tests__/run-inbox.test.ts` with a new `describe` block: `"runInboxOrchestrator — reject label removal"`.

- [x] **TC-L1** — `removeApprovalLabel` called after successful reject:
  - Mock `postRejectComment` to resolve.
  - Mock `removeApprovalLabel` to resolve.
  - Run orchestrator with one invalid-body issue.
  - Assert `removeApprovalLabel` called once with the correct `issueNumber`.
  - Assert `summary.rejected` has 1 entry and `summary.errors` is empty.

- [x] **TC-L2** — `removeApprovalLabel` failure is non-fatal:
  - Mock `postRejectComment` to resolve.
  - Mock `removeApprovalLabel` to reject with `new Error("network error")`.
  - Run orchestrator.
  - Assert `summary.rejected` has 1 entry (reject still recorded).
  - Assert `summary.errors` is empty (label failure is not an error).
  - Assert `stderrWrite` was called with a string containing `"warn"` and `"approval label"`.

- [x] **TC-L3** — `removeApprovalLabel` not called when `postRejectComment` fails:
  - Mock `postRejectComment` to reject.
  - Mock `removeApprovalLabel` to resolve (as spy).
  - Run orchestrator.
  - Assert `removeApprovalLabel` not called.
  - Assert `summary.errors` has 1 entry.

- [x] The `makeEffects` helper in the test file must be updated to include `removeApprovalLabel: vi.fn().mockResolvedValue(undefined)` in its defaults so existing tests do not break.

**Acceptance Criteria**:
- TC-L1, TC-L2, TC-L3 pass.
- Existing tests in the file continue to pass (no regression from effects signature change).

---

## T-07: Verify

- [x] Run `bun run typecheck` — must exit 0.
- [x] Run `bun run test` — must exit 0 with all new and existing tests passing.

**Acceptance Criteria**:
- `typecheck && test` green.
