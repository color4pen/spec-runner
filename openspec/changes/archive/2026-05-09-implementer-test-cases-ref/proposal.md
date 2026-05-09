## Why

test-case-gen ステップで生成された `test-cases.md` を implementer が参照していない。openspec-workflow の implementer agent には TDD アプローチ（must テストケースの全実装、GIVEN/WHEN/THEN 変換、未実装ケースの報告）が明示されているが、spec-runner の `IMPLEMENTER_SYSTEM_PROMPT` には「TDD: テストを先に書く」としか記載されておらず、test-cases.md の存在自体が認知されない。

結果として test-case-gen が生成したシナリオが実装時に無視され、code-review の testing カテゴリ（Scenario Coverage）で低スコアになる。

## What Changes

`src/prompts/implementer-system.ts` の `IMPLEMENTER_SYSTEM_PROMPT` に以下を追加する:

- test-cases.md の読み込み指示（コンテキスト読み込みセクション）
- must シナリオのテスト実装義務
- GIVEN/WHEN/THEN からテストコードへの変換指示
- 実装不可なケースの報告フォーマット（`test_cases_skipped`）
- test-cases.md 非存在時のスキップ規定

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `implementer-session`: system prompt に test-cases.md 参照指示を追加。テストケースの実装義務と未実装ケースの報告フォーマットを仕様化

## Impact

- `src/prompts/implementer-system.ts`: prompt テキストの追加のみ。型変更・ロジック変更なし
