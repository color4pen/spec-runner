## Requirements

### Requirement: config schema に logs セクションを追加

`SpecRunnerConfig` に `logs?: LogsConfig` フィールドを追加しなければならない（MUST）。`LogsConfig` は `maxJobs?: number` フィールドを持ち、retention で保持する最大 job 数を指定する（デフォルト: 20、範囲: 1-1000）。

`validateConfig()` は `logs` が定義されている場合 object であること、`logs.maxJobs` が定義されている場合 1 以上 1000 以下の整数であることを検証しなければならない（SHALL）。範囲外の場合は `CONFIG_INVALID` をスローする。未指定時のデフォルト値 20 は config 読み取り側（`pruneOldLogs` の呼び出し元）が適用する。

#### Scenario: logs.maxJobs が有効値で設定される

- **WHEN** `config.json` に `{ "logs": { "maxJobs": 50 } }` が設定される
- **THEN** retention は最新 50 job のログを保持する

#### Scenario: logs.maxJobs が範囲外で CONFIG_INVALID

- **WHEN** `config.json` に `{ "logs": { "maxJobs": 0 } }` が設定される
- **THEN** `validateConfig()` が `CONFIG_INVALID` をスローする

#### Scenario: logs セクション未指定でデフォルト 20

- **WHEN** `config.json` に `logs` フィールドが存在しない
- **THEN** retention はデフォルトの 20 job を保持する
