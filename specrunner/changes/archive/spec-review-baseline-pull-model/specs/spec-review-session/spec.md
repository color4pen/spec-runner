# spec-review-session Delta Spec

## REMOVED Requirements

### Requirement: spec-review の初期メッセージに関連 baseline spec が注入される

削除理由: baseline spec の取得を initial message 注入モデルから Read-tool-pull モデルに切り替えたため。`SpecReviewStep.enrichContext()` による baseline 収集と `DynamicContext.baselineSpecs` 経由の注入経路を廃止し、agent が自力で Read tool を使って baseline を取得する方式に変更する。

## ADDED Requirements

### Requirement: spec-review agent は Read tool で baseline spec を自力取得する

spec-review エージェントは、baseline spec を initial message からの注入ではなく、`Read` tool を使って自ら取得する MUST。`SpecReviewStep.enrichContext()` や `DynamicContext.baselineSpecs` による caller 側の baseline 収集・注入は行わない。

delta spec が `## MODIFIED Requirements` / `## REMOVED Requirements` / `## RENAMED Requirements` セクションを含む場合、エージェントは SHALL 対応する baseline spec (`specrunner/specs/<capability>/spec.md`) を Read tool で読み取り、delta spec 内の Requirement header が baseline に存在することを検証する。

delta spec の `## ADDED Requirements` 配下の Requirement header についても、エージェントは SHALL baseline spec を Read して重複がないことを検証する。

baseline と一致しない MODIFIED / REMOVED / RENAMED-FROM header は HIGH severity finding (category: consistency) として報告する。baseline に既に存在する ADDED header も同様に HIGH severity finding (category: consistency) として報告する。

baseline spec ファイルが存在せず、delta spec に MODIFIED / REMOVED セクションがある場合は HIGH severity finding (category: consistency) を報告する。baseline が存在せず ADDED セクションのみの場合は新規 capability として正常とみなす。

#### Scenario: agent が Read tool で baseline を取得して MODIFIED header を検証する

- **GIVEN** delta spec の MODIFIED セクションに `### Requirement: SomeExistingReq` がある
- **AND** 対応する baseline spec に `SomeExistingReq` という Requirement が存在する
- **WHEN** spec-review エージェントがレビューを実行する
- **THEN** エージェントは Read tool で baseline spec を読み取り、header の一致を確認する
- **AND** consistency finding は報告されない

#### Scenario: baseline が initial message に注入されない

- **GIVEN** spec-review セッションが開始される
- **WHEN** initial message が構築される
- **THEN** initial message に `<baseline-specs>` セクションは含まれない
- **AND** `SpecReviewPromptInput` に `baselineSpecs` field は存在しない

#### Scenario: enrichContext は baselineSpecs を収集しない

- **GIVEN** change folder に `specs/<capability>/spec.md` が存在する
- **WHEN** `SpecReviewStep.enrichContext()` が呼ばれる
- **THEN** 返された `DynamicContext` に `baselineSpecs` field は含まれない
