# Tasks: github-token-gh-contract

## T-01: `SECRET_DENYLIST` に `GH_TOKEN` を追加

- [x] `src/util/env-filter.ts` の `SECRET_DENYLIST` 配列に `"GH_TOKEN"` を追加する

**Acceptance Criteria**:
- `SECRET_DENYLIST` に `"GH_TOKEN"` が含まれる
- `stripSecrets` が `GH_TOKEN` を除去する

## T-02: `resolveGitHubToken` の signature 変更と解決順反転

- [x] `src/core/credentials/github.ts` の `resolveGitHubToken` の戻り値型を `source: "credentials" | "env"` → `source: "credentials" | "env" | "gh"` に変更
- [x] 第 2 引数に `opts?: { host?: string; spawn?: SpawnFn }` を追加（`SpawnFn` は `src/util/spawn.ts` から import）
- [x] 解決順を以下に書き換え:
  1. `env["GH_TOKEN"]`（非空なら `{ token, source: "env" }` 返却）
  2. `env["GITHUB_TOKEN"]`（非空なら `{ token, source: "env" }` 返却）
  3. `gh auth token` subprocess 呼び出し（`opts?.spawn ?? spawnCommand` で実行、`cwd: process.cwd()`, `timeoutMs: 5000`）。exit 0 かつ stdout 非空なら `{ token: stdout.trim(), source: "gh" }` 返却。それ以外は次へフォールスルー
  4. `loadCredentials()` で `github.token` 取得（非空なら `{ token, source: "credentials" }` 返却）
  5. `SpecRunnerError` throw。hint を `"Set GH_TOKEN env var, run 'gh auth login', or run 'specrunner login'."` に更新
- [x] モジュール先頭の JSDoc コメントを新しい解決順に合わせて更新

- [x] `source: "gh"` で解決した token が logger.maskSensitive を通じてのみログに出力される（token 値を直接ログしない）ことを確認し、直読箇所があれば修正する

**Acceptance Criteria**:
- `GH_TOKEN` が `GITHUB_TOKEN` より優先される
- env が `credentials.json` より優先される
- `gh auth token` が env 不在・gh 認証済みのとき `source: "gh"` で解決する
- gh 不在 / 未認証 / timeout で throw せず credentials.json にフォールスルーする
- `host` 引数を受け取れる（本 request では未使用）
- `source: "gh"` で解決した token が preflight の logInfo 等で直接ログされず logger.maskSensitive 経由でのみ出力される

## T-03: source 型の追従（preflight / doctor / DoctorContext）

- [x] `src/core/preflight.ts` の `PreflightResult.githubTokenSource` 型を `"credentials" | "env" | "gh"` に変更
- [x] `src/core/preflight.ts` の `runPreflight` 内の `githubTokenSource` ローカル変数の型を `"credentials" | "env" | "gh"` に変更
- [x] `src/core/doctor/types.ts` の `DoctorContext.githubTokenSource` 型を `"credentials" | "env" | "gh" | null` に変更
- [x] `src/cli/doctor.ts` の `githubTokenSource` ローカル変数の型を `"credentials" | "env" | "gh" | null` に変更

**Acceptance Criteria**:
- `bun run typecheck` が green

## T-04: doctor check の hint メッセージ更新

- [x] `src/core/doctor/checks/config/github-token-present.ts` の fail 時 message を `"GitHub token not found"` 系に、hint を `"Set GH_TOKEN env var, run 'gh auth login', or run 'specrunner login'."` に更新
- [x] `src/core/doctor/checks/auth/github-token-valid.ts` の token 不在時 hint を同様に更新

**Acceptance Criteria**:
- hint が `GH_TOKEN` / `gh auth login` / `specrunner login` の 3 つのガイダンスを含む

## T-05: `requirements.ts` の envVar 更新

- [x] `src/core/credentials/requirements.ts` の `github.token` の `envVar` を `"GH_TOKEN"` に変更する（primary env var として表示される箇所に影響）

**Acceptance Criteria**:
- `requirementsFor("local")` が `github.token` の `envVar` として `"GH_TOKEN"` を返す

## T-06: テスト作成

- [x] `src/core/credentials/github.test.ts` を作成し以下をテスト:
  - `GH_TOKEN` 設定時に `source: "env"` で解決される
  - `GH_TOKEN` と `GITHUB_TOKEN` 両方設定時に `GH_TOKEN` が優先される
  - env なし、spawn mock が exit 0 + stdout 返却 → `source: "gh"` で解決される
  - env なし、spawn mock が exit 1 → credentials.json にフォールスルー
  - env なし、spawn mock が ENOENT（`exitCode: null`）→ credentials.json にフォールスルー
  - 全 source なし → `SpecRunnerError` throw
  - `host` 引数を渡してもエラーにならない（型の口だけ確認）
- [x] `loadCredentials` は vi.mock でモック、spawn は `opts.spawn` で注入

**Acceptance Criteria**:
- `bun run test` が green
- gh subprocess のテストが実際の `gh` CLI に依存しない
