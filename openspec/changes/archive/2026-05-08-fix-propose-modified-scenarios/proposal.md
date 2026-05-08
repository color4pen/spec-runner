## Why

`propose` ステップが delta spec を生成する際、`## MODIFIED Requirements` 配下の requirement に `#### Scenario:` を生成しない。`finish` の Phase 0 で `openspec validate` に弾かれ、手動でシナリオを追加する手戻りが発生している（PR #137 で発覚、issue #138）。原因は `src/prompts/propose-system.ts` の Delta Spec Format Rules セクションで MODIFIED にもシナリオが必須であることが明示されていないため。

## What Changes

- `src/prompts/propose-system.ts` の Delta Spec Format Rules セクションに、MODIFIED Requirements のシナリオ生成を明示する補足指示を追加
- 同ファイルの Self-review checklist に MODIFIED を明示的に言及するチェック項目を追加

## Capabilities

### New Capabilities

（なし）

### Modified Capabilities

- `propose-session`: システムプロンプトの Delta Spec Format Rules に MODIFIED Requirements のシナリオ必須指示と self-review checklist 項目を追加

## Impact

- `src/prompts/propose-system.ts`: プロンプト文字列の修正のみ
- propose agent の出力品質が向上し、MODIFIED requirement のシナリオ欠落による validation failure が解消される
- コードロジック・API・依存関係への影響なし
