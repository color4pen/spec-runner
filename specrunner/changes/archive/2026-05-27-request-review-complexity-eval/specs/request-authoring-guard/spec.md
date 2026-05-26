## Requirements

### Requirement: Request Review Prompt Complexity Evaluation Perspectives

`src/prompts/request-review-system.ts` の review process に、複雑化リスク評価の Step を SHALL 追加する。この Step は以下の 3 観点を含む:
- Complexity risk: 提案が既存アーキテクチャをどの程度複雑にするか
- DRY violation: 既存の類似機構との重複がないか
- Existing asset reuse: 既に実装済みの仕組みで要件を満たせないか

#### Scenario: 3 観点が prompt に存在する

- **GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された
- **WHEN** prompt テキストを参照する
- **THEN** "Complexity risk" を含む評価観点が含まれている
- **AND** "DRY violation" を含む評価観点が含まれている
- **AND** "Existing asset reuse" を含む評価観点が含まれている

### Requirement: Request Review Prompt Multi-Approach Recommendation Rule

`src/prompts/request-review-system.ts` に、複数の設計アプローチを検出した場合に推奨案 1 つを根拠付きで提示する instruction を SHALL 追加する。並列列挙を禁止し、最終判断は request 作成者に委ねる旨を明示する。

#### Scenario: 推奨提示ルールが prompt に存在する

- **GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された
- **WHEN** prompt テキストを参照する
- **THEN** 複数アプローチ検出時に推奨案 1 つを提示する instruction が含まれている
- **AND** 並列列挙を禁止する旨が含まれている
- **AND** 最終判断は request 作成者に委ねる旨が含まれている

#### Scenario: findings severity が MEDIUM に制限される

- **GIVEN** `REQUEST_REVIEW_SYSTEM_PROMPT` が生成された
- **WHEN** prompt テキストを参照する
- **THEN** complexity evaluation の findings severity 上限が MEDIUM である旨が含まれている
