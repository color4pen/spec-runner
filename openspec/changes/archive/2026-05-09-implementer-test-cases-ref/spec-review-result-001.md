# Spec Review Result — implementer-test-cases-ref

- **iteration**: 1
- **verdict**: approved
- **date**: 2026-05-09

## Summary

proposal / design / tasks の 3 ファイルが request.md の要件を網羅しており、既存 implementer prompt と openspec-workflow の参照元との差分も正確に把握されている。設計判断は妥当で、実装リスクは極めて低い（prompt テキスト追加のみ）。

## Acceptance Criteria Mapping

| # | Acceptance Criterion | Covered By | Status |
|---|---------------------|------------|--------|
| 1 | implementer の system prompt に test-cases.md 参照指示が含まれている | Task 1.1 | covered |
| 2 | must シナリオの実装義務が明示されている | Task 1.2 | covered |
| 3 | 未実装ケースの報告フォーマットが定義されている | Task 1.3, Design D3 | covered |
| 4 | test-cases.md 非存在時のフォールバックが記載されている | Task 1.4, Design D2 | covered |
| 5 | `bun run typecheck && bun run test` が green | Task 2.1, 2.2 | covered |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | tasks.md:5 | Design D3 は `test_cases_skipped` の出力先を「commit message や session output」と記述するが、Task 1.3 は「commit message に含める」のみ。session output への言及が落ちている | Task 1.3 の記述を「commit message または session output に含める指示」に合わせるか、design 側を commit message のみに限定する |
| 2 | LOW | consistency | design.md:39-43 | openspec-workflow の参照元では `test_cases_skipped` は構造化された戻り値（会話出力）に配置されるが、本 spec では commit message に配置。spec-runner の implementer に構造化戻り値がないため妥当な適応だが、将来 implementation-notes.md 導入時に再検討が必要 | 現時点では対応不要。design.md の Non-Goals に「implementation-notes.md の導入（別 change）」が明記済み |

## Design Decisions Evaluation

| Decision | Assessment |
|----------|-----------|
| D1: 既存セクション拡張 | 妥当。新セクション追加より認知負荷が低い |
| D2: 条件分岐（存在する場合のみ） | 妥当。test-case-gen は optional ステップであり必須化できない |
| D3: openspec-workflow 準拠フォーマット | 妥当。一貫性確保の観点で正しい選択 |

## Security

セキュリティ影響なし。変更は AI エージェントの system prompt テキスト追加のみで、認証・入力検証・API・DB 操作に関わらない。
