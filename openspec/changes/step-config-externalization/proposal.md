## Why

PR #91 で各 step に model / maxTurns をハードコードしたが、dogfood で implementer の maxTurns: 60 が不足して pipeline が失敗した。コード変更なしに実行パラメータを調整する手段がなく、運用上のボトルネックになっている。`~/.config/specrunner/config.json` に `steps` セクションを追加し、step ごとの model / maxTurns / timeoutMs を外部から設定可能にする。

## What Changes

- `SpecRunnerConfig` に `steps?: StepConfigMap` を追加（defaults + 各 step 名のオーバーライド）
- `getStepExecutionConfig(config, stepName)` 関数を実装し、config step-level -> config defaults -> step 定義のハードコード値 -> SDK デフォルトの優先順で解決
- `ClaudeCodeRunner` が解決済みの model / maxTurns を SDK `query()` に渡す
- `maxTurns: null` は「unlimited」を意味し、SDK に maxTurns を渡さない
- `timeoutMs` は config で解決するが現時点では未使用（SDK に対応パラメータなし）
- `specrunner init --runtime=local` で `steps.defaults` を含む config を生成
- 既存 config に `steps` がなくても正常動作（後方互換）

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `cli-config-store`: config schema に `steps` セクション（`StepConfigMap`）を追加。`StepExecutionConfig` 型の定義と解決順序ロジックを仕様化
- `step-execution-architecture`: `AgentStep` の model / maxTurns が config から解決される動作を仕様化。ClaudeCodeRunner が config 解決済み値を SDK に渡す

## Impact

- `src/config/schema.ts`: `StepExecutionConfig`, `StepConfigMap` 型追加、`SpecRunnerConfig` に `steps?` フィールド追加
- `src/config/` 配下: `getStepExecutionConfig()` 関数の新規追加
- `src/adapter/claude-code/agent-runner.ts`: config から解決した model / maxTurns を使用
- `src/cli/init.ts`: local runtime init で `steps.defaults` を生成
- 既存テスト: config fixture に `steps` を追加する可能性あり
