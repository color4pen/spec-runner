# GitHub token の取得元 (credentials / env) を preflight / doctor に流して可視化する

## Meta

- **type**: spec-change
- **slug**: github-token-source-visibility
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen

## 背景

PR #248 で導入した `src/core/credentials/github.ts:92` の `resolveGitHubToken` は `{ token, source: "credentials" | "env" }` を返すが、現状の caller は `.token` しか使わず `source` を捨てている。

- `src/core/preflight.ts:81` — `resolved.token` だけ取得
- `src/cli/doctor.ts:91-119` — token は使うが source 未参照
- `src/cli/bootstrap.ts:34` — `resolveGitHubToken` を呼んで source を捨てている
- `src/cli/finish.ts:79-80` — 同上
- `src/core/doctor/checks/config/github-token-present.ts` / `src/core/doctor/checks/auth/github-token-valid.ts` — source を表示できない

関連 issue: https://github.com/color4pen/spec-runner/issues/251

## 目的

「credentials.json に書いたつもりが env var を読んでいる／逆」のような誤解を即座に解消できるよう、doctor / preflight の出力で token 取得元を可視化する。CI (env) と local (credentials file) の運用差を診断時に区別できるようにする。

## 要件

### 1. `PreflightResult` に source を追加

`src/core/preflight.ts` の `PreflightResult` 型に `githubTokenSource: "credentials" | "env"` を **non-optional** で追加し、`runPreflight` が `resolveGitHubToken` の結果から populate する。

### 2. `DoctorContext` に source を追加

`src/core/doctor/types.ts:80-108` の `DoctorContext` 型に `githubTokenSource: "credentials" | "env" | null` を追加し（既存 `resolvedGitHubToken: string | null` と整合する null 許容）、`src/cli/doctor.ts:91-119` の pre-resolve 段階で注入する。

### 3. doctor check の出力に source を埋め込む

`src/core/doctor/checks/config/github-token-present.ts` の pass message に source を含める。例: `"GitHub token is available (source: credentials)"` / `"GitHub token is available (source: env)"`。

`src/core/doctor/checks/auth/github-token-valid.ts` は scope 検証が責務なので **source は出さない**（pass message format は変更しない）。`github-token-present` 側 1 箇所に集約することで重複を避ける。

### 4. `runPreflight` の info ログにも source を出す

`runPreflight` 実行時、`resolveGitHubToken` を呼んだ直後に info ログを 1 行出す。例: `GitHub token source: credentials` / `GitHub token source: env`。`specrunner run` 経路でも token 取得元が見えるようにすることで、目的の「CI (env) と local (credentials) の運用差を診断時に区別」を doctor 外でも満たす。

### 5. test

以下 4 ケースを明示的に cover:
- (a) credentials 経由で `PreflightResult.githubTokenSource === "credentials"` になる
- (b) env 経由で `PreflightResult.githubTokenSource === "env"` になる
- (c) `github-token-present` check の pass message が `(source: credentials)` / `(source: env)` を含む
- (d) `runPreflight` の info ログに `GitHub token source: ...` 行が出力される

### 5. spec

`specrunner/specs/github-device-flow-auth/spec.md` の credentials 解決節に「token 取得元は preflight / doctor 出力で可視化される」を 1 行追加する。doctor の出力 contract 側の spec があればそちらに記述する。

## スコープ外

- Anthropic API key 側の同等可視化（[[project_credentials_provider_parity]] 範囲）
- credentials.json への source 以外の metadata 追加

## 受け入れ基準

- [ ] `PreflightResult` / `DoctorContext` に `githubTokenSource` field が存在する
- [ ] `runPreflight` が `resolveGitHubToken` の `source` を propagate している
- [ ] `github-token-present` check の pass message に `(source: credentials)` / `(source: env)` が含まれる
- [ ] credentials.json 経由と env 経由の両ケースで test が source を verify している
- [ ] 関連 spec が新挙動を反映している
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
