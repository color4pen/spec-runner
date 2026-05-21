## Purpose

TBD

## Requirements

### Requirement: Request Generate Prompt Authority Path Prohibition

`src/prompts/request-generate-system.ts` の Output Rules セクションに、authority path を request body 内で直接編集対象として記述することを禁止する MUST ルールを追加する。

#### Scenario: MUST ルールが prompt に存在する
- **GIVEN** `REQUEST_GENERATE_SYSTEM_PROMPT` が生成された
- **WHEN** prompt テキストを参照する
- **THEN** `specrunner/specs/<capability>/spec.md` 形式の authority path を `MODIFIED` / `ADDED` の対象として直接記述してはならない旨の MUST 規律が含まれている
- **AND** spec 変更は必ず delta spec path (`specrunner/changes/<slug>/specs/<capability>/spec.md`) で表現する旨が明示されている

### Requirement: Request Scaffold Template Delta Spec Guidance

`src/core/command/request.ts` の `buildScaffoldTemplate` が生成するテンプレートに、spec 変更を delta spec path で表現する guidance を埋め込む。

#### Scenario: scaffold に delta spec guidance が含まれる
- **GIVEN** `buildScaffoldTemplate` が scaffold テンプレートを生成した
- **WHEN** テンプレートテキストを参照する
- **THEN** spec 変更を伴う場合は `specrunner/changes/<slug>/specs/<capability>/spec.md` の delta spec path で表現する旨が含まれている
- **AND** `specrunner/specs/<capability>/spec.md` 形式の authority path が編集対象の例文として含まれていない

### Requirement: Request Review Prompt Authority Path Detection Rule

`src/prompts/request-review-system.ts` に、request body 内で authority path と編集動詞（MODIFIED / ADDED / を更新 / を作成 等）が共起する場合を HIGH severity finding として検出するルールを追加する。

#### Scenario: 検出ルールが prompt に存在する
- **GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された
- **WHEN** prompt テキストを参照する
- **THEN** authority path（`specrunner/specs/<capability>/spec.md` 形式）と編集動詞の共起を HIGH finding として検出する旨のルールが含まれている

#### Scenario: referential 記述の除外節が prompt に存在する
- **GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された
- **WHEN** prompt テキストを参照する
- **THEN** authority path を policy 説明や過去事例として referential に言及する記述（「authority path であり編集禁止」のような文脈）は HIGH finding にしない旨の除外節が含まれている

### Requirement: Request Review Prompt Regression Test

`tests/unit/command/request-review.test.ts` に、`REQUEST_REVIEW_SYSTEM_PROMPT` が検出ルール本体と referential 除外節のテキストを含むことを確認する string contains assertion を追加する。

#### Scenario: 検出ルール本体の assertion が存在する
- **GIVEN** test suite が実行された
- **WHEN** `REQUEST_REVIEW_SYSTEM_PROMPT` の文字列 contains assertion を実行する
- **THEN** authority path と編集動詞共起を HIGH finding として検出する旨のテキストが含まれることを assert するテストケースが green になる

#### Scenario: referential 除外節の assertion が存在する
- **GIVEN** test suite が実行された
- **WHEN** `REQUEST_REVIEW_SYSTEM_PROMPT` の文字列 contains assertion を実行する
- **THEN** referential 記述を HIGH finding にしない旨の除外節テキストが含まれることを assert するテストケースが green になる

### Requirement: Request Review Prompt Authority Path Detection Rule

`src/prompts/request-review-system.ts` に、request body 内で authority path への言及を検出した場合に reviewer agent が intent を判定し、直接操作 intent を HIGH severity finding として検出するルールを SHALL 定義する。検出は具体的な edit verb の列挙に依存せず、agent の intent 判定に委ねる。

#### Scenario: intent 判定ベースの検出ルールが prompt に存在する

- **GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された
- **WHEN** prompt テキストを参照する
- **THEN** authority path（`specrunner/specs/<capability>/spec.md` 形式）への言及に対して intent を判定する旨のルールが含まれている
- **AND** 直接操作 intent（baseline を直接編集・書き換える意図）を HIGH finding として検出する旨が含まれている
- **AND** 具体的な edit verb 列挙（`MODIFIED` / `ADDED` / `を更新` / `を作成` 等の個別列挙）は検出条件に含まれていない

#### Scenario: referential 記述の除外節が prompt に存在する

- **GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された
- **WHEN** prompt テキストを参照する
- **THEN** authority path を参照・言及する記述（policy 説明、過去 incident 引用、forbidden 記述等）は HIGH finding にしない旨の除外節が含まれている

#### Scenario: HIGH finding の recommendation が prompt に存在する

- **GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された
- **WHEN** prompt テキストを参照する
- **THEN** 直接操作 intent 検出時の recommendation として、authority spec は finish の spec-merge が delta から自動更新すること、PR 内では baseline は read-only であること、delta spec で Requirement を書く旨のガイダンスが含まれている
