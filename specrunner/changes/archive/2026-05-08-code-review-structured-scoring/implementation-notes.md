# Implementation Notes — code-review-structured-scoring

- **result**: completed
- **tasks_completed**: 16/16

## Files Modified

| File | Operation | Summary |
|------|-----------|---------|
| `src/core/parser/review-scores.ts` | created | `ReviewScores` interface と `parseReviewScores()` の実装。`## Scores` セクションのテーブルと `- **total**: <n>` 行を parse する |
| `src/core/parser/review-findings.ts` | created | `FindingSeverityCounts` interface と `parseFindingSeverityCounts()` の実装。`## Findings` テーブルの Severity 列を case-insensitive でカウントする |
| `src/core/step/types.ts` | modified | `ReviewScores` と `FindingSeverityCounts` を import し、`ParsedStepResult` に optional `scores` フィールドを追加 |
| `src/core/step/code-review.ts` | modified | `parseReviewScores` / `parseFindingSeverityCounts` を import。`determineVerdict()` 非公開関数を追加。`parseResult()` を拡張してスコアパースと CLI verdict 判定を行う |
| `src/prompts/code-review-system.ts` | modified | Output Format セクションに `## Scores` テーブルフォーマット例と説明を追加 |
| `tests/unit/parser/review-scores.test.ts` | created | `parseReviewScores` のユニットテスト（11 テスト） |
| `tests/unit/parser/review-findings.test.ts` | created | `parseFindingSeverityCounts` のユニットテスト（8 テスト） |
| `tests/unit/step/code-review-verdict.test.ts` | created | `determineVerdict` と `parseResult` の統合テスト（14 テスト） |

## Blocked Tasks

なし

## Notes

- `ParsedStepResult.scores` の型は tasks.md の `{ criticalCount; highCount }` から設計書 D2 の `Pick<FindingSeverityCounts, "critical" | "high">` へ変更した。フィールド名を `criticalCount` / `highCount` ではなく `critical` / `high` にそろえることで `FindingSeverityCounts` との一貫性を保つ
- 全テスト（1235）が pass、typecheck も green
