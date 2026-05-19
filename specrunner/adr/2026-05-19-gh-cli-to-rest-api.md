# ADR: gh CLI 依存を GitHub REST API 直叩きに置き換える

**Date**: 2026-05-19
**Status**: Accepted

## Context

`specrunner finish` と `specrunner run` の pr-create ステップは、PR 操作（作成・取得・マージ）に `gh` CLI subprocess を使用していた。`specrunner login` で GitHub OAuth トークンを統一管理する認証チェーン（PR #248）が完成したことで、gh CLI を外部依存として保持する理由がなくなった。

既存の問題点：
- `gh` CLI が環境にインストールされていないと finish が失敗する
- spawn subprocess のモック複雑性がテストの保守コストを増大させていた
- `gh pr view --json` の出力パースが壊れやすかった（フォーマット変更の影響を受ける）
- doctor check で `gh` バイナリの存在確認が必要だった

## Decision

`GitHubClient` ポートに PR 操作メソッドを追加し、`GitHubApiClient` アダプタで GitHub REST API を直接呼ぶように実装を置き換える。

### ポートの拡張（D1）

`src/core/port/github-client.ts` に 4 メソッドを追加：

```typescript
listPullRequests(owner, repo, head, base): Promise<Array<{ url, number, state }>>
createPullRequest(owner, repo, head, base, title, body): Promise<{ url, number }>
getPullRequest(owner, repo, prNumber): Promise<{ state, mergeStateStatus?, headRefName?, mergeable? }>
mergePullRequest(owner, repo, prNumber, opts: { mergeMethod: "squash" }): Promise<{ merged, message }>
```

### 共有 middleware（D3）

`GitHubApiClient` に private `request()` メソッドを追加し、全 PR 操作・既存メソッドの共通 HTTP 処理を集約：
- 全リクエストに `X-GitHub-Api-Version: 2022-11-28` ヘッダを付与（D5）
- 401 → `githubTokenExpiredError()` を即 throw
- 429 → `Retry-After` ヘッダ準拠で wait → retry
- `X-RateLimit-Remaining: 0` → reset 時刻まで wait → retry
- 5xx / network error → exponential backoff (base=1s, factor=2, jitter, max 3 retry)

### フィールドマッピング（D2）

REST API フィールド → 内部表現の変換をアダプタ境界で実施：
- `mergeable_state` → `mergeStateStatus` (CLEAN/DIRTY/UNKNOWN/BLOCKED/BEHIND)
- `head.ref` → `headRefName`
- `merged_at` + `state` → 内部 OPEN/MERGED/CLOSED
- `mergeable` bool|null → "MERGEABLE"/"CONFLICTING"/"UNKNOWN"

### `--admin` 相当（D4）

REST API では `--admin` フラグの明示的な等価物はない。管理者トークンを持つユーザーが merge すると branch protection をバイパスできる（暗黙的）。

### `owner`/`repo` の解決（D6）

CLI エントリポイント（`src/cli/finish.ts`）で `getOriginInfo(cwd)` から取得し、`FinishInput` / `PipelineDeps` 経由で注入する。

## Affected Files

**本番コード（変更）**:
- `src/core/port/github-client.ts` — 4 メソッド追加
- `src/adapter/github/github-client.ts` — `request()` middleware + 4 メソッド実装
- `src/core/types.ts` — `StepContext`/`PipelineDeps` に `owner`/`repo` 追加
- `src/core/pr-create/runner.ts` — spawn → GitHubClient に完全移行
- `src/core/step/pr-create.ts` — deps から `githubClient`/`owner`/`repo` を使用
- `src/core/finish/pr-status.ts` — `fetchPrViewWithRetry`/`pollMergeStateAfterPush`/`checkMergeableForMerge` を GitHubClient 経由に
- `src/core/finish/orchestrator.ts` — `FinishInput` に `githubClient`/`owner`/`repo` 追加
- `src/core/finish/resolve-target.ts` — `--pr` reverse lookup を GitHubClient 経由に
- `src/core/finish/preflight.ts` — binary check から `gh` を除外
- `src/core/runtime/local.ts` / `managed.ts` / `factory.ts` — `owner`/`repo` を `buildDeps()` に注入
- `src/cli/finish.ts` — GitHub token 解決 + `getOriginInfo` + `GitHubClient` 生成

**削除**:
- `src/core/doctor/checks/runtime/gh-cli.ts` — `gh` doctor check を廃止

## Consequences

### Positive
- `gh` CLI がインストールされていない環境でも finish/pr-create が動作する
- 認証が `specrunner login` に一元化される（`gh auth login` 不要）
- テストが spawn mock ではなく GitHubClient interface mock で書けるため保守性向上
- retry / rate-limit 処理が全 REST 呼び出しで統一される

### Negative
- `ps` コマンドは引き続き `gh pr view` を使用（別 PR 対象）
- `GitHubClient` インタフェースの変更により既存の mock オブジェクトに 4 メソッドのスタブ追加が必要だった

### Neutral
- `owner`/`repo` が `PipelineDeps` / `FinishInput` の必須フィールドになった
  - 呼び出し元は `getOriginInfo()` で解決する責任を持つ
