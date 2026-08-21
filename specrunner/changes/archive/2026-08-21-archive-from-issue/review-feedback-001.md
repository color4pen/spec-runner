# Code Review Feedback — archive-from-issue iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（30 ファイル、3910 行挿入）
- `src/core/attach/checkpoint-policy.ts` — `attachArchivePolicy` / `attachQuiescentPolicy` の実装
- `src/core/attach/orchestrator.ts` — `policy?` 引数追加と verifyCheckpoint への素通し
- `src/cli/attach.ts` — `attachQuiescentPolicy` 使用・status 別 hint 出し分け
- `src/core/issue-target/archive.ts` — `resolveCompletedJobId` / `resolveArchiveBranchFromIssue` / `IssueArchiveClient` 型定義
- `src/cli/archive-from-issue.ts` — CLI handler の全フロー（config → 短絡 → locator → rebind → archive）
- `src/core/notify/issue-notifier.ts` — `parseCompletedJobId` / `COMPLETED_MARKER_RE`
- `src/adapter/github/github-client.ts` — `listIssueClosingPullRequests` GraphQL 実装
- `src/kernel/github-client.ts` — diff で +1 行（空行のみ）を確認し、ポートへのメソッド追加がないことを確認
- `src/errors.ts` — 3 エラーコード / factory / EXIT_CODE_MAP 登録
- `src/cli/command-registry.ts` — archive handler の strict XOR・`--from-issue` 配線
- `src/core/command/guide.ts` — jobs / merge topic に `archive --from-issue` 記述を確認
- テストファイル全件（`checkpoint-policy.test.ts` / `archive.test.ts` / `attach.test.ts` / `archive-from-issue.test.ts` / `github-client-closing-prs.test.ts`）を test-cases.md と照合
- `verification-result.md` — typecheck / test / lint 全 green を確認
- `tasks.md` T-01〜T-12 のチェックリストと実装の対応を確認

## 検証できなかった項目

- `job resume --from-issue` のリグレッション（既存テストが green であることは verification-result で確認済みだが、resume 実行パスは直接 walkthrough していない）

## Findings 詳細

### F-01: `listIssueClosingPullRequests` がカーネルポートに未追加（T-05 / D5 不達）

`tasks.md T-05` は `src/kernel/github-client.ts` の `GitHubClient` interface へのメソッド追加を明示的に要求している。`design.md D5` も同様。実際の diff は空行 1 行のみ。`tasks.md T-04` も `IssueArchiveClient = Pick<GitHubClient, "listIssueComments" | "listIssueClosingPullRequests">` を意図していたが、実装は `Pick<GitHubClient, "listIssueComments"> & { listIssueClosingPullRequests... }` のインライン定義になっている。

`createGitHubClient` が `GitHubApiClient`（具体型）を返すため、TypeScript の構造的型付けで `IssueArchiveClient` チェックはパスし、typecheck / test は全 green。機能的バグではないが、ポートが単一契約源でなくなり、設計・タスク双方の記述と食い違っている。

**修正**: `GitHubClient`（`src/kernel/github-client.ts`）に `listIssueClosingPullRequests` を追加し、`IssueArchiveClient` を `Pick<GitHubClient, "listIssueComments" | "listIssueClosingPullRequests">` に戻す。`GitHubApiClient implements GitHubClient` はすでにメソッドを持つため追加変更不要。

### F-02: TC-022 が `runAttachVerification` のデフォルト挙動を統合レベルでテストしていない

`test-cases.md TC-022` の GIVEN/WHEN/THEN は「policy 未指定で `runAttachVerification` を呼ぶ → awaiting-archive を not-quiescent で reject」を要求している。実際のテストは `attachResumePolicy.verify(ctx)` を直接呼び出しており、`runAttachVerification` を経由していない。`orchestrator.ts` の `policy ?? attachResumePolicy` は自明なコードだが、この契約がテストで固定されていない。

**修正**: `runAttachVerification` を policy 未指定で呼び出し awaiting-archive を reject することを確認するテストを 1 件追加する（git 操作は spawnFn mock で代替）。

---

## 受け入れ基準の照合

| 受け入れ基準 | テスト | 状態 |
|---|---|---|
| awaiting-archive policy: 受理 / awaiting-resume・running 拒否 / PR number 欠落拒否 | TC-001〜004, checkpoint-policy.test.ts | ✅ |
| `job attach --branch`: awaiting-archive attach 成功・hint 出し分け / 既存テスト無変更 | TC-005〜007, attach.test.ts | ✅ |
| completed marker 解決: escalation 無視 / 最新選択 / 不在 typed error | TC-008〜010, archive.test.ts | ✅ |
| closing-PR locator: 一意確定 / 0件 / 複数 / 不一致 skip | TC-011〜014, archive.test.ts | ✅ |
| `job archive --from-issue` CLI: `--with-merge` 引き継ぎ / slug 排他 exit 2 | TC-015〜017, archive-from-issue.test.ts | ✅ |
| local short-circuit: rebind をスキップして archive へ直行 | TC-018, archive-from-issue.test.ts | ✅ |
| rebind → awaiting-archive policy → archive | TC-019, archive-from-issue.test.ts | ✅ |
| `job resume --from-issue` が awaiting-archive を拒否 | TC-020, checkpoint-policy.test.ts | ✅ |
| `specrunner guide` の jobs / merge topic に issue 起点取り込みを追記 | TC-027〜028, archive-from-issue.test.ts | ✅ |
| `typecheck && test` が green | verification-result.md | ✅ |

## 観察事項

- `resolveArchiveBranchFromIssue` の返り値 `{ branch, slug, checkpointOid }` のうち `branch` のみ使用。`slug`・`checkpointOid` は `runAttachVerification` が再計算。4 点照合の副産物として自然に得られるため許容範囲。
- 確定 branch は `resolveArchiveBranchFromIssue` と `runAttachVerification` の両方で fetch される（2 回）。fetch は冪等で問題なし。
- `design.md` リスクセクションに locator 重複の `ponytail:` コメントが記載されており、意図的な重複として文書化済み。
