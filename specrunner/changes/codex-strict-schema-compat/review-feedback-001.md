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
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | medium | testing | `tests/adapter/codex/strict-schema.test.ts` | TC-008（must 優先度）の AND 節が未カバー。zod/v4-mini は nested `object()` にも `additionalProperties: false` を生成するが、findings items での保持確認アサーションがない。top-level のみテスト済み（line 117–119）。 | 既存の `"additionalProperties: false is preserved at top-level"` テストに `findings["items"]["additionalProperties"]` が `false` であるアサーションを追加する。`const items = (strict["properties"] as R)["findings"]!["items"] as R; expect(items["additionalProperties"]).toBe(false);` | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 9.45

## Summary

実装は設計（design.md D1–D5）に忠実で、受け入れ基準 AC1–AC4 はすべて充足している。

- `toOpenAIStrictSchema` の再帰走査順序（先に再帰→後に nullable 化）が正しく、findings items の strict 化（`line` が required 追加 + nullable）が動作することを実測で確認した。
- `stripNullDeep` + parse の等価性テストは `parseBaseReportInput` / `parseJudgeReportInput` の両方でカバーされており、`line: null` の findings ケースも含めて網羅されている。
- `toCustomToolSpec` 不変ガードテストが正しく機能しており、codex 変換が Claude 側に漏れないことの回帰検知が確立されている。
- `reportTool` 未設定時の既存挙動（`outputSchema` を渡さない）は `agent-runner.test.ts` で TC-012 相当として検証済み。

唯一の指摘は test-cases.md に `must` 優先度として明示されている TC-008 の AND 節（findings items に `additionalProperties: false` が保持されること）が未アサートである点。実装は正しいが、アサーションの追加で補完が必要。
