# spec-review-session Delta Spec

## ADDED Requirements

### Requirement: spec-review は type=spec-change/new-feature のとき delta spec 存在を必須として check する

spec-review エージェントは、request type が `spec-change` または `new-feature` のとき、change folder の `specs/` 配下に delta spec ファイル（`.md`）が 1 件以上存在することを確認する。不在の場合は HIGH severity の finding（category: completeness）を報告する。

この check は dsv (delta-spec-validation) の機械的 check とは独立した冗長層として機能する。

#### Scenario: type=spec-change で specs/ 不在

- **GIVEN** request type が `spec-change` である
- **AND** change folder に `specs/` ディレクトリが存在しない、または `specs/` 配下に `.md` ファイルが 0 件
- **WHEN** spec-review エージェントがレビューを実行する
- **THEN** HIGH severity の finding（category: completeness）が報告される
- **AND** verdict は `needs-fix` となる

#### Scenario: type=bug-fix で specs/ 不在は対象外

- **GIVEN** request type が `bug-fix` である
- **AND** change folder に `specs/` ディレクトリが存在しない
- **WHEN** spec-review エージェントがレビューを実行する
- **THEN** delta spec 存在 check はスキップされ、他の観点のみでレビューが行われる

#### Scenario: type=spec-change で specs/ 1 件以上

- **GIVEN** request type が `spec-change` である
- **AND** change folder の `specs/<capability>/spec.md` に 1 件以上のファイルが存在する
- **WHEN** spec-review エージェントがレビューを実行する
- **THEN** delta spec 存在 check は通過し、他の review 観点に進む
