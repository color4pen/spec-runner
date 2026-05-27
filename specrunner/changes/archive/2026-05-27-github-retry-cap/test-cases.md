# Test Cases: GitHub API request() の 429 retry に上限を追加する

## Overview

対象: `src/adapter/github/github-client.ts` の `request()` メソッド  
テストファイル: `tests/unit/adapter/github/github-client-request.test.ts`

---

## TC-RC-009: 429 retry exhausted → GITHUB_API_ERROR を throw

- **Category**: Unit / Error handling
- **Priority**: must
- **Source**: 受け入れ基準「429 retry が最大回数で打ち切られ、エラーが throw される」/ tasks.md T-02

**GIVEN** GitHubApiClient が初期化されており、  
**AND** mockFetch が 429 を 6 回連続して返す（初回 + MAX_429_RETRIES=5 回のリトライ）

**WHEN** `getRefSha()` を呼び出す

**THEN** `GITHUB_API_ERROR` コードで reject される  
**AND** fetch は合計 6 回呼ばれる（初回 1 + retry 5）  
**AND** sleepFn は 5 回呼ばれる（各 retry 前の Retry-After wait）

---

## TC-RC-010: X-RateLimit-Remaining: 0 retry exhausted → GITHUB_API_ERROR を throw

- **Category**: Unit / Error handling
- **Priority**: must
- **Source**: 受け入れ基準「X-RateLimit-Remaining: 0 の待機も同じ上限で打ち切られる」/ tasks.md T-02

**GIVEN** GitHubApiClient が初期化されており、  
**AND** mockFetch が `X-RateLimit-Remaining: 0` + status 200 を 6 回連続して返す

**WHEN** `getRefSha()` を呼び出す

**THEN** `GITHUB_API_ERROR` コードで reject される  
**AND** fetch は合計 6 回呼ばれる  
**AND** sleepFn は 5 回呼ばれる（各 reset wait）

---

## TC-RC-011: 429 と X-RateLimit-Remaining: 0 が混在しても合計で上限に達したら throw

- **Category**: Unit / Error handling
- **Priority**: should
- **Source**: design.md D3「429 と rate-limit で単一カウンタを共有する」/ tasks.md T-02 TC-RC-011 (optional)

**GIVEN** GitHubApiClient が初期化されており、  
**AND** mockFetch が 429 を 3 回、続けて `X-RateLimit-Remaining: 0` + 200 を 3 回返す（合計 6 回）

**WHEN** `getRefSha()` を呼び出す

**THEN** `GITHUB_API_ERROR` コードで reject される  
**AND** fetch は合計 6 回呼ばれる  
**AND** sleepFn は 5 回呼ばれる（attempt429 が 5 に達した時点でカウントアップより先に throw）

---

## TC-RC-012: 429 が MAX_429_RETRIES 未満で成功した場合は結果を返す（リグレッション）

- **Category**: Unit / Regression
- **Priority**: must
- **Source**: 受け入れ基準「既存の 5xx retry テストが通る」/ TC-RC-004 リグレッション確認

**GIVEN** GitHubApiClient が初期化されており、  
**AND** mockFetch が 429 を 1 回返した後に 200 (SHA) を返す

**WHEN** `getRefSha()` を呼び出す

**THEN** SHA が返される（エラーにならない）  
**AND** fetch は 2 回呼ばれる  
**AND** sleepFn は 1 回呼ばれる

---

## TC-RC-013: X-RateLimit-Remaining: 0 が MAX_429_RETRIES 未満で成功した場合は結果を返す（リグレッション）

- **Category**: Unit / Regression
- **Priority**: must
- **Source**: 受け入れ基準「既存の 5xx retry テストが通る」/ TC-RC-006 リグレッション確認

**GIVEN** GitHubApiClient が初期化されており、  
**AND** mockFetch が `X-RateLimit-Remaining: 0` + 200 を 1 回返した後に正常な 200 (SHA) を返す

**WHEN** `getRefSha()` を呼び出す

**THEN** SHA が返される（エラーにならない）  
**AND** fetch は 2 回呼ばれる  
**AND** sleepFn は 1 回呼ばれる

---

## TC-RC-014: attempt429 カウンタは attempt5xx と独立している

- **Category**: Unit / Counter isolation
- **Priority**: should
- **Source**: design.md — 5xx と 429 は別カウンタ。5xx 直後に 429 が来ても 429 カウンタはリセットされない

**GIVEN** GitHubApiClient が初期化されており、  
**AND** mockFetch が 503 (5xx) を 2 回返した後、429 を 1 回返し、最後に 200 (SHA) を返す

**WHEN** `getRefSha()` を呼び出す

**THEN** SHA が返される（5xx カウンタと 429 カウンタが干渉しない）  
**AND** fetch は 4 回呼ばれる

---

## TC-RC-015: MAX_429_RETRIES 定数が MAX_5XX_RETRIES (3) より大きい値 (5) で定義される

- **Category**: Unit / Static assertion
- **Priority**: could
- **Source**: design.md D1「5xx より多めに許容する」/ request.md architect 評価済みの設計判断

**GIVEN** `github-client.ts` のモジュールスコープ定数を確認する

**WHEN** `MAX_429_RETRIES` と `MAX_5XX_RETRIES` の値を比較する

**THEN** `MAX_429_RETRIES` (5) > `MAX_5XX_RETRIES` (3) である  
**AND** `MAX_429_RETRIES` は 5 である

---

## TC-RC-016: 5xx retry 上限を超えた場合は GITHUB_API_ERROR を throw する（既存テストのリグレッション）

- **Category**: Unit / Regression
- **Priority**: must
- **Source**: 受け入れ基準「既存の 5xx retry テストが通る」/ TC-RC-008 リグレッション確認

**GIVEN** GitHubApiClient が初期化されており、  
**AND** mockFetch が 503 を常に返す

**WHEN** `verifyBranch()` を呼び出す

**THEN** `GITHUB_API_ERROR` コードで reject される  
**AND** fetch は 4 回呼ばれる（初回 1 + MAX_5XX_RETRIES=3 retries）  
**AND** sleepFn は 3 回呼ばれる  
**AND** attempt429 カウンタには影響しない（5xx は attempt429 を increment しない）
