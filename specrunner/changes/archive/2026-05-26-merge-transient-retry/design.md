# Design: merge-transient-retry

## 設計判断

### D1: retry を adapter 内部 (`github-client.ts`) に配置する — 案 (a) 採用

**理由**: `mergePullRequest()` は adapter 境界のメソッド。transient failure の吸収は「GitHub API の振る舞いを隠蔽する」adapter の責務であり、orchestrator が知る必要はない。既存の `request()` 層が 5xx/429/network error を透過的に吸収しているのと同じ設計軸。

**結果**: orchestrator の `mergeFeaturePrPhase3()` は変更不要。`mergePullRequest()` の contract (= `{ merged: boolean, message: string }` を返す) が変わらないため、port interface も変更不要。

### D2: 汎用 `retryWithBackoff<T>` を `src/util/retry.ts` に新規作成

**理由**: `mergePullRequest()` は 405/423 を throw せず `{ merged: false, message }` として返す。標準的な retry ライブラリは throw ベースの判定のみ。本プロジェクトでは return 値ベースの transient 判定 (`shouldRetryResult`) も必要。

**API**:
```ts
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: {
    isTransientError?: (err: unknown) => boolean;
    shouldRetryResult?: (result: T) => boolean;
    maxAttempts?: number;      // default: 4
    baseDelayMs?: number;      // default: 1000
    sleepFn?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, info: { err?: unknown; result?: T }) => void;
  },
): Promise<T>;
```

- `maxAttempts` = 試行上限 (初回含む)。4 なら初回 + retry 3 回 = 最大 4 回実行
- delay: `baseDelayMs * 2^(attempt-1)` — 1s → 2s → 4s
- `shouldRetryResult` が true を返したら retry。false or undefined なら result をそのまま返す
- `isTransientError` が true を返したら retry。false or undefined なら re-throw
- 両方 exhausted したら最後の result/error をそのまま返す/re-throw

### D3: transient 判定ロジックを `mergePullRequest()` 内部の `shouldRetryResult` callback に閉じる

**transient** (retry 対象):
- `merged: false` かつ message に `"Base branch was modified"` を含む (HTTP 405)
- `merged: false` かつ message に `"unstable state"` を含む (HTTP 405)
- `merged: false` かつ message に `"Locked"` を含む、または HTTP 423 のレスポンス

**permanent** (retry しない = 既存の `{ merged: false }` がそのまま返る):
- HTTP 403 → `"permission denied"` message
- HTTP 409 → `"Merge not allowed"` message
- HTTP 422 → Required status check 系
- その他 405 → `"Pull request is not mergeable"` 等

**実装方針**: `mergePullRequest()` の既存分岐 (status 200/403/405/409/fallback) はそのまま維持。メソッド全体を `retryWithBackoff` で wrap し、`shouldRetryResult` で transient message を判定する。

### D4: 423 (Locked) のハンドリングを既存の status 分岐に追加

現状 `mergePullRequest()` は 200/403/405/409 のみ明示的にハンドリングしており、423 は fallback (`"Merge failed (status ${resp.status})"`) に落ちる。423 を 405/409 と同じ分岐に追加し、`{ merged: false, message }` として返す。これにより `shouldRetryResult` で統一的に transient 判定できる。

### D5: log 出力は `onRetry` callback + `process.stdout.write`

既存の polling log (`"Post-push polling: mergeStateStatus=..., retrying (N/M)..."`) と整合させる形式:
```
GitHub PR merge retry: Base branch was modified, retrying (1/3)...
```

`onRetry` callback を `mergePullRequest()` 内部で定義し、`process.stdout.write` で出力。adapter 内なので `"GitHub PR merge retry"` prefix を使う (phase 概念を持たない)。

### D6: 既存 `request()` 層との二重 retry 回避

| 層 | 対象 | retry |
|---|---|---|
| `request()` | 5xx, network error, 429, rate limit | backoff 3 回 (5xx/network), unlimited (429/rate) |
| `mergePullRequest()` (本 request) | 405 transient, 423 | backoff 3 回 |

5xx は `request()` 層で throw される → `mergePullRequest()` の try-catch で catch → `retryWithBackoff` の `isTransientError` は **未定義** (= re-throw) → orchestrator の既存 catch で escalation。二重 retry にならない。

## 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/util/retry.ts` | **新規**: `retryWithBackoff<T>` helper |
| `src/adapter/github/github-client.ts` | `mergePullRequest()` を `retryWithBackoff` で wrap + 423 分岐追加 + transient 判定 helper |
| `tests/util/retry.test.ts` | **新規**: `retryWithBackoff` の unit test |
| `tests/unit/adapter/github/github-client-pr.test.ts` | merge retry のテストケース追加 |

## 変更しないファイル

- `src/core/port/github-client.ts` — port interface は変更なし (`mergePullRequest` の signature は同一)
- `src/core/finish/orchestrator.ts` — adapter 側で transient を吸収するため変更不要
- `src/core/finish/pr-status.ts` — 既存 polling 機構はそのまま維持
