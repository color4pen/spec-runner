# Design: gh CLI 依存を GitHub REST API 直叩きに置き換える

## Context

spec-runner は PR 操作 (create / list / view / merge) に `gh` CLI バイナリを subprocess で呼び出している。
既に `src/adapter/github/github-client.ts` (`GitHubApiClient`) が REST API client として存在し、
branch/file/path 検証と token scope 検証を担っている。
auth chain は PR #248 で `specrunner login` に統一済。

本 design は `gh` CLI 依存を全廃し、既存の REST API 基盤を拡張して PR 操作を吸収する方針を定める。

## Goals

- `gh` バイナリの install 前提を完全に除去する
- subprocess spawn を排除し、型安全な REST API 呼び出しに一本化する
- 既存テスト・型チェックを green に維持する

## Non-Goals

- GitHub GraphQL API への切替 (REST のみで完結)
- auth chain の変更 (PR #248 で完成済)
- issue / repo / SSE 等 PR 以外の操作の REST API 化

## Decisions

### D1: 既存 `GitHubClient` port を拡張する (新規 port を作らない)

PR 操作メソッドを既存の `GitHubClient` port interface (`src/core/port/github-client.ts`) に追加し、
`GitHubApiClient` adapter (`src/adapter/github/github-client.ts`) に実装する。

**Why**: 同一の auth token・base URL・error handling pattern (401 → token expired, 5xx → API error) を共有する。
injection point が 1 つで済み、DI graph が単純に保たれる。

**Why not 独立 `GitHubPrClient`**: 消費者が異なる (step executor vs finish command) という SRP の論拠はあるが、
現時点で method 数は合計 9 個程度で interface が肥大化するリスクは低い。
将来 method が 15+ に膨らんだ場合は split を検討する。

### D2: field 名 mapping は adapter 境界で吸収する

REST API の response body を adapter 内部で `PrViewData` 互換の形式に変換する。
core 側の既存コードは `mergeStateStatus` / `headRefName` / `state` (OPEN/MERGED/CLOSED) を
そのまま使い続ける。

mapping ルール:

| 内部名 (GraphQL 由来) | REST API field | 変換 |
|---|---|---|
| `state` = `"OPEN"` / `"MERGED"` / `"CLOSED"` | `state` (`"open"` / `"closed"`) + `merged` (bool) | `merged=true` → `"MERGED"`, `state="open"` → `"OPEN"`, else `"CLOSED"` |
| `mergeStateStatus` = `"CLEAN"` etc. | `mergeable_state` (`"clean"` etc.) | `.toUpperCase()` |
| `headRefName` | `head.ref` | 直接代入 |
| `mergeable` = `"MERGEABLE"` / `"CONFLICTING"` / `"UNKNOWN"` | `mergeable` (`true` / `false` / `null`) | `true` → `"MERGEABLE"`, `false` → `"CONFLICTING"`, `null` → `"UNKNOWN"` |

**Why**: core のロジック (pr-status.ts の retry loop、orchestrator の BLOCKED 判定) は
`mergeStateStatus` の大文字比較で書かれている。adapter 境界で変換すれば core の変更が最小限になる。

### D3: retry / rate-limit middleware を `GitHubApiClient` の private `request()` method に集約する

全 REST API 呼び出しを shared な `request()` method 経由にし、以下を統一的に処理する:

1. **5xx / network error**: exponential backoff (base=1s, factor=2, jitter, max 3 retries)
2. **429 Too Many Requests**: `Retry-After` header の秒数だけ wait して retry
3. **`X-RateLimit-Remaining: 0`**: `X-RateLimit-Reset` epoch まで wait (secondary rate limit 対策)
4. **401**: retry せず即座に `githubTokenExpiredError()` throw

既存メソッド (`verifyBranch`, `getRawFile` 等) も `request()` 経由にリファクタリングして恩恵を受ける。

**Why**: `gh` CLI が内部で担っていた retry/rate-limit を自前で再現する必要がある。
各メソッドに個別実装すると DRY 違反になる。

**Sleep injection**: テスタビリティのため `sleepFn` を constructor option として注入可能にする。

### D4: `--admin` 相当は REST API merge の挙動差異として受容する

`gh pr merge --admin` は GraphQL mutation `mergePullRequest` の admin override を使用する。
REST API `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` には等価パラメータが存在しない。

対応方針:
- admin 権限を持つ token で merge endpoint を呼び出せば、required status check が blocking でも merge が成功する (GitHub の暗黙的挙動)
- 保護されていないブランチでは admin 権限なしでも merge 成功する
- `mergeStateStatus=BLOCKED` + `force=true` の場合: REST merge を試行し、405 が返れば escalation

**Why not GraphQL**: scope を REST のみに限定する (request の明示的 non-goal)。
admin bypass が必要なケースは実運用上 rare (自分のリポジトリでの self-merge が主用途)。

### D5: `X-GitHub-Api-Version` header を全リクエストに付与する

`X-GitHub-Api-Version: 2022-11-28` (現行 stable) を `request()` method 内で自動付与する。
version 値は `GitHubApiClient` の class 定数 `API_VERSION` として定義し、
将来の version 更新を 1 箇所の変更で完結させる。

### D6: owner/repo は CLI entry point で解決し、各 module に注入する

`src/git/remote.ts` の `getOriginInfo(cwd)` が `{ owner, name }` を返す。
これを CLI entry point (`src/cli/finish.ts`, `src/cli/run.ts`) で解決し、
`FinishInput` / `PrCreateInput` / `StepDeps` に `owner` / `repo` を追加して伝播する。

**Why**: `gh` CLI は git remote を内部解決していたが、REST API は explicit に必要。
解決ロジックを entry point に集約すれば、core/adapter は純粋な API 呼び出しに専念できる。

### D7: `pr-create/runner.ts` の signature を `GitHubClient` 依存に変更する

現在の `runPrCreate(input: PrCreateInput)` は内部で `spawnCommand("gh", ...)` を呼ぶ。
これを `PrCreateInput` に `githubClient: GitHubClient` + `owner` + `repo` を追加し、
`GitHubClient.listPullRequests()` + `GitHubClient.createPullRequest()` を呼ぶ形に変更する。

temp file 書き出し + URL regex extraction は不要になる (REST API response body から直接取得)。

### D8: `finish/*` modules の signature に `GitHubClient` を追加する

`FinishInput` に `githubClient: GitHubClient` + `owner` + `repo` を追加する。
`pr-status.ts` / `orchestrator.ts` / `resolve-target.ts` の gh CLI spawn を
`GitHubClient` method 呼び出しに置き換える。

`SpawnFn` は git 操作 (`git push`, `git checkout` 等) には引き続き使用する。

## Risks / Trade-offs

1. **REST `mergeable` の遅延**: GitHub REST API の `mergeable` field は非同期計算される。
   `null` が返る期間がある。既存の UNKNOWN retry loop がそのまま機能するが、
   REST では `null` を `"UNKNOWN"` に mapping する必要がある (D2 で対応済)。

2. **admin merge の挙動差異**: D4 の通り、REST API の admin bypass は暗黙的。
   明示的に `--admin` と宣言できた `gh` CLI と比べ、failure mode が不透明になるリスクがある。
   escalation message で「admin 権限の token が必要」と明示する。

3. **既存テストの大幅書き換え**: spawn mock → GitHubClient mock への移行が必要。
   テスト数は 20+ あり、移行工数はそれなりに大きい。

## Open Questions

(なし — 設計判断は D1-D8 で網羅)
