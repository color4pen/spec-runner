# gh CLI 依存を脱却し PR 操作を GitHub REST API 直叩きに置き換える

## Meta

- **type**: spec-change
- **slug**: gh-cli-to-rest-api
- **base-branch**: main
- **adr**: true

## 背景

spec-runner は現状 `gh` CLI バイナリを必須依存としている:

| ファイル | 用途 |
|---|---|
| `src/core/pr-create/runner.ts` | `gh pr create` / `gh pr list` |
| `src/core/finish/pr-status.ts` | `gh pr view --json mergeable` |
| `src/core/finish/orchestrator.ts` | `gh pr merge` |
| `src/core/finish/resolve-target.ts` (L111-116 周辺) | `gh pr view {prNumber} --json headRefName` (= `--pr <num>` 逆引き) |
| `src/core/finish/preflight.ts` (L74 周辺) | `checkBinaries(["gh", "git"], ...)` |
| `src/core/doctor/checks/runtime/gh-cli.ts` | `gh --version` の存在 check |

既存の REST API 基盤:
- `src/adapter/github/github-client.ts` (= `GitHubApiClient` 実装)
- `src/core/port/github-client.ts` (= port interface)
- → 本 request の PR 操作はこの既存 client を拡張するか、独立 client を新設するかを design 段で決定する

これらを GitHub REST API 直叩きに置き換えれば、`gh` バイナリの install 前提が消える。

PR #248 (= `config から GitHub secret を排除し specrunner login を統一 auth 入口にする`) で auth chain が `specrunner login` に統一済 = 本 request の前提条件は充足。

## メリット

- install surface 縮小 (= `gh` 不要、spec-runner だけで完結)
- subprocess spawn コスト削減
- error handling / output parsing が型安全に集約できる
- managed runtime 環境での実行で `gh` install を要求しない

## デメリット (= 自前実装する必要)

- `gh` CLI が肩代わりしていた retry / rate limit / auth refresh 処理
- GitHub API の挙動変化に対する追従責任
- REST API version 管理 (= `X-GitHub-Api-Version` header)
- **`gh pr merge --admin` の REST 等価**: REST API `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` には `--admin` 相当の明示的パラメータが存在しない。required status check の bypass は admin 権限 token で暗黙的に行われる挙動になる (= `gh` の `--admin` flag と挙動的に異なるので AC で覆う)
- **field 名の対応**: `gh pr view --json mergeStateStatus` (= GraphQL 経由、camelCase) は REST API では `mergeable_state` (= snake_case、小文字値) として返る。`pr-status.ts` / `orchestrator.ts` が `mergeStateStatus` を前提に作られているため、`mergeStateStatus` → `mergeable_state` の field 名 mapping を実装する必要がある

## 要件

1. **GitHub REST API client の整備**:
   - 既存の `src/core/github-*` または `src/git/` 配下に集約 (= 配置は design 段で決定)
   - PR 操作 4 種を REST API 経由で実装: create / list / view / merge
   - rate limit (= `X-RateLimit-Remaining` / `Retry-After`) を respect
   - 5xx / network error に対する exponential backoff retry (= 最大 3 回)
2. **置換対象 5 ファイルの REST API 化**:
   - `src/core/pr-create/runner.ts`: `gh pr create` → `POST /repos/{owner}/{repo}/pulls`
   - `src/core/finish/pr-status.ts`: `gh pr view --json mergeable mergeStateStatus` → `GET /repos/{owner}/{repo}/pulls/{pull_number}` (= `mergeStateStatus` → `mergeable_state` の field 名 mapping を実装)
   - `src/core/finish/orchestrator.ts`: `gh pr merge` → `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` (= `--admin` 相当は admin token の暗黙 bypass に置換、AC で覆う)
   - `src/core/finish/resolve-target.ts` (L111-116 周辺): `gh pr view {prNumber} --json headRefName` (= `--pr <num>` 逆引き) → `GET /repos/{owner}/{repo}/pulls/{pull_number}` (= response body の `head.ref` field を取得)
   - `src/core/finish/preflight.ts` (L74 周辺): `checkBinaries(["gh", "git"], ...)` → `checkBinaries(["git"], ...)` (= `gh` を除外)
3. **doctor check の更新**:
   - `src/core/doctor/checks/runtime/gh-cli.ts` を削除 (= `gh` バイナリは前提条件から外れる)
4. **package.json / ドキュメント更新**:
   - `gh` 前提の install 手順記述があれば削除する
5. **既存テストの green 維持**:
   - 既存 `tests/finish-*.test.ts` / `tests/cli.test.ts` / pr-create 関連 test で REST API mock に差し替え (= subprocess mock からの置換)
6. `bun run typecheck && bun run test` が green

## スコープ外

- **auth 周りの変更** (= PR #248 で完成済の `specrunner login` chain を使用、新規 auth flow は導入しない)
- **issue / repo operation の REST API 化** (= PR 操作のみ、issue 系は別 issue)
- **GitHub GraphQL API への切替** (= REST のみで完結、GraphQL は別議論)
- **multi-provider 化** (= GitLab / Bitbucket 等、別 issue #246)
- **既存の SSE / polling 経路** (= managed runtime の session API、別系統で本 request の対象外)

## 受け入れ基準

- [ ] `gh` CLI 依存が `package.json` / README の前提から外れている
- [ ] doctor の `gh` バイナリ check が削除されている
- [ ] `src/core/finish/preflight.ts` の `checkBinaries` から `gh` が除外され `["git"]` のみになっている
- [ ] PR create / list / view (= `--pr <num>` 逆引き含む) / merge の操作が REST API 経由で動作する (= integration test)
- [ ] `mergeStateStatus` → `mergeable_state` の field 名 mapping が `pr-status.ts` / `orchestrator.ts` で実装されており、既存ロジックが動作する (= unit test)
- [ ] `gh pr merge --admin` 等価の挙動が admin token 経由で REST API でも成立する (= integration test、admin 権限なしでも保護されていないブランチでは merge 成功する)
- [ ] 5xx / network error に対する exponential backoff retry が動作する (= unit test)
- [ ] rate limit (= `X-RateLimit-Remaining` / `Retry-After`) を respect する (= unit test)
- [ ] `X-GitHub-Api-Version` header が付与されている
- [ ] 既存 `tests/finish-*.test.ts` 等が REST API mock で green になる
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に「REST API client の配置 (= 既存 `GitHubApiClient` 拡張 vs 独立 client) / retry policy / version 管理 / field 名 mapping 方針」の判断が記録されている

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
