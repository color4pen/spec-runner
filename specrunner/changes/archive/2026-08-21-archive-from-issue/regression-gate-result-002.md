# Regression Gate Result — Iteration 002

## Evidence

| # | Finding | Location | Status |
|---|---------|----------|--------|
| 1 | [LOW] T-08: baseBranch 導出が暗黙 | tasks.md:132 | ✅ Fixed |
| 2 | [LOW] TC-030: 「既存テスト」の範囲が曖昧 | test-cases.md:348 | ✅ Fixed |
| 3 | [LOW] closing-PR locator の first:50 上限が spec.md Requirement に未記述 | spec.md:99-101 | ✅ Fixed |
| 4 | [MEDIUM] listIssueClosingPullRequests がカーネルポート GitHubClient に未追加 | src/kernel/github-client.ts:251-255 | ✅ Fixed |
| 5 | [LOW] TC-022: policy 未指定の runAttachVerification が統合レベルでテストされていない | src/core/attach/__tests__/checkpoint-policy.test.ts:186-198 | ✅ Fixed |
| 6 | [LOW] resolveCompletedJobId: ponytail 追跡コメント欠落 | src/core/issue-target/archive.ts:53-57 | ✅ Fixed |
| 7 | [LOW] listIssueClosingPullRequests: first:50 上限超過時の無声切り捨て | src/adapter/github/github-client.ts:855-868 | ✅ Fixed |

## Detail

### Finding 1 — T-08: baseBranch 導出が暗黙

tasks.md 132 行目に `baseBranch は verified.state.request.baseBranch ?? "main" で導出する（resume-from-issue.ts と同パターン）` が明示されている。**回帰なし**。

### Finding 2 — TC-030: 「既存テスト」の範囲が曖昧

test-cases.md 348 行目が具体的なファイル名（`resume-from-issue.test.ts`、`resume.test.ts`、既存 attach / archive テスト群）と `変更を要した場合は設計回帰とみなす` の文言を含む形に更新されている。**回帰なし**。

### Finding 3 — spec.md first:50 上限が Requirement に未記述

spec.md 99-101 行目が「If the issue has more than 50 closing PRs, the query returns at most 50; ... ARCHIVE_FROM_ISSUE_UNCONFIRMED (fail-closed)」を明記している。**回帰なし**。

### Finding 4 — listIssueClosingPullRequests がカーネルポート GitHubClient に未追加

src/kernel/github-client.ts の GitHubClient interface に `listIssueClosingPullRequests` が 251-255 行で追加されている。archive.ts:30 の `IssueArchiveClient` も `Pick<GitHubClient, "listIssueComments" | "listIssueClosingPullRequests">` になっており、T-04・T-05 の意図と一致する。**回帰なし**。

### Finding 5 — TC-022: policy 未指定の runAttachVerification が統合レベルでテストされていない

checkpoint-policy.test.ts 186-198 行に `runAttachVerification` を policy 省略で呼び出すテスト（TC-022）が追加されており、awaiting-archive checkpoint が `CHECKPOINT_NOT_ATTACHABLE` で reject されることを確認している。direct policy call ではなく orchestrator 経由になっている。**回帰なし**。

### Finding 6 — resolveCompletedJobId: ponytail 追跡コメント欠落

archive.ts 53-57 行に `// ponytail: full pagination (O(⌈C/100⌉) calls) — ... Upgrade path: ...` が追加されている。**回帰なし**。

### Finding 7 — listIssueClosingPullRequests: first:50 上限超過時の無声切り捨て

adapter/github-client.ts 855-868 行に ponytail コメント（855-856 行）と `result.length === 50` 時の `logWarn` 呼び出し（863-868 行）が両方追加されている。**回帰なし**。
