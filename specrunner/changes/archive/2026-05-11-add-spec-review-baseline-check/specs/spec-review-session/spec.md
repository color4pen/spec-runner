# spec-review-session Delta Spec

## ADDED Requirements

### Requirement: spec-review は baseline spec との整合性を検証する

spec-review エージェントは、delta spec が存在する場合に対応する baseline spec（`specrunner/specs/<capability>/spec.md`）を参照し、以下の整合性チェックを行う。

1. **MODIFIED requirements**: delta spec の MODIFIED セクションに記載された Requirement header が、対応する baseline spec に存在すること。存在しない場合は HIGH severity の finding（category: consistency）を報告する。
2. **REMOVED requirements**: delta spec の REMOVED セクションに記載された Requirement header が、対応する baseline spec に存在すること。存在しない場合は HIGH severity の finding（category: consistency）を報告する。
3. **ADDED requirements**: delta spec の ADDED セクションに記載された Requirement header が、対応する baseline spec に既に存在しないこと。既に存在する場合は HIGH severity の finding（category: consistency）を報告する。

baseline spec が提供されていない場合（delta spec がない refactoring 等）はチェックをスキップする。

#### Scenario: MODIFIED requirement が baseline に存在しない

- **GIVEN** delta spec の MODIFIED セクションに `### Requirement: NonExistentReq` がある
- **AND** 対応する baseline spec に `NonExistentReq` という Requirement が存在しない
- **WHEN** spec-review エージェントがレビューを実行する
- **THEN** HIGH severity の finding（category: consistency）が報告される

#### Scenario: ADDED requirement が baseline に既に存在する

- **GIVEN** delta spec の ADDED セクションに `### Requirement: ExistingReq` がある
- **AND** 対応する baseline spec に `ExistingReq` という Requirement が既に存在する
- **WHEN** spec-review エージェントがレビューを実行する
- **THEN** HIGH severity の finding（category: consistency）が報告される

#### Scenario: delta spec がない場合はスキップ

- **GIVEN** change folder に `specs/` ディレクトリが存在しない（refactoring 等）
- **WHEN** spec-review が実行される
- **THEN** baseline 整合性チェックはスキップされ、他の観点のみでレビューが行われる

### Requirement: spec-review の初期メッセージに関連 baseline spec が注入される

`SpecReviewStep` は `enrichContext` メソッドを実装し、change folder の `specs/` ディレクトリから capability 名を列挙して、対応する baseline spec（`specrunner/specs/<capability>/spec.md`）を読み取り、`DynamicContext.baselineSpecs` に格納する。

`buildSpecReviewInitialMessage` は `baselineSpecs` が存在する場合に `<baseline-specs>` タグで囲んだ baseline spec 全文を初期メッセージに含める。

baseline spec が存在しない capability（新規追加）はスキップし、エラーとしない。

#### Scenario: enrichContext が baseline spec を収集する

- **GIVEN** change folder に `specs/cli-commands/spec.md` と `specs/pipeline-orchestrator/spec.md` がある
- **AND** `specrunner/specs/cli-commands/spec.md` と `specrunner/specs/pipeline-orchestrator/spec.md` が存在する
- **WHEN** `SpecReviewStep.enrichContext` が呼ばれる
- **THEN** 返された `DynamicContext.baselineSpecs` に `cli-commands` と `pipeline-orchestrator` の baseline spec 全文が含まれる

#### Scenario: 新規 capability の baseline はスキップされる

- **GIVEN** change folder に `specs/new-capability/spec.md` がある
- **AND** `specrunner/specs/new-capability/spec.md` が存在しない
- **WHEN** `SpecReviewStep.enrichContext` が呼ばれる
- **THEN** `baselineSpecs` に `new-capability` のエントリは含まれない
- **AND** エラーは発生しない

## MODIFIED Requirements

## REMOVED Requirements
