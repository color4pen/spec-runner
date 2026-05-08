## Why

現在の code-review は agent が verdict 文字列を自己申告し、`parseReviewVerdict()` が正規表現で抽出するだけで CLI 側の検証がない。agent が甘い評価をした場合にそのまま通過するリスクがある。openspec-workflow の review-integrator はカテゴリ別スコア × weight の加重合計 + severity ゲートで verdict を構造的に決定しており、同等のロジックを CLI に持たせることで品質ゲートが構造的に機能する。

## What Changes

- code-review system prompt の出力フォーマットにスコアテーブル（Scores セクション）を追加
- `src/core/parser/review-scores.ts` を新設し、スコアテーブルのパース機能を実装
- `src/core/parser/review-findings.ts` を新設し、Findings テーブルから CRITICAL/HIGH の件数を抽出
- `ParsedStepResult` に optional な `scores` フィールドを追加
- `CodeReviewStep.parseResult()` でスコア抽出 → CLI 側 verdict 判定を実装
- agent verdict と CLI verdict の乖離時に厳しい方を採用するロジックを追加

## Capabilities

### New Capabilities

- **review-scores parser**: スコアテーブル（Category / Score / Weight）のパース、加重合計の計算
- **review-findings parser**: Findings テーブルから severity 別の件数カウント
- **CLI verdict determination**: 加重合計 + severity カウントに基づく構造的 verdict 判定

### Modified Capabilities

- `step-execution-architecture`: `ParsedStepResult` に `scores` optional フィールドを追加
- `code-review system prompt`: 出力フォーマットに Scores テーブルを追加
- `CodeReviewStep.parseResult()`: スコア抽出 → CLI verdict 判定を追加（スコアがない場合は既存の挙動を維持）

## Impact

- **src/prompts/code-review-system.ts**: Scores テーブルの出力フォーマットを追加
- **src/core/parser/review-scores.ts**: 新規。スコアテーブルパーサー
- **src/core/parser/review-findings.ts**: 新規。Findings severity カウンター
- **src/core/step/types.ts**: `ParsedStepResult` に `scores` optional フィールド追加、`ReviewScores` interface 追加
- **src/core/step/code-review.ts**: `parseResult()` にスコアベース verdict 判定を追加
- **tests/unit/parser/review-scores.test.ts**: 新規
- **tests/unit/parser/review-findings.test.ts**: 新規
- **tests/unit/step/code-review-verdict.test.ts**: 新規。CLI verdict 判定のテスト
