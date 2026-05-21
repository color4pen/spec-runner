## Requirements

### Requirement: implementer は test 関数名または comment に TC ID を記載する

implementer system prompt は MUST 「test 関数名または直前の comment に対応 TC ID（例: `TC-001`）を必ず記載する」旨を明示する。TC ID の記載は verification step の test-coverage phase が grep で機械的に検証するため、省略は禁止される。

記載例: `it("TC-070: Agent 定義ハッシュ — 同一定義は同一ハッシュ", ...)`

暗黙的なスキップの禁止: must TC を実装しない場合は既存の `test_cases_skipped` フォーマットで明示的に報告する。TC ID を test code に書かずに暗黙的に省略することは許容しない。

#### Scenario: implementer prompt に TC ID 規律が含まれる

- **WHEN** `IMPLEMENTER_SYSTEM_PROMPT` を inspect する
- **THEN** TC ID を test 関数名 / comment に記載する旨の指示が含まれる
- **AND** `TC-` を含む例示が含まれる

#### Scenario: must TC の暗黙スキップ禁止が明記されている

- **WHEN** `IMPLEMENTER_SYSTEM_PROMPT` を inspect する
- **THEN** TC ID 不記載による暗黙スキップを禁止する旨が含まれる
