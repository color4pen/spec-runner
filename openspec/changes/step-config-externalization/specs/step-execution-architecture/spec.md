## ADDED Requirements

### Requirement: ClaudeCodeRunner は config から解決した実行パラメータを使用する

`ClaudeCodeRunner.run()` は MUST `getStepExecutionConfig(ctx.config, step.name, { model: step.agent.model, maxTurns: step.maxTurns })` を呼び出し、解決済みの `ResolvedStepConfig` を SDK `query()` の options に適用する。

具体的には:
- `resolved.model` を `options.model` に渡す
- `resolved.maxTurns` が `number` の場合は `options.maxTurns` に渡す
- `resolved.maxTurns` が `null` の場合は `options.maxTurns` を省略する（SDK デフォルト = unlimited）
- `resolved.timeoutMs` は解決するが `options` には渡さない（SDK 未対応。将来の自前 guard 用）

従来の `step.maxTurns ?? 30` のフォールバックは MUST 廃止され、`getStepExecutionConfig` の解決チェーンに置き換わる。

#### Scenario: config step-level の model が SDK に渡される

- **GIVEN** config に `{ "steps": { "implementer": { "model": "claude-opus-4-6[1m]" } } }` が設定されている
- **AND** step 定義のハードコード model が `"claude-sonnet-4-6"` である
- **WHEN** `ClaudeCodeRunner.run(ctx)` が implementer step を実行する
- **THEN** SDK `query()` の `options.model` は `"claude-opus-4-6[1m]"` である

#### Scenario: maxTurns null で SDK に maxTurns を渡さない

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": null } } }` が設定されている
- **WHEN** `ClaudeCodeRunner.run(ctx)` が任意の step を実行する
- **THEN** SDK `query()` の `options` に `maxTurns` フィールドが含まれない（省略される）

#### Scenario: config 未設定時は step 定義のハードコード値が使用される

- **GIVEN** config に `steps` セクションが存在しない
- **AND** step 定義のハードコード model が `"claude-sonnet-4-6"` で maxTurns が `25` である
- **WHEN** `ClaudeCodeRunner.run(ctx)` がその step を実行する
- **THEN** SDK `query()` の `options.model` は `"claude-sonnet-4-6"` である
- **AND** SDK `query()` の `options.maxTurns` は `25` である

#### Scenario: config defaults が step 定義より優先される

- **GIVEN** config に `{ "steps": { "defaults": { "maxTurns": 100 } } }` が設定されている
- **AND** step 定義のハードコード maxTurns が `30` である
- **AND** step 個別設定は存在しない
- **WHEN** `ClaudeCodeRunner.run(ctx)` がその step を実行する
- **THEN** SDK `query()` の `options.maxTurns` は `100` である
