# GitHub host を config 駆動にし port を host 非依存に保つ（+ host↔token 束縛 B-10）

## Meta

- **type**: spec-change
- **slug**: github-host-config
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

`api.github.com`（github adapter、9 箇所）と device / token URL（`src/auth/constants.ts`）がハードコードで、GHES 等の別 host に向けられない。

構造判断は `architecture/adr/2026-06-02-github-auth-host-decoupling.md` の D1（host を adapter-contained・port 不変・別 provider port を作らない）と D2（host↔token 束縛 = B-10）。token 解決の host 引数を前提にするため、request `github-token-gh-contract` に依存する。

## 要件

1. config schema に GitHub host / `apiBaseUrl` を追加する（既定 `github.com` / `api.github.com`）。`apiBaseUrl` 未設定時は host から導出する: host = github.com → `https://api.github.com`、それ以外（GHES）→ `https://{host}/api/v3`。両方設定時は `apiBaseUrl` を優先する。
2. baseURL を composition-root から github adapter に注入する（`createGitHubClient` の引数）。adapter 内の `api.github.com` 直書き（9 箇所）を baseURL 経由にする。`GitHubClient` port interface は host を露出しない（不変）。
3. auth の device / token URL を host 駆動にする（GHES の `/login` パスに対応）。
4. enterprise token 対応: host が github.com 以外のとき、その host 用の `GH_ENTERPRISE_TOKEN` → `GITHUB_ENTERPRISE_TOKEN` を解決する。優先順位は env 段での host 別 token var 選択とする（host = github.com → `GH_TOKEN`/`GITHUB_TOKEN`、host ≠ github.com → `GH_ENTERPRISE_TOKEN`/`GITHUB_ENTERPRISE_TOKEN`）。env > stored の関係は `github-token-gh-contract` と同一。
5. host↔token 束縛（B-10）: target host に紐づかない token を送らない（github.com 用 token を別 host へ漏らさない）。**本 request は `github-token-gh-contract` が main にマージ済みであること（`resolveGitHubToken` の host 引数）を precondition とし、その host 引数で B-10 をガードする。マージ前には run しない。**
6. `doctor` の `github-origin` チェックを「github.com 必須で fail」から「設定 host と一致検証」に緩和する。
7. B-10 を `tests/unit/architecture/core-invariants.test.ts` の歯に追加する（host↔token 束縛の機械検査）。

### 外部制約

- GHES は github.com と同一 API 形（host / baseURL の差のみ）。multi-provider（GitLab 等の別 port）抽象は行わない。
- github.com 用 token を別 host へ送るのは published security advisory のパターン。B-10 で封じる。
- GraphQL は使わず REST のまま。

## スコープ外

- multi-provider（GitLab 等）対応。
- `architecture/model.md` §4 への B-10 昇格は architecture（out-of-loop・CODEOWNERS・人間）側。本 request は歯（test）と enforce の実装を担当する。
- token 解決順（gh 契約）= 別 request `github-token-gh-contract`。

## 受け入れ基準

- [ ] config で host / `apiBaseUrl` を設定でき、github adapter が baseURL 経由で動作する。
- [ ] `GitHubClient` port interface が host を露出しない。
- [ ] host↔token 束縛が enforce され、`core-invariants.test.ts` に歯がある。
- [ ] `doctor` の `github-origin` が設定 host と一致検証する。
- [ ] precondition: main の `resolveGitHubToken` が host 引数を持つ（`github-token-gh-contract` マージ済み）。run 前に確認する。
- [ ] `bun run typecheck && bun run test` が green。

## architect 評価済みの設計判断

構造判断は `architecture/adr/2026-06-02-github-auth-host-decoupling.md` の D1 / D2。host は adapter-contained（B-2 の延長）で port を汚染しない。B-10 は歯と同時に導入する（歯の無い invariant を残さない）。request `github-token-gh-contract`（resolver の host 引数）に依存する。
