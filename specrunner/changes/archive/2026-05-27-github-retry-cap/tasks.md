# Tasks: GitHub API request() の 429 retry に上限を追加する

## T-01: `request()` に 429 retry 上限を追加する

対象: `src/adapter/github/github-client.ts`

- [x] モジュールスコープ定数 `MAX_429_RETRIES = 5` を追加する（`MAX_5XX_RETRIES` の隣）
- [x] `request()` の `while(true)` ループ前に `let attempt429 = 0` を追加する
- [x] 429 パス: `attempt429 >= MAX_429_RETRIES` なら `githubApiError(429, ...)` を throw。そうでなければ既存の Retry-After wait 後に `attempt429++` して `continue`
- [x] `X-RateLimit-Remaining: 0` パス: 同じく `attempt429 >= MAX_429_RETRIES` なら `githubApiError(429, ...)` を throw。そうでなければ既存の reset wait 後に `attempt429++` して `continue`
- [x] ファイル冒頭の JSDoc コメント（L8-9）を更新: `(unlimited)` → `(max 5 retries)`

受け入れ基準:
- `bun run typecheck` が green
- 既存の 429 / rate-limit テスト（TC-RC-004〜006）が green（retry 1 回で成功するケースは上限以内なので変更不要）

## T-02: 429 上限超過のユニットテストを追加する

対象: `tests/unit/adapter/github/github-client-request.test.ts`

- [x] TC-RC-009: 429 retry exhausted → `GITHUB_API_ERROR` を throw
  - mockFetch が 429 を 6 回返す（`MAX_429_RETRIES + 1`）
  - `getRefSha()` が `code: ERROR_CODES.GITHUB_API_ERROR` で reject
  - fetch は 6 回呼ばれる（初回 + 5 retries）
  - sleepFn は 5 回呼ばれる（各 retry 前の Retry-After wait）
- [x] TC-RC-010: `X-RateLimit-Remaining: 0` retry exhausted → `GITHUB_API_ERROR` を throw
  - mockFetch が `X-RateLimit-Remaining: 0` + status 200 を 6 回返す
  - `getRefSha()` が `code: ERROR_CODES.GITHUB_API_ERROR` で reject
  - fetch は 6 回呼ばれる
- [x] TC-RC-011 (optional): 429 と rate-limit が混在しても合計で上限に達したら throw
  - 429 を 3 回 → rate-limit を 3 回 → 合計 6 回で throw

受け入れ基準:
- `bun run typecheck && bun run test` が green
