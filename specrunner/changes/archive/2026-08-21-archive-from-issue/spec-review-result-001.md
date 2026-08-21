# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### Spec ファイル群の全読み
- `request.md` — 要件・背景・受け入れ基準・architect 判断を読了
- `design.md` — D1〜D10 の全設計判断・リスクとトレードオフ・Open Questions を読了
- `spec.md` — 全 Requirement × Scenario を読了
- `tasks.md` — T-01〜T-12 の全タスクと Acceptance Criteria を読了
- `test-cases.md` — TC-001〜TC-030 の全テストケースと Summary/Result を読了

### 既存コードとの整合性確認
読んだファイル:
- `src/core/attach/checkpoint-policy.ts` — `attachResumePolicy` の構造・注入点
- `src/core/attach/verify-checkpoint.ts` — 汎用 integrity 層・policy 実行順（line 175）
- `src/core/attach/orchestrator.ts` — `runAttachVerification` / `AttachVerificationInput`
- `src/cli/attach.ts` — 現行の policy 未指定呼び出し・hint 固定文言
- `src/cli/resume-from-issue.ts` — local short-circuit パターン・rebind フロー
- `src/core/issue-target/resume.ts` — `resolveEscalationJobId` / `resolveResumeBranchFromIssue` 実装
- `src/core/notify/issue-notifier.ts` — `buildMarker` / `ESCALATION_MARKER_RE` / `parseEscalationJobId`
- `src/kernel/github-client.ts` — `GitHubClient` interface（`listIssueClosingPullRequests` 未追加を確認）
- `src/core/port/github-client.ts` — re-export のみ
- `src/errors.ts` — `EXIT_CODE_MAP`・`ERROR_CODES`・`resumeFromIssue*Error` ファクトリ
- `src/cli/archive.ts` — `runArchive` の引数 contract（`cwd`, `slug`, `withMerge`, `mergeWaitMs`）
- `src/cli/command-registry.ts:1314-1360` — `archive` コマンド定義・`worktreeGuard: true`
- `src/core/job-access/load-by-job-id.ts` — `JOB_NOT_FOUND` スロー経路
- `src/store/local-job-index.ts` — `resolveJobIdToSlug`（jobId をパス構成要素に使わないことを確認）
- `src/core/command/guide.ts` — `jobs` / `merge` トピックの現行テキスト

### 要件 → spec.md → tasks.md → test-cases.md の完全追跡

| 要件 | spec Scenario 数 | tasks Acceptance Criteria | TC カバレッジ |
|------|-----------------|--------------------------|--------------|
| R1 awaiting-archive policy | 4 | T-01: 4 条件 | TC-001〜004 ✓ |
| R2 attach 両受理・hint 出し分け | 3 | T-03: 3 条件 | TC-005〜007 ✓ |
| R3 completed marker 解決 | 3 | T-04: 3 条件 | TC-008〜010, TC-021 ✓ |
| R3 closing-PR locator | 4 | T-06: 4 条件 | TC-011〜014 ✓ |
| R3 CLI 引数契約 | 3 | T-09: 4 条件 | TC-015〜017 ✓ |
| R3 local short-circuit | 1 | T-08: 1 条件 | TC-018 ✓ |
| R3 rebind → archive 接続 | 1 | T-08: 1 条件 | TC-019 ✓ |
| R4 resume 不変 | 1 | T-10: 2 条件 | TC-020, TC-030 ✓ |
| guide 更新 | — | T-11: 2 条件 | TC-027, TC-028 ✓ |

### セキュリティ確認

- **jobId の扱い**: `parseCompletedJobId` の regex `[^"]+` は UUID を強制しないが、jobId は `loadStateByJobId` でキー比較のみに使われ、ファイルシステムパス構成要素には使われない（`resolveJobIdToSlug` 確認済み）。injection リスクなし。
- **headRefName の扱い**: `git fetch origin <headRefName>` は spawnFn の配列引数として渡るためシェル injection なし。
- **4 点照合の役割**: generic integrity 層（journal/counter/profile/request.md/identity）は policy に関わらず常に実行される（verify-checkpoint.ts:175 の policy 呼び出し順序確認済み）。awaiting-archive policy を使っても generic チェックがバイパスされない。
- **fail-closed 設計**: confirmed が複数のとき自動 merge せず typed error（ARCHIVE_FROM_ISSUE_UNCONFIRMED）にする。
- **OWASP A01（Broken Access Control）**: 4 点照合（jobId/issueNumber/branch/PR number）が正当な checkpoint のみを受理する。
- **OWASP A03（Injection）**: git コマンドは配列引数・GitHub API パラメータは integer 型。

### 設計一貫性の確認

- `verifyCheckpoint` の policy 実行順序（generic integrity → policy → request.md → identity）は awaiting-archive policy でも正しく機能する。
- `attachQuiescentPolicy` が `runAttachVerification` 経由で `verifyCheckpoint` に渡ることで fetch/OID 解決の重複が生じない（D3）。
- `resume-from-issue.ts` は policy を渡さない → デフォルト `attachResumePolicy` が維持される → 要件 4 を機械的に保証する。
- `IssueArchiveClient` が `Pick<GitHubClient, "listIssueComments" | "listIssueClosingPullRequests">` を使うため `listIssueClosingPullRequests` は kernel interface 追加が必要（T-05 が担う）。タスク依存関係は正しい。

## 検証できなかった項目

- `src/adapter/github/github-client.ts` の `listIssueClosingPullRequests` 実装（未実装・spec-review 段階のため）。GraphQL クエリの応答マッピングは T-05 の Acceptance Criteria で固定されているため実装後に verification で確認される。
- `src/core/issue-target/archive.ts`（新規ファイル、未実装）の詳細挙動は実装後の verification に委ねる。
- `src/cli/__tests__/archive-from-issue.test.ts`（新規、未実装）の内容。

## Findings 詳細

### Finding 1: T-08 の `baseBranch` 導出が暗黙

**対象**: `tasks.md > T-08` の `setupWorkspace` 呼び出し記述

T-08 では `setupWorkspace(verified.slug, verified.jobId, { attachCheckpoint: {...}, baseBranch })` と書くが、`baseBranch` の値をどこから取るかを明示していない。`resume-from-issue.ts` のパターン（`verified.state.request.baseBranch ?? "main"`）を実装者が推測して補完する必要がある。

受け入れ基準・spec.md のいずれにも明記がなく、実装ミスのリスクがある。T-08 の `setupWorkspace` 呼び出し行に `baseBranch = verified.state.request.baseBranch ?? "main"` を補足すると明確になる。

### Finding 2: TC-030 の「既存テスト」の指す範囲が曖昧

**対象**: `test-cases.md > TC-030`

「既存の resume / attach / archive テストが無変更で green」と書くが、T-03 が新規追加する `attach.test.ts` や T-09 の新規 CLI テストが「既存」に含まれるか読み手によって解釈が異なる。本 feature 追加前に存在していたテストのみを指す意図であれば、表現を「本 request 追加前から存在するテストが無変更で green」と明記すると誤解がない。

### Finding 3: `listIssueClosingPullRequests` の `first: 50` 上限が仕様に明示されていない

**対象**: `tasks.md > T-05` / `design.md > D5`

design.md では `closedByPullRequestsReferences(first:50)` と記述し、tasks.md も同様だが spec.md の Requirement には上限の記述がない。50 超の closing PR が存在する場合は silent truncation となり、confirmed が 0 件になって `ARCHIVE_FROM_ISSUE_UNCONFIRMED` になる（fail-closed）。design.md に `ponytail:` コメントで ceiling が記録されており、手動コマンドのため許容範囲だが、spec.md の closing-PR Requirement にこの上限を一文加えておくと受け入れ基準の精度が上がる。

※ 機能上のブロッカーではなく、spec の完全性に関する指摘。
