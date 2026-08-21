# Regression Gate Result — archive-from-issue iteration 1

## Verdict evidence

Checked 7 findings from the ledger. Fixed: 3. Still present: 4.

---

## Finding-by-finding analysis

### [FIXED] T-08: baseBranch 導出が暗黙
- `tasks.md` L131-132 now explicitly states `baseBranch は verified.state.request.baseBranch ?? "main" で導出する（resume-from-issue.ts と同パターン）`
- `src/cli/archive-from-issue.ts` L156 correctly implements `verified.state.request.baseBranch ?? "main"`.
- **Status: FIXED**

### [FIXED] spec.md closing-PR locator first:50 上限
- `spec.md` Requirement section now includes: *"If the issue has more than 50 closing PRs, the query returns at most 50; any additional closing PRs are not evaluated, which may result in zero confirmed candidates and therefore ARCHIVE_FROM_ISSUE_UNCONFIRMED (fail-closed)."*
- **Status: FIXED**

### [FIXED] MEDIUM — listIssueClosingPullRequests が GitHubClient port に未追加
- `src/kernel/github-client.ts` L240-255 now declares `listIssueClosingPullRequests` in the `GitHubClient` interface with full JSDoc.
- `src/core/issue-target/archive.ts` L30: `IssueArchiveClient = Pick<GitHubClient, "listIssueComments" | "listIssueClosingPullRequests">` — uses the kernel port correctly.
- **Status: FIXED**

---

### [STILL PRESENT] TC-030: 「既存テスト」の範囲が曖昧
- `test-cases.md` L348 still reads: *"既存 attach / archive テスト群が無変更で全 pass すること。変更を要した場合は設計回帰とみなす"*
- The phrase "変更を要した場合は設計回帰とみなす" implies pre-existing tests, but the original finding requested an explicit statement "本 request 追加前から存在するテストが無変更で green" to prevent misreading the new `archive-from-issue.test.ts` / `attach.test.ts` changes as in-scope.
- **Status: STILL PRESENT (LOW)**

### [STILL PRESENT] TC-022: policy 未指定の runAttachVerification — 統合レベル未カバー
- `src/core/attach/__tests__/checkpoint-policy.test.ts` L156-178: test now calls `verifyCheckpoint(...)` without policy (improved from direct `attachResumePolicy.verify(ctx)` call), but still does NOT call `runAttachVerification`.
- `test-cases.md` TC-022 GIVEN explicitly requires calling `runAttachVerification` without policy. The orchestrator.ts wiring (`return verifyCheckpoint(..., policy)`) is not exercised by this test.
- **Status: STILL PRESENT (LOW)**

### [STILL PRESENT] resolveCompletedJobId: ponytail 追跡コメント欠落
- `src/core/issue-target/archive.ts` L51-69: `resolveCompletedJobId` calls `listIssueComments` with full pagination (O(⌈C/100⌉) requests) but has no ponytail comment.
- Symmetric function `resolveEscalationJobId` in `src/core/issue-target/resume.ts` L54-58 has the comment. The asymmetry leaves the debt untracked.
- **Status: STILL PRESENT (LOW)**

### [STILL PRESENT] listIssueClosingPullRequests: first:50 上限超過の無声切り捨て
- `src/adapter/github/github-client.ts` L807-862: `closedByPullRequestsReferences(first: 50)` still has no `logWarn` when `result.length === 50` (indicating possible truncation), and no ponytail comment.
- The spec.md was updated to document the fail-closed behavior, but the runtime has no signal that the cap was reached.
- **Status: STILL PRESENT (LOW)**
