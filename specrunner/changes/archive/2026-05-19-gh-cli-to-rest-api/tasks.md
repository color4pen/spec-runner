# Tasks: gh CLI 依存を GitHub REST API 直叩きに置き換える

## T-01: GitHubClient port に PR 操作メソッドを追加する

対象: `src/core/port/github-client.ts`

- [x] `listPullRequests(owner, repo, head, base)` を追加
  - 戻り値: `Promise<Array<{ url: string; number: number; state: string }>>`
  - `state` は内部表現 (`"OPEN"` / `"MERGED"` / `"CLOSED"`)
  - 実装は常に `state=all` で API を呼ぶ（呼び出し元は state によるフィルタが必要なら結果を自前でフィルタする）
- [x] `createPullRequest(owner, repo, head, base, title, body)` を追加
  - 戻り値: `Promise<{ url: string; number: number }>`
- [x] `getPullRequest(owner, repo, prNumber)` を追加
  - 戻り値: `Promise<{ state: string; mergeStateStatus?: string; headRefName?: string; mergeable?: string }>`
  - = `PrViewData` 互換 + `mergeable` field
- [x] `mergePullRequest(owner, repo, prNumber, opts: { mergeMethod: "squash" })` を追加
  - 戻り値: `Promise<{ merged: boolean; message: string }>`

受け入れ基準:
- `bun run typecheck` が green (実装は T-02)

## T-02: GitHubApiClient に retry/rate-limit middleware + PR メソッドを実装する

対象: `src/adapter/github/github-client.ts`

### T-02a: shared `request()` method の追加

- [x] class 定数 `API_VERSION = "2022-11-28"` を定義
- [x] private `request(url, init)` method を追加:
  - `Authorization: token ${this.token}` header
  - `Accept: application/vnd.github.v3+json` header
  - `X-GitHub-Api-Version: ${API_VERSION}` header
  - 401 → `githubTokenExpiredError()` throw (retry なし)
  - 429 → `min(Retry-After, 60)` 秒 wait → retry
  - `X-RateLimit-Remaining: 0` → `min(X-RateLimit-Reset - now, 300)` 秒 wait → retry
  - 5xx / network error → exponential backoff (base=1s, factor=2, jitter, max 3 retries)
  - 上記以外 → response をそのまま返す
- [x] constructor に optional `sleepFn?: (ms: number) => Promise<void>` を追加 (テスト injection 用)

### T-02b: 既存メソッドを `request()` 経由にリファクタリング

- [x] `verifyBranch()` → `this.request()` 経由に変更
- [x] `getRawFile()` → `this.request()` 経由に変更 (Accept header は raw 用に override)
  - **注意**: `getRawFile()` は 404 で独自 retry している。`request()` の 5xx retry と組み合わせると retry logic が二重になるため、`getRawFile()` の 404 独自 retry は維持し、5xx retry は `request()` に委譲する
- [x] `verifyTokenScopes()` → `this.request()` 経由に変更
  - **注意**: 現在 AbortController で 5 秒 timeout を張っている。`request()` 経由に変更後も `AbortController` timeout は呼び出し元が引き続き保持し、`request()` の init に `signal` として渡すこと
- [x] `getRefSha()` → `this.request()` 経由に変更
- [x] `verifyPath()` → `this.request()` 経由に変更

**挙動変化の明示**: 上記メソッドは現在 5xx で即 throw するが、`request()` 経由後は最大 3 回 exponential backoff retry が追加される。既存テストは retry なしの動作を前提にしている可能性があるため、テスト mock が 5xx を返す場合は retry exhausted まで 5xx を返し続けるか、1 回目で成功/失敗させるかを意識してテストを更新すること

### T-02c: PR 操作メソッドの実装

- [x] `listPullRequests()` 実装
  - `GET /repos/{owner}/{repo}/pulls?head={owner}:{head}&base={base}&state=all`
  - response の `state` + `merged_at` → 内部 state mapping (D2)
- [x] `createPullRequest()` 実装
  - `POST /repos/{owner}/{repo}/pulls` body: `{ title, body, head, base }`
  - response の `html_url`, `number` を返す
- [x] `getPullRequest()` 実装
  - `GET /repos/{owner}/{repo}/pulls/{pull_number}`
  - field mapping (D2): `mergeable_state` → `mergeStateStatus`, `head.ref` → `headRefName`, `mergeable` bool → string, `state` + `merged` → 内部 state
- [x] `mergePullRequest()` 実装
  - `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` body: `{ merge_method: "squash" }`
  - 200 → `{ merged: true, message }`, 405/409 → `{ merged: false, message }`
  - 403 → `{ merged: false, message: "Merge failed: permission denied. Check admin token or repository merge policy." }`

受け入れ基準:
- `bun run typecheck` が green
- 既存の `verifyBranch` 等のテストが引き続き green (retry middleware 追加でも破壊しない)

## T-03: `pr-create/runner.ts` を REST API 化する

対象: `src/core/pr-create/runner.ts`

- [x] `PrCreateInput` に `githubClient: GitHubClient`, `owner: string`, `repo: string` を追加
- [x] `githubToken` field を削除 (GitHubClient 経由で不要)
- [x] `listPrs()` 内部関数を `githubClient.listPullRequests()` 呼び出しに置換（`state` パラメータなし。全状態を取得して caller でフィルタ）
- [x] `createPr()` 内部関数を `githubClient.createPullRequest()` 呼び出しに置換
  - temp file 作成・削除ロジックを除去
  - URL regex extraction を除去 (response body から直接取得)
- [x] `spawnCommand` import を除去
- [x] `buildGhFailureMessage()` の auth hint を `specrunner login` のみに簡素化 (`gh auth login` 言及を除去)

受け入れ基準:
- `bun run typecheck` が green

## T-04: `finish/pr-status.ts` を REST API 化する

対象: `src/core/finish/pr-status.ts`

- [x] `fetchPrViewWithRetry()` の params に `githubClient: GitHubClient`, `owner: string`, `repo: string` を追加
  - `spawn` / `env` パラメータを除去
  - `spawn("gh", ["pr", "view", ...])` → `githubClient.getPullRequest(owner, repo, prNumber)` に置換
  - JSON parse を除去 (GitHubClient が型付きオブジェクトを返す)
  - error handling: GitHubClient の throw を catch して escalation 生成
- [x] `checkMergeableForMerge()` の params を同様に変更
  - `spawn` → `githubClient.getPullRequest()` + `mergeable` field を使用
- [x] `pollMergeStateAfterPush()` の params を同様に変更
  - `spawn` → `githubClient.getPullRequest()` + `mergeStateStatus` field を使用
- [x] `SpawnFn` import を除去

受け入れ基準:
- `bun run typecheck` が green

## T-05: `finish/orchestrator.ts` を REST API 化する

対象: `src/core/finish/orchestrator.ts`

- [x] `FinishInput` に `githubClient: GitHubClient`, `owner: string`, `repo: string` を追加
- [x] `githubToken` field を削除
- [x] `ghEnv` 変数の生成ロジックを除去
- [x] `mergeFeaturePrPhase3()` 内の `spawnOrEscalate({ cmd: "gh", args: ["pr", "merge", ...] })` を `githubClient.mergePullRequest()` 呼び出しに置換
  - `--admin` flag ロジック: REST API では不要 (D4)。merge 試行 → 405 返却時に escalation
  - `--squash` → `{ merge_method: "squash" }`
- [x] `resolveTarget()` への `ghEnv` 伝播を `githubClient` + `owner` + `repo` に変更
- [x] `fetchPrViewWithRetry()` / `pollMergeStateAfterPush()` / `checkMergeableForMerge()` 呼び出しの引数を T-04 の新 signature に合わせる
- [x] dry-run plan の `merge-strategy` を `"REST API squash merge"` に更新

受け入れ基準:
- `bun run typecheck` が green

## T-06: `finish/resolve-target.ts` を REST API 化する

対象: `src/core/finish/resolve-target.ts`

- [x] `ResolveTargetInput` に `githubClient?: GitHubClient`, `owner?: string`, `repo?: string` を追加
  - `spawn` / `env` パラメータを `--pr` 解決にのみ使っていたが、`githubClient` に置換
- [x] `resolveByPrNumber()` 内の `spawn("gh", ["pr", "view", ..., "--json", "headRefName"])` を `githubClient.getPullRequest(owner, repo, prNumber)` に置換
  - response の `headRefName` field を使用
- [x] error message から `gh` 言及を除去 (`Ensure 'gh' is authenticated` → `Run 'specrunner login'`)

受け入れ基準:
- `bun run typecheck` が green

## T-07: `finish/preflight.ts` の `checkBinaries` から `gh` を除外する

対象: `src/core/finish/preflight.ts`

- [x] L74 付近: `checkBinaries(["gh", "git"], spawn, cwd)` → `checkBinaries(["git"], spawn, cwd)`
- [x] `fetchPrViewWithRetry()` 呼び出しの引数を T-04 の新 signature に合わせる
  - `PreflightInput` に `githubClient`, `owner`, `repo` を追加
  - `env` パラメータの gh 用途を除去

受け入れ基準:
- `bun run typecheck` が green

## T-08: `finish/orchestrator.ts` の `preflight` / `resolve-target` 呼び出しを結線する

対象: `src/core/finish/orchestrator.ts`

- [x] `runPreflight()` 呼び出しに `githubClient`, `owner`, `repo` を渡す
- [x] `resolveTarget()` 呼び出しに `githubClient`, `owner`, `repo` を渡す
- [x] `pollMergeStateAfterPush()` 呼び出しに `githubClient`, `owner`, `repo` を渡す

受け入れ基準:
- orchestrator 内の全 gh CLI 呼び出しが除去されている
- `bun run typecheck` が green

## T-09: CLI entry point を更新する

### T-09a: `src/cli/finish.ts`

- [x] `getOriginInfo(cwd)` で `owner` / `repo` を解決
- [x] `createGitHubClient(fetch, githubToken)` で `GitHubClient` を生成
- [x] `runFinishOrchestrator()` に `githubClient`, `owner`, `repo` を渡す
- [x] `resolveGitHubToken` の fallback message から `gh auth login` 言及を除去
- [x] token 解決失敗時: `gh CLI auth` fallback ではなくエラー終了に変更 (token 必須)

### T-09b: `src/core/step/pr-create.ts` (PrCreateStep)

- [x] `StepDeps` に `githubClient`, `owner`, `repo` がある前提で `runPrCreate()` に渡す
- [x] `githubToken` の直接渡しを除去

### T-09c: `src/cli/run.ts` (or step executor entry)

- [x] `StepDeps` に `githubClient`, `owner`, `repo` を注入する箇所を確認・更新

受け入れ基準:
- `bun run typecheck` が green

## T-10: doctor の `gh-cli` check を削除する

対象: `src/core/doctor/checks/runtime/gh-cli.ts`, `src/core/doctor/checks/index.ts`

- [x] `src/core/doctor/checks/runtime/gh-cli.ts` ファイルを削除
- [x] `src/core/doctor/checks/index.ts` から `ghCliPresentCheck` の import と配列登録を除去

受け入れ基準:
- `specrunner doctor` が `gh` check なしで動作する
- `bun run typecheck` が green

## T-11: テストを REST API mock に移行する

### T-11a: `tests/unit/core/pr-create/runner.test.ts`

- [x] spawn mock → `GitHubClient` mock に全面置換
  - `listPullRequests()` / `createPullRequest()` の mock
- [x] TC-001 ~ TC-007 を REST API mock で再実装
- [x] temp file 関連の assertion を除去

### T-11b: `tests/finish-orchestrator.test.ts`

- [x] spawn の gh 系 routing を `GitHubClient` mock に置換
  - `getPullRequest()` / `mergePullRequest()` の mock
- [x] `ghEnv` 関連の assertion を除去
- [x] TC-101, TC-103, TC-106, TC-122-126 を REST API mock で再実装

### T-11c: 他の finish テスト

- [x] `tests/finish-adversarial.test.ts` — gh spawn mock → GitHubClient mock
- [x] `tests/finish-escalation.test.ts` — gh spawn mock → GitHubClient mock
- [x] `tests/finish-resolve-target.test.ts` — gh spawn mock → GitHubClient mock (--pr 解決)
- [x] その他 finish テストで gh spawn を mock している箇所を洗い出して置換

### T-11d: retry / rate-limit の unit test を新設

- [x] `tests/unit/adapter/github/github-client.test.ts` (新規 or 既存拡張)
  - 5xx → exponential backoff → 成功のテスト
  - 429 → Retry-After respect のテスト
  - X-RateLimit-Remaining: 0 → reset wait のテスト
  - network error → retry のテスト
  - 3 回 retry exhausted → throw のテスト

### T-11e: field mapping の unit test

- [x] `getPullRequest()` の response mapping テスト
  - `merged: true` → `state: "MERGED"`
  - `state: "open"` → `state: "OPEN"`
  - `mergeable: null` → `mergeable: "UNKNOWN"`
  - `mergeable_state: "clean"` → `mergeStateStatus: "CLEAN"`
  - `head.ref` → `headRefName`

受け入れ基準:
- `bun run test` が全件 green

## T-12: `createGitHubClient` factory の signature 更新

対象: `src/adapter/github/github-client.ts`

- [x] `createGitHubClient(fetchFn, token, opts?)` に optional `sleepFn` を渡せるようにする
- [x] 既存の呼び出し元 (`src/cli/bootstrap.ts`, `src/cli/run.ts`, `src/cli/doctor.ts`) が壊れないことを確認

受け入れ基準:
- `bun run typecheck` が green

## T-13: ADR を作成する

対象: `specrunner/adr/2026-05-19-gh-cli-to-rest-api.md` (新規)

- [x] design.md の D1-D8 の判断を ADR フォーマットで記録
  - D1: 既存 GitHubClient port 拡張 (vs 独立 client)
  - D2: field 名 mapping を adapter 境界で吸収
  - D3: retry/rate-limit middleware の集約
  - D4: `--admin` 等価の REST API 挙動差異
  - D5: X-GitHub-Api-Version header 管理
  - Status: Accepted

受け入れ基準:
- ADR ファイルが存在する

## T-14: 最終検証

- [x] `bun run typecheck` が green
- [x] `bun run test` が green
- [x] `gh` の文字列が src/ 配下のプロダクションコードに残っていないことを grep で確認
  - 除外対象: テストファイル内のコメント、git 操作 (`git push` 等)、ドキュメント
- [x] `package.json` に `gh` 前提の記述がないことを確認

受け入れ基準:
- 全 AC を満たす
