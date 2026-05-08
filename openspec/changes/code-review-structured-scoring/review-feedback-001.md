# Code Review Feedback — iteration 001

- **verdict**: approved
- **iteration**: 1

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | src/core/step/types.ts:35 | request.md は `criticalCount` / `highCount` を指定しているが、実装は `Pick<FindingSeverityCounts, "critical" \| "high">` で `critical` / `high` を使用。型的には改善（既存型の再利用）だが、spec と field 名が乖離している | design.md の D2 セクションを実装に合わせて更新するか、次回 spec-change 時に spec 側を正規化する |
| 2 | LOW | correctness | src/core/parser/review-scores.ts:39 | total 行の regex `\*{0,2}total\*{0,2}` が開き/閉じの `*` 数を独立に許容するため `*total` や `total**` にもマッチする | `(?:\*{2}total\*{2}|total)` に限定すれば厳密になるが、実害なし。現状維持で可 |
| 3 | LOW | correctness | src/core/parser/review-findings.ts:82-85 | separator 行の検出が `dataStarted` フラグで「header 直後の最初の `\|` 行を無条件スキップ」する方式。separator がない不正 markdown だと最初のデータ行が消失する | 標準 markdown は separator 必須のため実害なし。防御的にするなら `/-+/` パターンで separator を検出する方法がある |
| 4 | LOW | maintainability | src/core/parser/review-scores.ts:67-79 | `inTable` / `headerParsed` / `separatorParsed` の 3 フラグによる状態遷移が findings パーサーの `headerRowIndex` + `dataStarted` 方式と異なる。同じ markdown テーブルパースで 2 つのパターンが混在している | 将来テーブルパーサーを共通化する際に統一する候補。現時点では各パーサーが独立テスト済みのため許容 |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 8 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.35

## Summary

要件通りの構造化スコアリングが実装されている。`determineVerdict()` の「厳しい方を採用」ロジック、escalation の伝播、スコアなし時のフォールバックが全てテストで検証済み。パーサーの責務分離（review-scores.ts / review-findings.ts / review-verdict.ts）も clean。128 テストファイル 1235 テスト全 pass、typecheck green。request.md の `criticalCount`/`highCount` と実装の `critical`/`high` の naming 差異は spec 側の更新で解消可能。
