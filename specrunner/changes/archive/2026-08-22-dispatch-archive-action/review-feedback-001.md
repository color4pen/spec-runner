# Code Review Feedback — iteration 1

## 検証した項目

### ファイル・diff

- `.github/workflows/specrunner-dispatch.yml` diff — `archive` choices 追加と shell 分岐の内容を直接確認
- `src/core/archive/job-context.ts` diff — `isArchiveRecordDir` 抽出・`resolveArchivedSlugByJobId` 追加・import 集合の変化なしを確認
- `src/cli/archive-from-issue.ts` diff — 3 段解決順序の挿入、既存 closing PR 経路のネスト移動を確認
- `src/cli/__tests__/archive-from-issue.test.ts` — TC-018/TC-019 更新と新規 describe 群を確認
- `src/core/archive/__tests__/archived-slug-by-job-id.test.ts` — 7 ケース（TC-001 〜 TC-007）を確認
- `tests/dispatch-workflow-archive-action.test.ts` — indent-scope helper + TC-001/TC-002/TC-003 を確認
- `verification-result.md` — typecheck / test / lint / build すべて passed（813 test files, 12 157 tests）

### 不変条件確認

`git diff main...HEAD` で次のファイルに差分がないことを確認:
`src/core/issue-target/archive.ts`, `src/core/archive/plain-archive.ts`,
`src/core/archive/merge-completion.ts`, `src/core/job-access/load-by-job-id.ts`,
`src/git/checkpoint-ref.ts`, `tests/grep-workflow-actions-pinned.test.ts`, `package.json`

### Must-priority TC 対応表

| TC | 説明 | テスト所在 |
|----|------|-----------|
| TC-001 | action choices に archive | dispatch-workflow-archive-action.test.ts |
| TC-002 | archive 分岐が CLI 呼び出し 1 行のみ | 同上 |
| TC-003 | start/resume の既存挙動が不変 | 同上 |
| TC-004 | post-merge / head branch 削除済み → resolves, exit 0 | archive-from-issue.test.ts (post-merge describe) |
| TC-005 | jobId 不一致 → null | archived-slug-by-job-id.test.ts TC-001 |
| TC-006 | issueNumber 不一致 / 欠損 → null | 同上 TC-002, TC-003 |
| TC-007 | active change folder → 対象外 | 同上 TC-004 |
| TC-008 | local state が archive record より優先 | archive-from-issue.test.ts TC-018 |
| TC-009 | merge 前 → closing PR path へ fallthrough | archive-from-issue.test.ts TC-019 |
| TC-010 | fallback miss + closing PR 不成立 → ARCHIVE_FROM_ISSUE_UNCONFIRMED | archive-from-issue.test.ts |
| TC-011 | fallback slug → archiveRecorded: true | archived-slug-by-job-id.test.ts TC-007 |
| TC-012 | archive dir 不在 → null, no throw | 同上 TC-005 |
| TC-013 | resolveArchivedSlugByJobId に正確な jobId + issueNumber が渡る | archive-from-issue.test.ts TC-013 |
| TC-016 | --with-merge / resume / attach 既存テスト green | verification gate |
| TC-017 | typecheck + test + lint green | verification gate |

## 検証できなかった項目

None

## Findings 詳細

typed findings なし。以下は observations（情報提供のみ、action 不要）。

**TC-014（should）: logInfo assert なし**
`archive-from-issue.ts:126` の診断 `logInfo(...)` はあるが、post-merge test describe で
`logInfo` 引数は assert されていない。test-cases.md priority = should のため must ゲートに影響なし。

**TC-015（should）: ブロック抽出失敗診断のテストなし**
dispatch-workflow-archive-action.test.ts:175-179 で抽出失敗時に failureReason と
先頭 60 行を error message に含める実装はあるが、この失敗パスを意図的に誘発するテストはない。
priority = should のため必須ではない。

**`LocalRuntime#setupWorkspace` の explicit not-called assert なし**
T-06 tasks では「（mock でカバー）」と明示。`resolveArchiveBranchFromIssue` not-called の
assert（存在する）が `setupWorkspace` への到達を論理的に排除するため、実効上は担保されている。
