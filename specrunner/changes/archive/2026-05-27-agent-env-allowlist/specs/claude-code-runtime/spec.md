# claude-code-runtime Delta Spec (agent-env-allowlist)

## Requirements

### Requirement: Claude Code SDK query() に secret を除去した env を渡す

`ClaudeCodeRunner` および `LocalRuntime` が SDK `query()` を呼ぶ際、`env` オプションに
`process.env` から secret key を除去した env を渡さなければならない (MUST)。

除去対象: `GITHUB_TOKEN`, `SPECRUNNER_API_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`。

フィルタは `src/util/env-filter.ts` の `stripSecrets()` を使用する。
SDK の `env` オプション (`sdk.d.ts:1232`) は `process.env` を置換するため、
filtered env を渡すことで SDK が spawn する Claude Code プロセスから secret が除去される。

対象箇所:
1. `src/adapter/claude-code/agent-runner.ts` の `queryOptions` 構築
2. `src/core/runtime/local.ts` の `buildSdkOptions()` 戻り値

#### Scenario: agent-runner の queryOptions に env が含まれる

- **GIVEN** `process.env` に `GITHUB_TOKEN=ghp_xxx` が設定されている
- **WHEN** `ClaudeCodeRunner.run(ctx)` が `queryOptions` を構築する
- **THEN** `queryOptions.env` が存在する
- **AND** `queryOptions.env.GITHUB_TOKEN` が `undefined` である
- **AND** `queryOptions.env.PATH` が `process.env.PATH` と同値である

#### Scenario: local runtime の buildSdkOptions に env が含まれる

- **GIVEN** `process.env` に `ANTHROPIC_API_KEY=sk-xxx` が設定されている
- **WHEN** `LocalRuntime.buildSdkOptions()` を呼ぶ
- **THEN** 戻り値の `env` フィールドが存在する
- **AND** `env.ANTHROPIC_API_KEY` が `undefined` である
