# Code Review Feedback — iteration 002

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
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | testing | `src/prompts/request-generate-system.ts` | TC-006（must）の unit test が未実装。`REQUEST_GENERATE_SYSTEM_PROMPT` に `## 現状コードの前提` の optional 案内が追加されているが、test-cases.md が must 指定するアサーションテストが存在しない。機能要件のカバレッジ欠落に相当する | `tests/prompts/request-generate-system.test.ts` を新規作成し、(1) `現状コードの前提` が含まれること、(2) `optional` を示す表現が含まれること、(3) `Omit this section entirely if no such assertions exist` 相当の省略案内が含まれること、(4) 必須セクションリスト（MUST include all）に `現状コードの前提` が含まれないこと を確認するテストを追加する | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 5 | 0.10 |

- **total**: 8.80

## Summary

iteration 001 の finding #2（optional 修飾付き追加）は design D4 の承認済み判断であり、今回の finding から除外した。

blocking 項目は Finding 1 のみ：test-cases.md が must と指定する TC-006（`REQUEST_GENERATE_SYSTEM_PROMPT` のアサーションテスト）が iteration 002 でも未実装。前回 medium として報告したが、must テストの欠落は機能要件カバレッジの欠如に相当するため high に引き上げる。`tests/prompts/request-generate-system.test.ts` を追加すれば承認可能。
