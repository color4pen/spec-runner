# GitHub API request() の 429 retry に上限を追加する

## Meta

- **type**: bug-fix
- **slug**: github-retry-cap
- **base-branch**: main
- **adr**: false

## 背景

`src/adapter/github/github-client.ts` の `request()` メソッドで 429 (Too Many Requests) と `X-RateLimit-Remaining: 0` のリトライに上限がなく、`continue` で無限ループする。`mergePullRequest()` 自体は `retryWithBackoff()` + `maxAttempts=4` で保護されているが、各 attempt 内の `request()` で 429 が連続すると全体として無限ハングする。

Closes #431

## 要件

1. `src/adapter/github/github-client.ts` の `request()` メソッド内の 429 retry に最大リトライ回数を追加する（例: 5 回）
2. `X-RateLimit-Remaining: 0` の待機にも同じ上限を適用する
3. 上限超過時は既存の `githubApiError()` でエラーを throw する
4. 既存の 5xx retry (`MAX_5XX_RETRIES = 3`) のパターンに合わせる

## スコープ外

- `mergePullRequest()` の `retryWithBackoff()` ロジックの変更
- rate limit の予測的回避（Retry-After に従う既存挙動は維持）

## 受け入れ基準

- [ ] 429 retry が最大回数で打ち切られ、エラーが throw される
- [ ] `X-RateLimit-Remaining: 0` の待機も同じ上限で打ち切られる
- [ ] 既存の 5xx retry テストが通る
- [ ] 429 上限超過のユニットテストが追加される
- [ ] `X-RateLimit-Remaining: 0` の上限超過でもエラーが throw されることのユニットテストが追加される
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

429 retry 上限を `MAX_5XX_RETRIES` と同じ定数パターンで定義する（例: `MAX_429_RETRIES = 5`）。5xx より多めにする理由は、429 は正常なレートリミットであり待てば回復する可能性が高いため。ただし無限は許容しない。
