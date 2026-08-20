# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション照合

| アサーション | 実コード | 結果 |
|---|---|---|
| `src/core/notify/issue-notifier.ts:78-82` — escalation marker | `buildMarker` 関数が 78-82 行目に存在。format は `<!-- specrunner:notification kind="escalation" jobId="<jobId>" version="1" -->` で request 記載と一致 | ✓ |
| `src/state/schema/types.ts:412` — `JobState.branch: string \| null` | line 412 に `branch: string \| null;` が存在 | ✓ |
| `src/state/schema/types.ts:476` — `issueNumber` | `issueNumber?: number \| null` は **line 458** に存在。line 476 は `inboxOrigin?: boolean`。行番号アノテーションが 18 行ズレている | ✗ (行番号のみ誤り、フィールド自体は存在) |
| `src/core/pr-create/body-template.ts:75` — `Fixes #<issueNumber>` | line 74-75 に `sections.push(\`Fixes #${jobState.issueNumber}\`)` が存在 | ✓ |
| `src/adapter/github/github-client.ts` — REST + GraphQL via POST to /graphql | `graphqlEndpoint()` メソッド (line 689) と `createLinkedBranch` GraphQL mutation が既に存在。GraphQL パターン確立済み | ✓ |

### 先行 request 前提の確認

- `src/core/issue-target/start.ts` — `buildLinkedBranchRegistrar` / `materializeDraftAndStart` / `startWithIssueLink` の 3 関数が存在。issue-target 層は先行 request 通り実装済み ✓
- `src/core/attach/checkpoint-policy.ts` — `attachResumePolicy` が存在。`status === "awaiting-resume"` + resumePoint 解決 + resume step `reads()` 入力検査の 3 check を実装している ✓
- `src/core/attach/verify-checkpoint.ts` — `verifyCheckpoint(input, policy = attachResumePolicy)` として policy が injectable。request の「generic 検証 → policy 検証 → 実体化」構成と一致 ✓
- `src/kernel/github-client.ts` — `GitHubClient` port に `listIssueComments` と `createLinkedBranch` が定義済み ✓

### 設計実現可能性の確認

- `job resume` コマンドの現行定義 (`command-registry.ts:1044-1142`) を確認。`<slug>` positional は `required: true`。`--from-issue` flag は未存在。実装には positional を optional 化 + `--from-issue: { type: "integer", min: 1 }` 追加 + 相互排他チェックが必要。`job start` の `runJobHandler` が同パターンの参照実装として使える ✓
- `tests/unit/architecture/arch-allowlist.ts` — TC-001「`core/issue-target` は `cli/` を import しない」が存在。issue-target 層の新モジュールが cli/ を参照しない設計を維持する必要あり。locator ロジックは `core/issue-target/` に、attach + materialize の呼び出しは CLI 層で行う分割が必要 ✓（architecture 上の制約は明確）
- `GitHubClient` port に `listLinkedBranches` 相当の GraphQL メソッドが未存在 — 新 feature なので想定内。`createLinkedBranch` の GraphQL パターンをそのまま踏襲できる

### "rebind" 用語の対応確認

request が "rebind primitive" と呼ぶ操作は、既存コードの `runAttachVerification` (fetch → read → verify) + `runtime.setupWorkspace(...attachCheckpoint...)` (materialize) の合成に相当する。この対応は実装者が把握する必要がある。

## 検証できなかった項目

- GitHub GraphQL フィールド名 `issue.linkedBranches` / `issue.closedByPullRequestsReferences` の現時点での有効性 — コードベースからは確認不可。request は "2026-08-20 に GraphQL introspection で確認" と明記している。Public Preview 特性上、仕様変更があれば request のアーキテクチャ設計（Development API を optional index に留める）が適切に機能する

## Findings 詳細

### F-1: `types.ts:476` 行番号アノテーションの誤り（低重要度）

request 本文 `src/state/schema/types.ts:476` は `issueNumber` を指しているが、実際は line 458 に存在する（line 476 は `inboxOrigin?: boolean`）。フィールド自体は存在し設計に影響はないが、実装者が行番号で参照する際に混乱する可能性がある。
