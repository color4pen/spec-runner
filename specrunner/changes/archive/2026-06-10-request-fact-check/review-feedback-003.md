# Code Review Feedback — iteration 003

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
- **iteration**: 003

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | testing | `src/prompts/request-generate-system.ts` | TC-006（must）の unit test が iteration 003 も未実装。`REQUEST_GENERATE_SYSTEM_PROMPT` に `## 現状コードの前提` optional 案内が追加済みだが、`tests/prompts/request-generate-system.test.ts` が存在しない。受け入れ基準「テンプレート出力のテスト（既存 snapshot / golden 形式）が更新されている」および spec の Requirement「request-generate は任意節として案内する」に対するテストが欠落 | `tests/prompts/request-generate-system.test.ts` を新規作成し、(1) `現状コードの前提` が含まれること、(2) `optional` を示す表現が含まれること、(3) `Omit this section entirely if no such assertions exist` 相当の省略案内が含まれること、(4) 必須セクションリスト（`MUST include all of the following sections`）に `現状コードの前提` が含まれないこと を確認するテストを追加する | yes |

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

実装の品質は高い。`buildScaffoldTemplate()` の 1 箇所 DRY 編集、design / request-review 両 prompt への工程追加、既存の severity / read-only 契約を壊さない拡張、verification 全 green（build / typecheck / test / lint）、request-review / design の content assertion テストはすべて正常。

blocking 項目は Finding 1 のみ：iterations 001, 002 で同じ指摘が継続しており、今回も `tests/prompts/request-generate-system.test.ts` が存在しない。TC-006 は test-cases.md で must 分類、spec.md の Requirement「request-generate は「現状コードの前提」を任意節として案内する」に直接対応するテストである。このテストを追加すれば承認可能。

