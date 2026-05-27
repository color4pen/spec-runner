## Requirements

### Requirement: verbose ログファイルは verbose レベル以上で有効化される

verbose ログファイルの有効化条件は MUST ログレベルが verbose 以上（verbose / debug）であることとする。default / quiet レベルでは verbose エントリを追記してはならない（SHALL NOT）。pipeline ログ (`PipelineLogger`) がログレベル非依存で同一パスに書き込むため、`<jobId>.log` は default レベルでも存在する。

`initVerboseLog()` は `initPipelineLog()` の後に呼ばれ、同一ファイルに対して独立に append する。

#### Scenario: pipeline ログと verbose ログが同一ファイルに混在する

- **WHEN** `specrunner run -v <slug>` を実行する
- **THEN** `.specrunner/logs/<jobId>.log` に pipeline-event エントリと verbose エントリの両方が時系列で記録される
- **AND** pipeline-event エントリは `type` フィールドでイベント種別を示す
- **AND** verbose エントリは `component` フィールドでコンポーネント名を示す

#### Scenario: default レベルでは verbose エントリは追記されない

- **WHEN** `specrunner run <slug>` をフラグなしで実行する
- **THEN** `.specrunner/logs/<jobId>.log` には pipeline-event エントリのみが記録される
- **AND** verbose エントリ（`component` フィールドを持つ行）は存在しない
