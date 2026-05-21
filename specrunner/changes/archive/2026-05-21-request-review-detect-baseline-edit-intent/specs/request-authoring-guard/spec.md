## Requirements

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

