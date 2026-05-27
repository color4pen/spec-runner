# Design: GitHub API request() の 429 retry に上限を追加する

## Context

`GitHubApiClient.request()` は 429 (Too Many Requests) と `X-RateLimit-Remaining: 0` で `continue` によるリトライを行うが、上限がない。5xx / network error は `MAX_5XX_RETRIES = 3` で保護されているが、429 / rate-limit パスは無限ループする。

`mergePullRequest()` は外側に `retryWithBackoff(maxAttempts=4)` を持つが、各 attempt 内の `request()` が 429 で無限ハングすると全体がハングする。

## Goals

- 429 retry と `X-RateLimit-Remaining: 0` 待機に最大回数を追加し、無限ループを防止する
- 既存の retry 挙動（Retry-After 準拠、exponential backoff）は維持する

## Non-Goals

- `mergePullRequest()` の `retryWithBackoff()` ロジックの変更
- rate limit の予測的回避

## Decisions

### D1: `MAX_429_RETRIES = 5` 定数で上限を定義する

`MAX_5XX_RETRIES = 3` と同じパターンで `MAX_429_RETRIES = 5` をモジュールスコープ定数として定義する。

429 カウンタ (`attempt429`) を `request()` の `while(true)` ループの前に初期化し、429 / rate-limit の各パスで increment + 上限チェックを行う。

**429 と rate-limit で単一カウンタを共有する理由**: 両方とも「GitHub がリクエスト抑制をかけている」状態であり、分けても実運用上メリットがない。共有することで実装・テストが単純になる。

**5 回にする理由**: 429 は正常なレートリミットであり Retry-After に従えば回復する可能性が高い。5xx (サーバー障害) より多めに許容するが、無限は許容しない。

### D2: 上限超過時は `githubApiError()` で throw する

5xx exhausted と同じエラーパターンに合わせ、`githubApiError(429, ...)` を throw する。呼び出し元は既存の `SpecRunnerError(GITHUB_API_ERROR)` ハンドリングでカバー済。

### D3: `attempt429` カウンタは 429 と rate-limit の両方をカウントする

429 レスポンスと `X-RateLimit-Remaining: 0` レスポンスの両方で `attempt429` を increment する。片方だけ連続するケースも、交互に来るケースも、合計で `MAX_429_RETRIES` 回に達したら打ち切る。

## Implementation Outline

```typescript
const MAX_429_RETRIES = 5;

private async request(...): Promise<Response> {
  let attempt5xx = 0;
  let attempt429 = 0;  // NEW

  while (true) {
    // ... existing fetch ...

    // 429: Too Many Requests
    if (response.status === 429) {
      if (attempt429 >= MAX_429_RETRIES) {
        throw githubApiError(429, `request(${url}): 429 after ${MAX_429_RETRIES} retries`);
      }
      // ... existing Retry-After wait ...
      attempt429++;
      continue;
    }

    // X-RateLimit-Remaining: 0
    if (rateLimitRemaining === "0") {
      if (attempt429 >= MAX_429_RETRIES) {
        throw githubApiError(429, `request(${url}): rate limit exhausted after ${MAX_429_RETRIES} retries`);
      }
      // ... existing reset wait ...
      attempt429++;
      continue;
    }

    // ... rest unchanged ...
  }
}
```
