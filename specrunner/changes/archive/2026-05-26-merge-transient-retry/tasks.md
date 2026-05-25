# Tasks: merge-transient-retry

## Task 1: [x] `retryWithBackoff<T>` helper を新規作成

**ファイル**: `src/util/retry.ts` (新規)

**内容**:
- `retryWithBackoff<T>(fn, opts)` を export
- opts:
  - `isTransientError?: (err: unknown) => boolean` — throw された error の transient 判定
  - `shouldRetryResult?: (result: T) => boolean` — return 値の transient 判定
  - `maxAttempts?: number` (default: 4) — 試行上限 (初回含む)
  - `baseDelayMs?: number` (default: 1000) — 初回 delay (ms)
  - `sleepFn?: (ms: number) => Promise<void>` — テスト用 DI
  - `onRetry?: (attempt: number, info: { err?: unknown; result?: T }) => void` — retry 前 callback
- delay 計算: `baseDelayMs * 2^(attempt-1)` — attempt=1 なら 1s, attempt=2 なら 2s, attempt=3 なら 4s
- フロー:
  1. `fn()` を実行
  2. 成功 (= throw しない) → `shouldRetryResult` が truthy なら retry 判定、falsy/未定義なら result 返却
  3. throw → `isTransientError` が truthy なら retry 判定、falsy/未定義なら re-throw
  4. retry 判定: `attempt < maxAttempts` なら `onRetry` → `sleep(delay)` → 次の attempt。exhausted なら最後の result を返す / 最後の error を re-throw

## Task 2: [x] `retryWithBackoff` の unit test

**ファイル**: `tests/util/retry.test.ts` (新規)

**テストケース**:
- 初回成功 → retry なし、result がそのまま返る
- `shouldRetryResult` で 2 回 retry → 3 回目成功 → 最終 result が返る
- `isTransientError` で 1 回 retry → 2 回目成功 → 最終 result が返る
- `maxAttempts` exhausted + `shouldRetryResult` → 最後の result が返る (throw しない)
- `maxAttempts` exhausted + `isTransientError` → 最後の error が re-throw
- `onRetry` が正しい attempt number と info で呼ばれる
- delay が exponential (sleepFn の呼び出し引数を検証: 1000, 2000, 4000)
- `shouldRetryResult` 未定義時は result をそのまま返す (retry しない)
- `isTransientError` 未定義時は error を re-throw (retry しない)

## Task 3: [x] `mergePullRequest()` に 423 分岐追加 + `retryWithBackoff` で wrap

**ファイル**: `src/adapter/github/github-client.ts`

### 3a: 423 (Locked) の明示的ハンドリング追加

既存の `if (resp.status === 405 || resp.status === 409)` 分岐の後に 423 を追加:
```ts
if (resp.status === 423) {
  const data = (await resp.json().catch(() => ({ message: "" }))) as { message?: string };
  return { merged: false, message: data.message ?? "Merge failed: branch locked (status 423)" };
}
```

### 3b: transient 判定 helper 関数

`mergePullRequest()` の近くにモジュールプライベートな helper を定義:
```ts
function isMergeTransientFailure(result: { merged: boolean; message: string }): boolean {
  if (result.merged) return false;
  const msg = result.message.toLowerCase();
  return (
    msg.includes("base branch was modified") ||
    msg.includes("unstable state") ||
    msg.includes("locked")
  );
}
```

### 3c: `mergePullRequest()` 全体を `retryWithBackoff` で wrap

現在の `mergePullRequest()` のメソッド本体を内部関数 `attemptMerge()` に抽出し、`retryWithBackoff(attemptMerge, opts)` で呼び出す。

opts:
- `shouldRetryResult: isMergeTransientFailure`
- `maxAttempts: 4`
- `baseDelayMs: 1000`
- `sleepFn: this.sleepFn`
- `onRetry: (attempt, { result }) => process.stdout.write(...)` — log 出力

log 形式: `"GitHub PR merge retry: <message>, retrying (<attempt>/3)...\n"`

## Task 4: [x] `mergePullRequest()` の retry テストケース追加

**ファイル**: `tests/unit/adapter/github/github-client-pr.test.ts`

**追加テストケース**:
- TC-PM-010: 405 + "Base branch was modified" → retry → 2 回目 200 → `{ merged: true }`
- TC-PM-011: 405 + "unstable state" → retry → 2 回目 200 → `{ merged: true }`
- TC-PM-012: 423 Locked → retry → 2 回目 200 → `{ merged: true }`
- TC-PM-013: 405 + "Base branch was modified" × 4 回 → exhausted → `{ merged: false }` (最後の result)
- TC-PM-014: 403 permission denied → retry なし → `{ merged: false }` (permanent)
- TC-PM-015: 409 conflict → retry なし → `{ merged: false }` (permanent)
- TC-PM-016: 405 + "Pull request is not mergeable" → retry なし → `{ merged: false }` (permanent)

各テストで `mockFetch` の呼び出し回数を検証し、retry が正しく制御されていることを確認する。

## Task 5: [x] typecheck + test green 確認

`bun run typecheck && bun run test` を実行し、全テスト green を確認する。

## Delta Spec

`specrunner/changes/merge-transient-retry/specs/github-api-lib/spec.md` に配置済み。既存 baseline `github-api-lib` の「PR Merge via REST API」requirement を MODIFIED し、transient retry のシナリオを追加。
