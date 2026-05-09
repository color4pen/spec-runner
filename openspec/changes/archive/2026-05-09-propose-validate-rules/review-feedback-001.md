# Code Review Feedback — propose-validate-rules (Iteration 1)

- **verdict**: approved
- **iteration**: 1
- **date**: 2026-05-09
- **type**: bug-fix

## Summary

変更は `src/prompts/propose-system.ts` の 4 行追記のみ。ルールセクション（L104-127）にルール 5, 6 を追加し、Self-review checklist（L137-143）に対応する 2 項目を追加。既存テキストの変更なし。request の要件 3 件のうち「各 requirement に最低 1 つの Scenario」は既にルール 2（L107）で記載済みのため追加不要という判断は正確。typecheck・テストスイート（134 files, 1320 tests）ともに green。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 9 | 0.10 | 0.90 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.80** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | testing | tests/prompts/propose-system.test.ts | 新規ルール 5, 6 に対応する自動テスト（`toContain("SHALL")` 等）が未追加。現状は inspection ベースの test-cases で網羅されており blocking ではないが、将来の regression 防止には有効 | `describe` ブロックを追加し `PROPOSE_SYSTEM_PROMPT` に `SHALL` / `MUST` / `コードブロック` 関連文字列が含まれることを assert する |

## Scenario Coverage (test-cases.md)

| TC | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-01 | must | pass | ルール 5 が L128 に存在 |
| TC-02 | must | pass | ルール 6 が L129 に存在 |
| TC-03 | must | pass | チェック項目が L144 に存在 |
| TC-04 | must | pass | チェック項目が L145 に存在 |
| TC-05 | must | pass | ルール 1-4 は diff で変更なし（追記のみ） |
| TC-06 | must | pass | 既存チェック項目 5 件が L139-143 に維持 |
| TC-07 | must | pass | typecheck green（verification-result.md） |
| TC-08 | must | pass | 1320 tests passed（verification-result.md） |
| TC-09 | should | pass | ルール番号 1-6 が連番 |
| TC-10 | should | pass | ルール 5 に「normative keyword なしは validation error」の説明あり |

## Security

セキュリティ影響なし。変更対象は system prompt の静的文字列のみ。prompt injection 対策（`<user-request>` タグ + CRITICAL BOUNDARY セクション）に影響しない。
