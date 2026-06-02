# GitHub token 解決を gh CLI の env 契約に整合する

## Meta

- **type**: spec-change
- **slug**: github-token-gh-contract
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

`resolveGitHubToken`（`src/core/credentials/github.ts`）の解決順が現状 `credentials.json → GITHUB_TOKEN env` で、`GH_TOKEN` 非対応・env が stored より後。ecosystem 標準である gh CLI の env 契約と乖離している（CI/ephemeral で env が stored を上書きできない、利用者が export しがちな `GH_TOKEN` を見ない）。

構造判断は `architecture/adr/2026-06-02-github-auth-host-decoupling.md` の D3（credential 解決 seam に subprocess 委譲と host 引数を許容、B-6/B-7 seam 経由）。

## 要件

1. `resolveGitHubToken` の解決順を gh 契約へ: (1) `GH_TOKEN` → `GITHUB_TOKEN`（env、GH_ 接頭辞優先、**env > stored**）、(2) `gh auth token` への委譲、(3) `credentials.json`、(4) guidance 付き error。
2. `gh auth token` の subprocess は B-6 seam（`util/env-filter` の `stripSecrets` 経由 spawn、`spawnCommand`）で実行する。gh 不在 / 未認証 / timeout は best-effort で null として次の source にフォールスルーする（throw しない）。
3. 戻り値の `source` 型に `"gh"` を追加（`"env" | "gh" | "credentials"`）。`src/core/preflight.ts` と `src/cli/doctor.ts` の `githubTokenSource` 型を追従させる。
4. error hint を「`GH_TOKEN` を設定 / `gh auth login` / `specrunner login`」に更新する。
5. `resolveGitHubToken` が target host を受け取れる口を用意する（host↔token 束縛の enforce は別 request `github-host-config`。本 request は引数受け取りまで）。
6. `GH_TOKEN` を `src/util/env-filter.ts` の `SECRET_DENYLIST` に追加する。`GITHUB_TOKEN` と同様、第一級 credential として子プロセス / 外部 SDK へ継承させない（B-6 の credential 封じ込め）。

### 外部制約（gh CLI env 契約）

- env 優先順: `GH_TOKEN` > `GITHUB_TOKEN`。env は stored credential より優先。
- `gh auth token` は gh が認証済みなら token を stdout に出力。未認証 / 不在は非ゼロ終了 / ENOENT。
- 解決した token の出力は B-7 seam（`logger` の `maskSensitive`）経由でのみ行う。

## スコープ外

- host の config 化 / enterprise token / host↔token 束縛の enforce = 別 request `github-host-config`。
- GitHub App device flow の spec / doctor / login 整合 = 別 request `github-app-auth-align`。

## 受け入れ基準

- [ ] `GH_TOKEN` が `GITHUB_TOKEN` より優先され、env が `credentials.json` より優先される。
- [ ] env に token が無く gh 認証済みなら `gh auth token` から解決し `source = "gh"` になる。
- [ ] gh 不在 / 未認証でも既存の token 解決テストが green（spawn を注入してテストする）。
- [ ] `bun run typecheck && bun run test` が green。

## architect 評価済みの設計判断

構造判断は `architecture/adr/2026-06-02-github-auth-host-decoupling.md` の D3。resolver は判定系（B-5）ではなく I/O 系なので subprocess 委譲を許容する。本 request は D3 の実装。
