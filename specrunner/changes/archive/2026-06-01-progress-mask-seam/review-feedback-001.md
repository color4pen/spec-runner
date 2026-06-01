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

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | medium | testing | tests/unit/architecture/core-invariants.test.ts | T-04 regression guard に B-7 用の synthetic injection test が 2 件欠落。test-cases.md TC-020（seam exemption が機能する）と TC-021（raw write が violation として検出される）はいずれも must 優先度だが未実装。B-6 は "detects new raw process.env…" と "does not flag…stripSecrets seam" の 2 件が対称に存在するのに対し、B-7 は 0 件。maskSensitive 除外ロジックが誤って削除されても T-04 では検出されない。 | T-04 describe block に以下 2 件を追加する: (1) `src/cli/` の raw `process.stderr.write("output")` を注入データとして filterViolations に渡し violations.length === 1 を assert（TC-021 対応）; (2) `maskSensitive(process.stderr.write("output"))` を含む注入データが `!m.content.includes("maskSensitive")` フィルタで除外され candidates が 0 件になることを assert（TC-020 対応）。B-6 の既存ガードと同構造で実装可。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 5 | 0.10 |

- **total**: 8.95

## Summary

実装は全受け入れ基準を満たしている。

- `progress.ts` の全 16 箇所の `process.stderr.write` が `maskSensitive` でラップされており、raw write は 0 件（grep 確認済み）。
- B-7 test が `src/core/` + `src/cli/` の両方を走査し、`maskSensitive` 含む行を seam 準拠として除外する D2 パターンが正確に実装されている。
- describe 名も cli/ スコープ拡張を反映した名称に更新済み。
- verification（build / typecheck / lint / test 287 files）全て green。

唯一の問題は T-04 regression guard の B-7 対応分が欠落していること。B-6 は seam exemption guard と raw violation guard の 2 件が対称に存在するが、B-7 は 0 件。test-cases.md の TC-020・TC-021 はともに must 優先度であり、未実装は検出機構の regression 耐性を弱める。実装自体は正しいため fix は軽微（T-04 に 2 件追加するのみ）。
