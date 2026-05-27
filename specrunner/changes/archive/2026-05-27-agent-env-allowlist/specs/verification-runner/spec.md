# verification-runner Delta Spec (agent-env-allowlist)

## Requirements

### Requirement: verification の全 spawn 経路は secret key を env から除去する

verification runner が子プロセスを spawn する際、`process.env` から `GITHUB_TOKEN`, `SPECRUNNER_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` を除去した env を渡さなければならない (MUST)。

対象経路:
1. `src/core/verification/commands.ts:spawnCommand()` — `sh -c <command>` 経由の spawn
2. `src/core/verification/runner.ts:spawnScript()` — `bun run <script>` 経由の spawn

フィルタは `src/util/env-filter.ts` の `stripSecrets()` を使用する。
`commands.ts` の PATH 拡張 (`node_modules/.bin` 追加) は `stripSecrets` 適用後に行う。

#### Scenario: verification commands spawn で secret が除去される

- **GIVEN** `process.env` に `GITHUB_TOKEN=ghp_xxx` が設定されている
- **AND** verification config に `commands: ["echo $GITHUB_TOKEN"]` が定義されている
- **WHEN** `runVerification(slug, cwd, config)` を実行する
- **THEN** command の stdout に `ghp_xxx` が含まれない

#### Scenario: verification fallback spawn で secret が除去される

- **GIVEN** `process.env` に `GITHUB_TOKEN=ghp_xxx` が設定されている
- **AND** verification config に commands が未定義
- **WHEN** `spawnScript("test", cwd)` を実行する
- **THEN** 子プロセスの env に `GITHUB_TOKEN` が含まれない

#### Scenario: PATH 拡張は引き続き機能する

- **GIVEN** `cwd/node_modules/.bin` にバイナリが存在する
- **WHEN** `commands.ts:spawnCommand(command, cwd)` を実行する
- **THEN** 子プロセスの `PATH` に `cwd/node_modules/.bin` が先頭に含まれる
