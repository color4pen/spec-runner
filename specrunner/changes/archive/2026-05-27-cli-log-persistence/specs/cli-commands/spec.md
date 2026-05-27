## Requirements

### Requirement: `specrunner job show <jobId|slug>` は job state の詳細を表示する

`specrunner job show <jobId|slug>` は MUST 以下の 7 フィールドを stdout に出力する（baseline の 6 フィールドに `Log:` フィールドを追加）:

- Job ID
- Status
- Branch
- Step
- Created
- Updated
- Log

`Log:` フィールドはログファイルのパスを表示する。ログファイルが存在する場合は repoRoot からの相対パスを、存在しない場合は `(none)` を表示する。

#### Scenario: job show にログパスが表示される

- **WHEN** `specrunner job show <slug>` を実行する
- **AND** `.specrunner/logs/<jobId>.log` が存在する
- **THEN** stdout に `Log:     .specrunner/logs/<jobId>.log` が出力される

#### Scenario: ログファイルが存在しない場合

- **WHEN** `specrunner job show <slug>` を実行する
- **AND** 対応するログファイルが存在しない
- **THEN** stdout に `Log:     (none)` が出力される

### Requirement: finish / cancel コマンドの pipeline ログ出力

`specrunner finish <slug>` および `specrunner job cancel <jobId>` は、jobId 解決後に pipeline ログを初期化し、コマンドの開始 / 完了 / エラーイベントを `.specrunner/logs/<jobId>.log` に JSONL で記録しなければならない（MUST）。

- finish: slug → jobId 解決後に初期化する
- cancel (single job): jobId 解決後に初期化する
- cancel --all-terminated: bulk 操作のため個別の pipeline ログ初期化は行わない
- doctor: job に紐づかないため pipeline ログ対象外

#### Scenario: finish で pipeline ログが記録される

- **WHEN** `specrunner finish <slug>` を実行する
- **THEN** 解決された jobId の `.specrunner/logs/<jobId>.log` に finish の開始/完了イベントが JSONL で記録される

#### Scenario: cancel で pipeline ログが記録される

- **WHEN** `specrunner job cancel <jobId>` を実行する
- **THEN** `.specrunner/logs/<jobId>.log` に cancel の開始/完了イベントが JSONL で記録される
