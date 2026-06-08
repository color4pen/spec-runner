# Tasks: pr-status.ts ユニットテスト追加

## T-01: テストファイルの足場と共通 helper を作成する

- [x] `tests/unit/core/finish/pr-status.test.ts` を新規作成する
- [x] `import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"` を記述する
- [x] テスト対象を import する: `fetchPrViewWithRetry`, `checkMergeableForMerge`, `MERGEABLE_RETRY_COUNT`（`../../../../src/core/finish/pr-status.js`）
- [x] `import type { GitHubClient } from "../../../../src/core/port/github-client.js"` を記述する
- [x] `makeGitHubClient(overrides: Partial<GitHubClient> = {}): GitHubClient` を inline 定義し、全メソッド（`verifyBranch` / `getRawFile` / `verifyPath` / `verifyTokenScopes` / `getRefSha` / `listPullRequests` / `createPullRequest` / `getPullRequest` / `getCheckStatus` / `mergePullRequest` / `listPullRequestFiles`）を `vi.fn()` でスタブし、末尾に `...overrides` を展開する（`tests/unit/core/archive/merge-then-archive.test.ts` の factory と同形）
- [x] no-op の sleepFn を生成する記述（`const sleepFn = vi.fn().mockResolvedValue(undefined)` を各テストまたは共通生成 helper で用意）
- [x] `beforeEach` で `vi.spyOn(process.stderr, "write").mockReturnValue(true)`、`afterEach` で `vi.restoreAllMocks()` を行い retry path の stderr 出力を抑止する
- [x] 共通の固定パラメータ（`owner` / `repo` / `prNumber` / `slug` / `baseBranch="main"`）を定数で定義する

**Acceptance Criteria**:
- `tests/unit/core/finish/pr-status.test.ts` が存在し、`makeGitHubClient` helper を内包する
- 新規共有ファイル（`tests/helpers/github-client-mock.ts` 等）を作成していない
- `src/` 配下を一切変更していない

## T-02: fetchPrViewWithRetry の 5 分岐テストを実装する

- [x] CLEAN 系成功: `getPullRequest` が `{ state: "OPEN", mergeStateStatus: "CLEAN" }` → `result.ok === true` かつ `result.data` が取得値を含む。`sleepFn` 未呼び出しを assert する
- [x] getPullRequest throw: `getPullRequest` が `Error` を throw → `result.ok === false` かつ `result.escalation` が `"getPullRequest"` を含む（`toContain`）
- [x] UNKNOWN→CLEAN retry: `getPullRequest` を `mockResolvedValueOnce({ state: "OPEN", mergeStateStatus: "UNKNOWN" }).mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN" })` → `result.ok === true`、`sleepFn` 1 回、`getPullRequest` 2 回呼び出しを assert する
- [x] UNKNOWN 全消尽: `getPullRequest` が常に `{ state: "OPEN", mergeStateStatus: "UNKNOWN" }` → `result.ok === false`、`escalation` が `"UNKNOWN"` を含み、`getPullRequest` が 3 回（= UNKNOWN_RETRY_COUNT）呼ばれることを assert する
- [x] MERGED+UNKNOWN bypass: `getPullRequest` が `{ state: "MERGED", mergeStateStatus: "UNKNOWN" }` → `result.ok === true`、`sleepFn` 未呼び出し、`getPullRequest` 1 回呼び出しを assert する
- [x] 全テストで `fetchPrViewWithRetry({ prNumber, githubClient, owner, repo, slug, sleepFn })` を呼ぶ

**Acceptance Criteria**:
- `fetchPrViewWithRetry` の 5 分岐（成功 / throw / retry成功 / retry消尽 / MERGED bypass）が個別の `it` で網羅される
- 各 `result` は `ok` で narrowing したうえで `data` / `escalation` を assert する

## T-03: checkMergeableForMerge の 5 分岐テストを実装する

- [x] MERGEABLE 成功: `getPullRequest` が `{ mergeable: "MERGEABLE" }` → `result.ok === true`、`sleepFn` 未呼び出しを assert する
- [x] CONFLICTING escalation: `getPullRequest` が `{ mergeable: "CONFLICTING" }`、`baseBranch="main"` → `result.ok === false` かつ `escalation` が `"main"` を含む（`toContain`）
- [x] UNKNOWN→MERGEABLE retry: `getPullRequest` を `mockResolvedValueOnce({ mergeable: "UNKNOWN" }).mockResolvedValue({ mergeable: "MERGEABLE" })` → `result.ok === true`、`sleepFn` 1 回、`getPullRequest` 2 回を assert する
- [x] UNKNOWN 全消尽: `getPullRequest` が常に `{ mergeable: "UNKNOWN" }` → `result.ok === false`、`escalation` が `"UNKNOWN"` を含み、`sleepFn` が `MERGEABLE_RETRY_COUNT - 1` 回呼ばれることを assert する
- [x] getPullRequest throw: `getPullRequest` が `Error` を throw → `result.ok === false` かつ `escalation` が `"getPullRequest"` を含む
- [x] 全テストで `checkMergeableForMerge({ prNumber, githubClient, owner, repo, slug, baseBranch, sleepFn })` を呼ぶ

**Acceptance Criteria**:
- `checkMergeableForMerge` の 5 分岐（MERGEABLE / CONFLICTING / retry成功 / retry消尽 / throw）が個別の `it` で網羅される
- 消尽テストの retry 期待回数は export 済み定数 `MERGEABLE_RETRY_COUNT` から導出する

## T-04: 品質ゲートを green にする

- [x] `bun run typecheck` が pass する（戻り値 union の narrowing 漏れ・型エラーがない）
- [x] `bun run test` が pass する（10 分岐すべて green）
- [x] `bun run lint` が pass する（`eslint ./src ./tests --max-warnings 0`、warning 0）

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green
- `bun run lint` が green
- 変更は `tests/unit/core/finish/pr-status.test.ts` の 1 ファイル追加のみで、`src/` 配下に差分がない
