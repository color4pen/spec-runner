# Design: github-credential-env-separation

## Overview

config.json から GitHub secret (`github.accessToken`) を排除し、`~/.config/specrunner/credentials.json` に分離する。`specrunner login` を auth の統一入口とし、内部の `gh` CLI 呼び出しには env 注入で同じ token を渡す。

## Design Decisions

### D1: credentials file の構造 — provider-keyed JSON

credentials file は provider 名を key とする JSON 構造を採用する。

```json
{
  "github": {
    "token": "ghp_..."
  }
}
```

**理由**: 将来の multi-provider 対応（GitLab 等、issue #246）への forward-compat insurance。実装コストは ~5 行で cheap。`tokenObtainedAt` / `scopes` は意図的に引き継がない（config の operational metadata と secret を混ぜない原則。request.md の architect 評価参照）。

### D2: credentials file のパスと permission

- パス: `${XDG_CONFIG_HOME:-$HOME/.config}/specrunner/credentials.json`
- Permission: 0600（atomicWriteJson で mode 指定）
- 既存の `getConfigPath()` と対になる `getCredentialsPath()` を `src/util/xdg.ts` に追加

### D3: token resolver — 優先順位チェーン

新設する `resolveGitHubToken()` は以下の優先順位で token を返す:

1. `credentials.json` の `github.token`（最優先）
2. `GITHUB_TOKEN` env var（fallback、CI 用）
3. どちらも無ければ error（`specrunner login` 案内）

**配置**: `src/core/credentials/github.ts`。pure file I/O + env access のみ、subprocess primitive 不要。

**理由**: CLI entry 層で token を解決し、adapter にはコンストラクタ注入する（PR #238 の Anthropic 側と symmetric）。adapter が `process.env` や config を直読みしないことでテスタビリティ確保。

### D4: config schema からの `github` フィールド削除

`SpecRunnerConfig` / `RawConfig` / `GithubConfig` から `github` フィールドを型レベルで削除する。PR #238 の `anthropic` strip と同パターンで `saveConfig` に `delete toSave["github"]` を追加し、既存 config に残っている `github` フィールドは save 時に strip する。

### D5: `checkConfigComplete` の置き換え

現在 `checkConfigComplete` は `cfg.github?.accessToken` をチェックしている。これを削除し、credentials file ベースの token 取得可能性チェックに置き換える。

**方針**: `checkConfigComplete` から github チェックを削除し、`runPreflight` 内で token resolver を呼ぶ形に移行する。これにより config の完全性チェックと credential の存在チェックが分離される。

### D6: `gh` CLI への env 注入

`spawnCommand` は既に `SpawnOptions.env` を受け取れる（`opts.env ?? process.env`）。ただし現在の実装は `env` が渡されたとき **system env を上書き** してしまう。`gh` CLI が動作するには `PATH` / `HOME` 等の system env が必要。

**方針**: `spawnCommand` の `env` merge 戦略を変更する：
- `opts.env` が `undefined` → `process.env`（現行通り）
- `opts.env` が指定 → `{ ...process.env, ...opts.env }` に変更（system env を base にし、opts.env で override）

これにより呼び出し側は `{ env: { GITHUB_TOKEN: token } }` だけ渡せば `PATH` 等は自動で引き継がれる。

**影響**: 既存の `SpawnOptions.env` を使っている箇所がないことを確認済み（全 call site で `env` 省略）。behavioral change なし。

### D7: gh CLI spawn の token 注入パターン

`gh` を spawn する箇所は大きく 2 系統:

1. **finish module**: `FinishInput.spawn` を通じて inject 済みの `SpawnFn` を受け取る
2. **pr-create module**: モジュール内部の `spawnCommand` wrapper 経由

両方とも CLI entry 層で token を resolve し、spawn 呼び出し時に `env: { GITHUB_TOKEN: resolvedToken }` を渡す。

**注入ポイント**: finish module は `FinishInput` に `githubToken` フィールドを追加し、orchestrator 内部で spawn opts に merge する。pr-create module は呼び出し元（`src/core/pr-create/runner.ts` の `createPr` / `listPrs`）に env を渡す。

### D8: ManagedAgentRunner へのコンストラクタ注入

`ManagedAgentRunner` のコンストラクタに `githubToken: string` パラメータを追加する。adapter 内の `config.github!.accessToken` 参照（3 箇所: lines 140, 381, 413）をコンストラクタ注入された token に置き換える。

### D9: doctor checks の更新

- `github-token-present`: `ctx.config.get("github.accessToken")` → credentials file + env var 両方をチェック
- `github-token-valid`: credentials file または env var から resolved token で API 疎通
- **新設** `gh-cli-present`: `gh` バイナリの存在チェック（`which gh`）。issue #247 で `gh` 依存脱却するまでの guard
- `DoctorContext` に `resolvedGitHubToken: string | null` を追加し、doctor entry 層で resolve → ctx 注入

### D10: 0600 permission warning の移動

`src/config/store.ts` の loose permission warning（lines 34-45）を削除する。config から secret が完全に消えるため不要。credentials file 用の同等ロジックを `src/core/credentials/github.ts` の load 関数内に新設する。

## File Change Summary

### 新規ファイル

| File | Purpose |
|------|---------|
| `src/core/credentials/github.ts` | `resolveGitHubToken()` + `loadCredentials()` + `saveCredentials()` + permission warning |
| `src/core/credentials/types.ts` | `CredentialsFile` 型定義 |
| `src/core/doctor/checks/runtime/gh-cli.ts` | `gh` バイナリ存在チェック |
| `tests/credentials-github.test.ts` | token resolver + credentials I/O テスト |
| `tests/doctor-gh-cli.test.ts` | gh-cli check テスト |

### 変更ファイル

| File | Change |
|------|--------|
| `src/config/schema.ts` | `GithubConfig` 削除、`SpecRunnerConfig.github` 削除、`RawConfig.github` 削除、`checkConfigComplete` から github チェック削除 |
| `src/config/store.ts` | `saveConfig` に `delete toSave["github"]` 追加、0600 permission warning 削除 |
| `src/util/xdg.ts` | `getCredentialsPath()` 追加 |
| `src/util/spawn.ts` | `spawnCommand` の env merge 戦略変更（D6） |
| `src/cli/login.ts` | token 保存先を credentials file に変更 |
| `src/cli/run.ts` | token resolver 経由で `createGitHubClient` に token 注入 |
| `src/cli/bootstrap.ts` | 同上 |
| `src/cli/doctor.ts` | credentials file ベースで token 解決、`DoctorContext` に注入 |
| `src/cli/finish.ts` | token resolver 経由で `FinishInput` に token 渡し |
| `src/core/preflight.ts` | `checkRuntimePrereqs` に GitHub token チェック追加（両 runtime 共通） |
| `src/adapter/managed-agent/agent-runner.ts` | コンストラクタに `githubToken` 追加、`config.github!.accessToken` の 3 箇所置き換え |
| `src/core/gh/pr.ts` | `GhPrCreateInput` に env 追加、spawn opts に `GITHUB_TOKEN` 注入 |
| `src/core/pr-create/runner.ts` | spawn に `GITHUB_TOKEN` env 注入 |
| `src/core/finish/orchestrator.ts` | `FinishInput` に `githubToken` 追加、`gh` spawn に env 注入 |
| `src/core/finish/spawn-helper.ts` | `spawnOrEscalate` に env option 追加 |
| `src/core/finish/pr-status.ts` | spawn に env passthrough |
| `src/core/finish/resolve-target.ts` | spawn に env passthrough |
| `src/core/doctor/checks/config/github-token-present.ts` | credentials file + env var ベースに書き換え |
| `src/core/doctor/checks/auth/github-token-valid.ts` | resolved token ベースに書き換え |
| `src/core/doctor/checks/index.ts` | `ghCliPresentCheck` 追加 |
| `src/core/doctor/types.ts` | `DoctorContext.resolvedGitHubToken` 追加 |
| `src/core/runtime/index.ts` | `createRuntime` に `githubToken` 引数追加（ManagedAgentRunner に relay） |

### 既存テスト影響

`config.github` を参照する既存テストは型エラーで検出される。token resolver のモック差し替えで対応する。
