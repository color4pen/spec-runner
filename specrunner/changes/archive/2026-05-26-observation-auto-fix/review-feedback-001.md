# Code Review Feedback — iteration 1

- **verdict**: approved
- **iteration**: 1

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | testing | tests/unit/pipeline/transition-when.test.ts | TC-19/TC-20 (must) の `when` predicate が未テスト。`code-fixer --approved→ delta-spec-validation` の条件評価を `approved-with-fixes` state で直接評価するテストがない。`TC-WHEN-02` の行数チェックだけで predicate の真偽を確認していない | `transition-when.test.ts` に `code-fixer when predicate: approved-with-fixes state → true / needs-fix state → false` の 2 ケースを追加する | yes |
| 2 | LOW | testing | tests/unit/parser/review-findings.test.ts | `parseFixableFindings()` に直接ユニットテストが存在しない。TC-01〜TC-04 (must) の各ケースが `code-review-verdict.test.ts` 経由の間接的なカバーに留まる | `review-findings.test.ts` に `parseFixableFindings` の直接テスト (TC-01: yes 2件/no 1件→2、TC-02: 全 no→0、TC-03: Fix カラムなし→0、TC-04: section なし→0) を追加する | yes |
| 3 | LOW | consistency | src/prompts/fragments.ts | `PIPELINE_RULES` の Verdict 表が `approved-with-fixes` を含まない。エージェントはこの表を参照して verdict を選ぶが、`approved-with-fixes` が選択肢にないため記述として不整合。ただし agent が書く verdict 行は `approved` のままであり CLI が変換する設計なので実害はない | Verdict 表のフッターまたは注釈として「CLIが `Fix: yes` finding を検出した場合、`approved` を `approved-with-fixes` に昇格させる（エージェントは `approved` を記述してよい）」を追記するか、または変更しない（agent 側 verdict 値は `approved` で正しいため）。design 判断を仰ぐ | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 8.8

## Summary

実装は設計 (design.md) と完全に整合し、受け入れ基準をすべて充足している。`parseFixableFindings`・`approved-with-fixes` verdict・transition table 拡張・プロンプト更新のいずれも正しく実装されており、`bun run typecheck && bun run test` (2964 tests) が green。Finding #1 と #2 は `must` シナリオ (TC-01〜TC-04, TC-19, TC-20) のテストギャップであり、fixer で解消すること。Finding #3 は実害なしの一貫性指摘で fixer 不要。
