# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | medium | testing | `src/prompts/request-generate-system.ts` | TC-006（must）の unit test が未実装。`REQUEST_GENERATE_SYSTEM_PROMPT` に optional セクション案内が追加されたが、test-cases.md が must と指定するアサーションテストが存在しない | `tests/prompts/request-generate-system.test.ts` を新規作成し、(1) `現状コードの前提` が含まれること、(2) `optional` 修飾が含まれること、(3) 節を持たない入力に対して省略を案内する文言（`Omit this section entirely if no such assertions exist`）が含まれること を確認するテストを追加する | yes |
| 2 | low | architecture | `src/prompts/request-generate-system.ts` | spec.md が「必須セクション一覧に追加してはならない（MUST NOT）」と規定しているが、実装は "MUST include all of the following sections" リストの item 5 として追加している（`(optional)` 修飾付き）。design D4 が明示的にこのパターンを採用しており、LLM 動作上の問題はない | design 判断として accepted。対処不要 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 8 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 8.75

## Summary

template / design / request-review の 3 箇所への変更が整合しており、request 要件 1–3 を過不足なく実装している。`buildScaffoldTemplate()` 1 箇所の DRY 編集、既存の severity / read-only 契約を壊さない拡張、verification 全 green と品質は高い。

blocking 項目は Finding 1 のみ：test-cases.md が must と指定する TC-006（`REQUEST_GENERATE_SYSTEM_PROMPT` のアサーションテスト）が未実装。テストを追加すれば承認可能。

