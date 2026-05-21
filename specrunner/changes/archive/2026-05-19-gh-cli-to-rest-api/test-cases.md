# Test Cases: gh CLI 依存を GitHub REST API 直叩きに置き換える

## Summary

| Category | must | should | could | Total |
|---|---|---|---|---|
| REST_CLIENT | 8 | 3 | 2 | 13 |
| FIELD_MAPPING | 5 | 3 | 0 | 8 |
| PR_CREATE | 3 | 2 | 1 | 6 |
| PR_STATUS | 3 | 2 | 0 | 5 |
| PR_MERGE | 4 | 2 | 1 | 7 |
| RESOLVE_TARGET | 2 | 1 | 0 | 3 |
| PREFLIGHT | 2 | 0 | 0 | 2 |
| DOCTOR | 1 | 1 | 0 | 2 |
| REGRESSION | 3 | 2 | 0 | 5 |
| INTEGRATION | 2 | 1 | 0 | 3 |
| **Total** | **33** | **17** | **4** | **54** |

---

## Category: REST_CLIENT — REST API client コア HTTP 挙動

### TC-RC-001
- **Priority**: must
- **Source**: AC (`X-GitHub-Api-Version` header が付与されている), T-02a, D5
- **Title**: 全リクエストに `X-GitHub-Api-Version` ヘッダーが付与される

GIVEN `GitHubApiClient` が生成されており  
AND `API_VERSION = "2022-11-28"` が class 定数として定義されている  
WHEN 任意の API メソッド (`listPullRequests` 等) を呼び出す  
THEN リクエストヘッダーに `X-GitHub-Api-Version: 2022-11-28` が含まれる

---

### TC-RC-002
- **Priority**: must
- **Source**: T-02a, REQ (auth chain は specrunner login)
- **Title**: 全リクエストに `Authorization: token {token}` ヘッダーが付与される

GIVEN `GitHubApiClient` が token `ghp_test123` で生成されている  
WHEN 任意の API メソッドを呼び出す  
THEN リクエストヘッダーに `Authorization: token ghp_test123` が含まれる  
AND `Accept: application/vnd.github.v3+json` が含まれる

---

### TC-RC-003
- **Priority**: must
- **Source**: AC (rate limit を respect する), T-02a, D3
- **Title**: 401 レスポンス時は retry せず即座に `githubTokenExpiredError` を throw する

GIVEN fetch モックが `401 Unauthorized` を返す  
WHEN 任意の API メソッドを呼び出す  
THEN `githubTokenExpiredError()` が throw される  
AND リクエストは 1 回のみ試行される (retry なし)

---

### TC-RC-004
- **Priority**: must
- **Source**: AC (rate limit を respect する), T-02a, D3
- **Title**: 429 レスポンス時は `Retry-After` 秒 wait して retry する

GIVEN fetch モックが 1 回目 `429` + `Retry-After: 5` ヘッダーを返し  
AND 2 回目は `200` を返す  
AND `sleepFn` がモック注入されている  
WHEN API メソッドを呼び出す  
THEN `sleepFn` が `5000ms` (5秒) で呼ばれる  
AND 最終的に 200 のレスポンスが返る

---

### TC-RC-005
- **Priority**: must
- **Source**: AC (rate limit を respect する), T-02a, D3
- **Title**: `Retry-After` が 60 秒を超える場合は 60 秒に cap される

GIVEN fetch モックが `429` + `Retry-After: 120` を返す  
AND `sleepFn` がモック注入されている  
WHEN API メソッドを呼び出す  
THEN `sleepFn` が `60000ms` で呼ばれる (120 秒ではなく 60 秒 cap)

---

### TC-RC-006
- **Priority**: must
- **Source**: AC (rate limit を respect する), T-02a, D3
- **Title**: `X-RateLimit-Remaining: 0` 時は `X-RateLimit-Reset` まで wait して retry する

GIVEN fetch モックが `200` だが `X-RateLimit-Remaining: 0` と `X-RateLimit-Reset: {now+30s}` を返す  
AND `sleepFn` がモック注入されている  
WHEN API メソッドを呼び出す  
THEN `sleepFn` が約 30 秒 (±1s) で呼ばれる  
AND wait が 300 秒を超えない (max cap)

---

### TC-RC-007
- **Priority**: must
- **Source**: AC (5xx / network error に対する exponential backoff retry), T-02a, D3
- **Title**: 5xx レスポンス時は最大 3 回 exponential backoff retry して成功する

GIVEN fetch モックが 1 回目 `500`, 2 回目 `503`, 3 回目 `200` を返す  
AND `sleepFn` がモック注入されている  
WHEN API メソッドを呼び出す  
THEN 合計 3 回リクエストが試行される  
AND 2 回目 retry の sleep が 1 回目の 2 倍程度になる (exponential backoff)  
AND 最終的に 200 のレスポンスが返る

---

### TC-RC-008
- **Priority**: must
- **Source**: AC (5xx / network error に対する exponential backoff retry), T-02a, D3
- **Title**: 3 回 retry を使い切った場合は error を throw する

GIVEN fetch モックが 4 回とも `500` を返す  
WHEN API メソッドを呼び出す  
THEN エラーが throw される  
AND リクエストは合計 4 回 (初回 + 3 retry) 試行される

---

### TC-RC-009
- **Priority**: should
- **Source**: T-02a, D3
- **Title**: network error (fetch reject) 時も exponential backoff retry が動作する

GIVEN fetch モックが 1 回目 `TypeError: fetch failed` で reject し  
AND 2 回目は `200` を返す  
WHEN API メソッドを呼び出す  
THEN retry が実行され最終的に成功する

---

### TC-RC-010
- **Priority**: should
- **Source**: T-02a, D3
- **Title**: `sleepFn` を constructor に注入できる

GIVEN `sleepFn` を外部から注入した `GitHubApiClient` を生成する  
WHEN retry が発生する状況で API メソッドを呼び出す  
THEN 注入した `sleepFn` が呼ばれる (デフォルト sleep ではなく)

---

### TC-RC-011
- **Priority**: should
- **Source**: T-02a, D3
- **Title**: `X-RateLimit-Reset` の wait が 300 秒を超える場合は 300 秒に cap される

GIVEN fetch モックが `X-RateLimit-Remaining: 0` と `X-RateLimit-Reset: {now+600s}` を返す  
WHEN API メソッドを呼び出す  
THEN `sleepFn` が `300000ms` で呼ばれる (600 秒ではなく 300 秒 cap)

---

### TC-RC-012
- **Priority**: could
- **Source**: T-02a
- **Title**: 4xx (401 以外) レスポンスは retry せずそのまま返す

GIVEN fetch モックが `422 Unprocessable Entity` を返す  
WHEN API メソッドを呼び出す  
THEN リクエストは 1 回のみ試行される  
AND 422 レスポンスがそのまま返る (retry なし)

---

### TC-RC-013
- **Priority**: could
- **Source**: T-02a, D3
- **Title**: jitter により連続 retry の sleep 時間がわずかにばらつく

GIVEN fetch モックが 3 回 `500` を返す  
AND `sleepFn` がモック注入されている  
WHEN API メソッドを 2 回独立して呼び出す  
THEN 2 回の実行で retry 間の sleep 時間が完全に同一ではない (jitter あり)

---

## Category: FIELD_MAPPING — Response field 名 mapping

### TC-FM-001
- **Priority**: must
- **Source**: AC (`mergeStateStatus` → `mergeable_state` の field 名 mapping), T-02c, D2
- **Title**: `mergeable_state: "clean"` → `mergeStateStatus: "CLEAN"` に変換される

GIVEN REST API が `mergeable_state: "clean"` を含む PR レスポンスを返す  
WHEN `getPullRequest()` を呼び出す  
THEN 戻り値の `mergeStateStatus` が `"CLEAN"` (大文字) になる

---

### TC-FM-002
- **Priority**: must
- **Source**: AC (`mergeStateStatus` → `mergeable_state` の field 名 mapping), T-02c, D2
- **Title**: `mergeable_state: "blocked"` → `mergeStateStatus: "BLOCKED"` に変換される

GIVEN REST API が `mergeable_state: "blocked"` を含む PR レスポンスを返す  
WHEN `getPullRequest()` を呼び出す  
THEN 戻り値の `mergeStateStatus` が `"BLOCKED"` になる

---

### TC-FM-003
- **Priority**: must
- **Source**: T-02c, D2 (state mapping)
- **Title**: `merged: true` → `state: "MERGED"` に変換される

GIVEN REST API が `state: "closed"` + `merged_at: "2024-01-01T00:00:00Z"` を含む PR レスポンスを返す  
WHEN `getPullRequest()` を呼び出す  
THEN 戻り値の `state` が `"MERGED"` になる

---

### TC-FM-004
- **Priority**: must
- **Source**: T-02c, D2 (state mapping)
- **Title**: `state: "open"` → `state: "OPEN"` に変換される

GIVEN REST API が `state: "open"` + `merged_at: null` を含む PR レスポンスを返す  
WHEN `getPullRequest()` を呼び出す  
THEN 戻り値の `state` が `"OPEN"` になる

---

### TC-FM-005
- **Priority**: must
- **Source**: T-11e, D2 (mergeable mapping)
- **Title**: `mergeable: null` → `mergeable: "UNKNOWN"` に変換される

GIVEN REST API が `mergeable: null` を含む PR レスポンスを返す  
WHEN `getPullRequest()` を呼び出す  
THEN 戻り値の `mergeable` が `"UNKNOWN"` になる

---

### TC-FM-006
- **Priority**: should
- **Source**: T-11e, D2 (mergeable mapping)
- **Title**: `mergeable: true` → `mergeable: "MERGEABLE"` に変換される

GIVEN REST API が `mergeable: true` を含む PR レスポンスを返す  
WHEN `getPullRequest()` を呼び出す  
THEN 戻り値の `mergeable` が `"MERGEABLE"` になる

---

### TC-FM-007
- **Priority**: should
- **Source**: T-11e, D2 (mergeable mapping)
- **Title**: `mergeable: false` → `mergeable: "CONFLICTING"` に変換される

GIVEN REST API が `mergeable: false` を含む PR レスポンスを返す  
WHEN `getPullRequest()` を呼び出す  
THEN 戻り値の `mergeable` が `"CONFLICTING"` になる

---

### TC-FM-008
- **Priority**: should
- **Source**: T-11e, D2 (headRefName mapping)
- **Title**: `head.ref` → `headRefName` に変換される

GIVEN REST API が `head: { ref: "feature/my-branch" }` を含む PR レスポンスを返す  
WHEN `getPullRequest()` を呼び出す  
THEN 戻り値の `headRefName` が `"feature/my-branch"` になる

---

## Category: PR_CREATE — PR 作成操作

### TC-PC-001
- **Priority**: must
- **Source**: AC (PR create / list / view / merge の操作が REST API 経由で動作する), T-03, T-02c
- **Title**: 新規 PR を REST API 経由で作成できる

GIVEN `GitHubClient` モックが `listPullRequests` で空配列を返す  
AND `createPullRequest` で `{ url: "https://github.com/owner/repo/pull/1", number: 1 }` を返す  
WHEN `runPrCreate()` を `PrCreateInput` + `githubClient` + `owner` + `repo` で呼び出す  
THEN `createPullRequest(owner, repo, head, base, title, body)` が呼ばれる  
AND 返り値に PR URL が含まれる  
AND `spawnCommand("gh", ...)` は呼ばれない

---

### TC-PC-002
- **Priority**: must
- **Source**: T-03 (重複 PR 検出)
- **Title**: 同じ head/base の PR が既に存在する場合は create せず既存 URL を返す

GIVEN `listPullRequests` が既存の open PR `{ url: "https://...", number: 1, state: "OPEN" }` を返す  
WHEN `runPrCreate()` を呼び出す  
THEN `createPullRequest` は呼ばれない  
AND 既存 PR の URL が返される

---

### TC-PC-003
- **Priority**: must
- **Source**: T-03 (githubToken field 削除)
- **Title**: `PrCreateInput` に `githubToken` field が不要になっている

GIVEN `PrCreateInput` の型定義  
WHEN 型チェックを実行する  
THEN `PrCreateInput` に `githubToken` field が存在しない  
AND `githubClient: GitHubClient`, `owner: string`, `repo: string` が存在する

---

### TC-PC-004
- **Priority**: should
- **Source**: T-03 (temp file ロジック除去)
- **Title**: PR 作成時に一時ファイルが生成されない

GIVEN `GitHubClient` モックが正常なレスポンスを返す  
WHEN `runPrCreate()` を呼び出す  
THEN ファイルシステムへの temp file 書き出しが行われない

---

### TC-PC-005
- **Priority**: should
- **Source**: T-03 (auth hint の更新)
- **Title**: PR 作成失敗時のエラーメッセージに `gh auth login` が含まれない

GIVEN `createPullRequest` が `githubTokenExpiredError` を throw する  
WHEN `runPrCreate()` を呼び出す  
THEN エラーメッセージに `specrunner login` が含まれる  
AND `gh auth login` は含まれない

---

### TC-PC-006
- **Priority**: could
- **Source**: T-02c, REQ
- **Title**: `listPullRequests` は `state=all` で全状態の PR を取得する

GIVEN `listPullRequests` の実装  
WHEN 呼び出す  
THEN API リクエスト URL に `state=all` パラメータが含まれる

---

## Category: PR_STATUS — PR ステータス取得・ポーリング

### TC-PS-001
- **Priority**: must
- **Source**: AC (`mergeStateStatus` mapping が実装されており既存ロジックが動作する), T-04
- **Title**: `fetchPrViewWithRetry` が `githubClient.getPullRequest()` を使用する

GIVEN `githubClient.getPullRequest` が `mergeStateStatus: "CLEAN"` を含むデータを返す  
WHEN `fetchPrViewWithRetry(prNumber, { githubClient, owner, repo })` を呼び出す  
THEN `spawn("gh", ...)` は呼ばれない  
AND `gitHubClient.getPullRequest(owner, repo, prNumber)` が呼ばれる  
AND 返り値に `mergeStateStatus: "CLEAN"` が含まれる

---

### TC-PS-002
- **Priority**: must
- **Source**: AC (mergeable UNKNOWN retry loop), T-04, D2 (Risk 1)
- **Title**: `mergeable: "UNKNOWN"` の場合は retry ループが継続する

GIVEN `getPullRequest` が 1 回目 `{ mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" }` を返し  
AND 2 回目 `{ mergeable: "MERGEABLE", mergeStateStatus: "CLEAN" }` を返す  
WHEN `checkMergeableForMerge(prNumber, { githubClient, owner, repo })` を呼び出す  
THEN 2 回 `getPullRequest` が呼ばれる  
AND 最終的に `MERGEABLE` が返る

---

### TC-PS-003
- **Priority**: must
- **Source**: T-04, existing logic
- **Title**: `pollMergeStateAfterPush` が `mergeStateStatus` field を使用して BLOCKED を検出する

GIVEN `getPullRequest` が `mergeStateStatus: "BLOCKED"` を返す  
WHEN `pollMergeStateAfterPush(prNumber, { githubClient, owner, repo })` を呼び出す  
THEN BLOCKED 状態として検出され escalation が生成される

---

### TC-PS-004
- **Priority**: should
- **Source**: T-04 (SpawnFn import 除去)
- **Title**: `pr-status.ts` に `SpawnFn` の import が残っていない

GIVEN `src/core/finish/pr-status.ts` のソースコード  
WHEN 型チェックを実行する  
THEN `SpawnFn` の import が存在しない  
AND `bun run typecheck` が green

---

### TC-PS-005
- **Priority**: should
- **Source**: T-04, error handling
- **Title**: `getPullRequest` が throw した場合に escalation が生成される

GIVEN `getPullRequest` が `githubTokenExpiredError` を throw する  
WHEN `fetchPrViewWithRetry` を呼び出す  
THEN エラーが catch されて escalation オブジェクトが生成される  
AND `specrunner login` を促すメッセージが含まれる

---

## Category: PR_MERGE — PR マージ操作

### TC-PM-001
- **Priority**: must
- **Source**: AC (PR merge が REST API 経由で動作する), T-05, T-02c
- **Title**: squash merge が REST API 経由で成功する

GIVEN `mergePullRequest` モックが `{ merged: true, message: "Pull Request successfully merged" }` を返す  
WHEN `mergeFeaturePrPhase3()` を squash オプションで呼び出す  
THEN `PUT /repos/{owner}/{repo}/pulls/{prNumber}/merge` が `{ merge_method: "squash" }` で呼ばれる  
AND `spawnOrEscalate({ cmd: "gh", args: ["pr", "merge", ...] })` は呼ばれない

---

### TC-PM-002
- **Priority**: must
- **Source**: T-02c (405 → merged: false), D4
- **Title**: 405 レスポンス時は `{ merged: false }` を返す

GIVEN REST API が `405 Method Not Allowed` を返す  
WHEN `mergePullRequest()` を呼び出す  
THEN `{ merged: false, message: ... }` が返る  
AND エラーが throw されない

---

### TC-PM-003
- **Priority**: must
- **Source**: T-02c (403 → permission denied message), D4
- **Title**: 403 レスポンス時は admin token 要求メッセージを返す

GIVEN REST API が `403 Forbidden` を返す  
WHEN `mergePullRequest()` を呼び出す  
THEN `{ merged: false, message: "Merge failed: permission denied. Check admin token or repository merge policy." }` が返る

---

### TC-PM-004
- **Priority**: must
- **Source**: AC (`gh pr merge --admin` 等価の挙動), D4
- **Title**: 保護されていないブランチで admin 権限なしでも merge が成功する

GIVEN リポジトリのブランチ保護ルールがない  
AND `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` が `200` を返す  
WHEN `mergePullRequest()` を呼び出す  
THEN `{ merged: true }` が返る

---

### TC-PM-005
- **Priority**: should
- **Source**: T-05 (--admin flag ロジック除去)
- **Title**: `orchestrator.ts` に `--admin` flag の分岐が残っていない

GIVEN `src/core/finish/orchestrator.ts` のソースコード  
WHEN grep で `"--admin"` を検索する  
THEN 該当する文字列が存在しない

---

### TC-PM-006
- **Priority**: should
- **Source**: T-02c (409 → merged: false)
- **Title**: 409 レスポンス時は `{ merged: false }` を返す

GIVEN REST API が `409 Conflict` を返す (merge conflict)  
WHEN `mergePullRequest()` を呼び出す  
THEN `{ merged: false, message: ... }` が返る  
AND エラーが throw されない

---

### TC-PM-007
- **Priority**: could
- **Source**: T-05 (dry-run plan 更新)
- **Title**: dry-run plan の merge-strategy が `"REST API squash merge"` になっている

GIVEN `orchestrator.ts` の dry-run モード  
WHEN dry-run plan を生成する  
THEN plan の `merge-strategy` フィールドに `"REST API squash merge"` が含まれる

---

## Category: RESOLVE_TARGET — `--pr` 番号からブランチ解決

### TC-RT-001
- **Priority**: must
- **Source**: AC (PR view `--pr <num>` 逆引き含む), T-06
- **Title**: PR 番号から head ブランチ名を REST API 経由で解決できる

GIVEN `githubClient.getPullRequest(owner, repo, 42)` が `{ headRefName: "feature/my-branch" }` を返す  
WHEN `resolveByPrNumber(42, { githubClient, owner, repo })` を呼び出す  
THEN `"feature/my-branch"` が返る  
AND `spawn("gh", ["pr", "view", ...])` は呼ばれない

---

### TC-RT-002
- **Priority**: must
- **Source**: T-06 (error message 更新)
- **Title**: PR 番号解決失敗時のエラーメッセージに `gh` 言及が含まれない

GIVEN `githubClient.getPullRequest` が error を throw する  
WHEN `resolveByPrNumber` を呼び出す  
THEN エラーメッセージに `"Ensure 'gh' is authenticated"` が含まれない  
AND `"Run 'specrunner login'"` が含まれる

---

### TC-RT-003
- **Priority**: should
- **Source**: T-06 (ResolveTargetInput 型変更)
- **Title**: `ResolveTargetInput` に `githubClient?`, `owner?`, `repo?` が追加されている

GIVEN `src/core/finish/resolve-target.ts` の型定義  
WHEN 型チェックを実行する  
THEN `ResolveTargetInput` に `githubClient?: GitHubClient`, `owner?: string`, `repo?: string` が存在する  
AND `bun run typecheck` が green

---

## Category: PREFLIGHT — preflight バイナリチェック

### TC-PF-001
- **Priority**: must
- **Source**: AC (`checkBinaries` から `gh` が除外され `["git"]` のみ), T-07
- **Title**: `preflight.ts` の `checkBinaries` が `["git"]` のみを確認する

GIVEN `src/core/finish/preflight.ts` の実装  
WHEN `checkBinaries` の呼び出し箇所を確認する  
THEN 引数配列に `"gh"` が含まれない  
AND `["git"]` のみが渡されている

---

### TC-PF-002
- **Priority**: must
- **Source**: T-07 (PreflightInput 更新)
- **Title**: `PreflightInput` に `githubClient`, `owner`, `repo` が追加されている

GIVEN `src/core/finish/preflight.ts` の型定義  
WHEN `bun run typecheck` を実行する  
THEN `PreflightInput` に `githubClient: GitHubClient`, `owner: string`, `repo: string` が存在する  
AND green になる

---

## Category: DOCTOR — doctor check の削除

### TC-DC-001
- **Priority**: must
- **Source**: AC (doctor の `gh` バイナリ check が削除されている), T-10
- **Title**: `gh-cli.ts` ファイルが削除され doctor check 一覧から除外されている

GIVEN `src/core/doctor/checks/index.ts` の実装  
WHEN `specrunner doctor` を実行する  
THEN `gh` バイナリの存在チェックが実行されない  
AND `src/core/doctor/checks/runtime/gh-cli.ts` ファイルが存在しない

---

### TC-DC-002
- **Priority**: should
- **Source**: T-10, AC
- **Title**: doctor の他のチェックは引き続き動作する

GIVEN `gh-cli` check が削除された状態  
WHEN `specrunner doctor` を実行する  
THEN `gh-cli` 以外の check (git, token scope 等) は正常に実行される  
AND `bun run typecheck` が green

---

## Category: REGRESSION — 既存機能の回帰防止

### TC-RG-001
- **Priority**: must
- **Source**: AC (既存 `tests/finish-*.test.ts` 等が REST API mock で green), T-11b
- **Title**: `finish-orchestrator.test.ts` が REST API mock で全件 green になる

GIVEN `GitHubClient` モックに `getPullRequest` / `mergePullRequest` が実装されている  
WHEN `bun run test tests/finish-orchestrator.test.ts` を実行する  
THEN 全テストが green になる  
AND gh spawn mock の呼び出しが残っていない

---

### TC-RG-002
- **Priority**: must
- **Source**: T-11a, AC
- **Title**: `pr-create/runner.test.ts` が REST API mock で全件 green になる

GIVEN `GitHubClient` モックに `listPullRequests` / `createPullRequest` が実装されている  
WHEN `bun run test tests/unit/core/pr-create/runner.test.ts` を実行する  
THEN 全テストが green になる  
AND temp file 関連の assertion が除去されている

---

### TC-RG-003
- **Priority**: must
- **Source**: T-11c, AC
- **Title**: adversarial / escalation / resolve-target テストが REST API mock で green になる

GIVEN `GitHubClient` モックが各テストシナリオに応じた値を返す  
WHEN `bun run test tests/finish-adversarial.test.ts tests/finish-escalation.test.ts tests/finish-resolve-target.test.ts` を実行する  
THEN 全テストが green になる

---

### TC-RG-004
- **Priority**: should
- **Source**: T-02b (既存メソッドの request() 経由リファクタリング), T-11
- **Title**: `verifyBranch` / `getRawFile` / `verifyTokenScopes` の既存テストが引き続き green になる

GIVEN 既存の `GitHubApiClient` テストが存在する  
WHEN `bun run test` を実行する  
THEN `verifyBranch` / `getRawFile` / `verifyTokenScopes` / `getRefSha` / `verifyPath` の全テストが green  
AND retry middleware 追加によって既存挙動が破壊されない

---

### TC-RG-005
- **Priority**: should
- **Source**: T-14 (gh 文字列残存確認), AC
- **Title**: production コードに `gh` CLI 依存の記述が残っていない

GIVEN `src/` 配下の production コード (テストファイル・git 操作・ドキュメントは除外)  
WHEN `grep -r '"gh"' src/` および `grep -r "'gh'" src/` を実行する  
THEN `checkBinaries`, `spawnCommand`, `spawn` の引数として `"gh"` が存在しない  
AND `gh auth login` の文字列が存在しない

---

## Category: INTEGRATION — エンドツーエンドシナリオ

### TC-IT-001
- **Priority**: must
- **Source**: AC (PR create / list / view / merge の操作が REST API 経由で動作する)
- **Title**: `specrunner finish` が `gh` なしで PR 作成から merge まで完走する

GIVEN `gh` バイナリが PATH に存在しない環境  
AND `specrunner login` で GitHub token が設定済み  
AND `getOriginInfo` が `{ owner: "test-owner", repo: "test-repo" }` を返す  
AND REST API モックが PR create / getPullRequest / mergePullRequest に正常レスポンスを返す  
WHEN `specrunner finish` を実行する  
THEN PR が作成され merge まで完了する  
AND `gh` バイナリ not found のエラーが発生しない

---

### TC-IT-002
- **Priority**: must
- **Source**: T-09a (CLI entry point 更新), T-14
- **Title**: CLI entry point が `owner/repo` を git remote から解決して各モジュールに伝播する

GIVEN `src/git/remote.ts` の `getOriginInfo(cwd)` が `{ owner: "acme", name: "my-repo" }` を返す  
WHEN `src/cli/finish.ts` が `runFinishOrchestrator()` を呼び出す  
THEN `githubClient`, `owner: "acme"`, `repo: "my-repo"` が `FinishInput` に含まれる  
AND `bun run typecheck` が green

---

### TC-IT-003
- **Priority**: should
- **Source**: T-14 (最終検証), AC
- **Title**: `bun run typecheck && bun run test` が全件 green になる

GIVEN 全タスク (T-01 ~ T-13) が実装完了した状態  
WHEN `bun run typecheck && bun run test` を実行する  
THEN typecheck が 0 エラーで完了する  
AND test が全件 green になる
