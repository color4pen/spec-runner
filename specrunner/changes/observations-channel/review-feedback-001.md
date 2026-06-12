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
| 1 | low | testing | `tests/adapter/codex/strict-schema.test.ts` | TC-018 (must) 未カバー: `REPORT_TOOL` / `PRODUCER_REPORT_TOOL` の schema に `observations` が含まれないことを assert するテストがない。実装は正しいが回帰検出ができない。 | PRODUCER_REPORT_TOOL の strict schema テストセクションに `expect(required).not.toContain("observations")` を追加する。 | yes |
| 2 | low | testing | `src/core/port/report-result.ts` + `tests/unit/core/port/report-result-observations.test.ts` | TC-015 (should) 部分未カバー: `parseObservations` は `line: null` を `{ ok: false }` で返すが TC-015 は `ok: true` を期待している。テストも存在しない。codex path は `stripNullDeep` で null を除去するため runtime 上の実害はないが、仕様と実装の乖離がテストで固定されていない。 | 修正案A: `parseObservations` の line チェックで `null` を許容する（`o["line"] !== null` 条件を追加）。修正案B: 現挙動のまま「codex 経由では stripNullDeep 後に ok: true」をテストで固定する。対称性のため修正案A を推奨。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 9.25

## Summary

受け入れ基準の全 must 項目（verdict 不変・fixer 非混入・ledger 非混入・後方互換・5 prompt 同梱・typecheck+test green）を実装・テストともに満たしている。アーキテクチャ設計（別チャネル分離・best-effort silent-ignore・findings 契約不変）は正確に実現されており、D5 の不変条件テストも正しく配置されている。

2 件は testing カテゴリの low/fixable のみ: TC-018 の producer 系 tool observations 不在テスト欠落（must）と TC-015 の `line: null` 仕様・実装乖離（should）。

