# cli-commands Specification (delta)

**Spec Name**: cli-commands
**Modification Type**: MODIFIED
**Delta Date**: 2026-05-26
**Reason**: pipeline 境界 diagnostic log の opt-in env var を追加

## Requirements

### Requirement: SPECRUNNER_DEBUG=pipeline で pipeline 境界 diagnostic log を有効化する

`SPECRUNNER_DEBUG` 環境変数に `pipeline` が含まれる場合、PR #387 で実証された 13 ポイントの境界 diagnostic log を stderr に出力しなければならない (SHALL)。未設定時はゼロ overhead でなければならない (MUST)。

#### Scenario: SPECRUNNER_DEBUG=pipeline 設定時に diagnostic log が出力される
- **GIVEN** `SPECRUNNER_DEBUG=pipeline` が設定されている
- **WHEN** pipeline が実行される
- **THEN** 13 ポイントの境界で `[pipeline-diag <timestamp>] <point>: <detail>` 形式のログが stderr に出力される

#### Scenario: SPECRUNNER_DEBUG 未設定時に diagnostic log は出力されない
- **GIVEN** `SPECRUNNER_DEBUG` が設定されていない
- **WHEN** pipeline が実行される
- **THEN** diagnostic log は出力されない
- **AND** パフォーマンスへの影響はゼロ (env var check のみ)

#### Scenario: SPECRUNNER_DEBUG にカンマ区切りで複数値を指定できる
- **GIVEN** `SPECRUNNER_DEBUG=pipeline,other` が設定されている
- **WHEN** pipeline が実行される
- **THEN** pipeline 境界の diagnostic log が出力される
- **AND** 将来の別 debug category と共存可能
