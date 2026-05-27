# Code Review Feedback — iteration 001

- **verdict**: approved
- **iteration**: 1

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | testing | tests/unit/adapter/github/github-client-request.test.ts | TC-RC-010 の sleepFn 呼び出し回数アサーションが未実装。test-cases.md (must) に「sleepFn は 5 回呼ばれる」と明記されているが、TC-RC-010 テストに `expect(sleepFn).toHaveBeenCalledTimes(5)` が存在しない（TC-RC-009 には存在する） | TC-RC-010 テストに `expect(sleepFn).toHaveBeenCalledTimes(5)` を追加する | no |
| 2 | LOW | testing | tests/unit/adapter/github/github-client-request.test.ts | TC-RC-014 (should: attempt429 と attempt5xx が独立) が未実装。503×2 → 429×1 → 200 のシーケンスでカウンタ干渉なしを確認するシナリオ | `describe("TC-RC-014: ...")` ブロックを追加する | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 8 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.85

## Summary

`MAX_429_RETRIES = 5` による単一カウンタ設計は design.md の決定と完全に一致しており、429 / rate-limit 両パスで正しく上限チェック・throw が実装されている。verification も全 3135 テスト green。指摘 2 件はいずれも既存動作をカバーする追加アサーション／追加テストであり、この PR でのブロック要因にはならない。
