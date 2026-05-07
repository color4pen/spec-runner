# Code Review — add-spec-change-to-allowed-types (Iteration 1)

- **verdict**: approved

## Summary

TYPE_CONFIG を single source of truth として 5 type を集約し、branch prefix・spec-review mode・ALLOWED_TYPES・BRANCH_PREFIXES を全て TYPE_CONFIG から導出する変更。設計が request.md の要件に忠実で、既存パターン（step 層が config を解決し prompt 層に渡す）に従っている。typecheck green、1067 tests all pass。

## Scores

| Category | Score | Comment |
|----------|-------|---------|
| correctness | 9 | 5 type 定義、fallback、branch prefix 解決、specReviewMode 注入すべて仕様通り |
| security | 8 | セキュリティ面の変更なし。unknown type の graceful degradation は適切 |
| architecture | 9 | TYPE_CONFIG → helper functions → step 層 → prompt 層の依存方向が明確。prompt が config を直接 import しない設計判断が正しい |
| performance | 8 | 変更なし。`Object.values().map()` は module load 時 1 回のみ |
| maintainability | 8 | ヘルパー関数で accessor を提供。将来の field 追加（adrRequired, weights）に対して開放 |
| testing | 7 | type-config.test.ts が全 type + fallback を網羅。parser.test.ts が spec-change/refactoring の warning 不在を検証 |

**Total**: 9×0.30 + 8×0.25 + 9×0.15 + 8×0.10 + 8×0.10 + 7×0.10 = 2.70 + 2.00 + 1.35 + 0.80 + 0.80 + 0.70 = **8.35**

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/unit/step/review-exit-contract.test.ts:335 | `buildSpecReviewInitialMessage` の既存テストが `specReviewMode` を渡しておらず、`{{SPEC_REVIEW_MODE}}` の置換結果（full/lightweight の指示文）を assert していない。デフォルト "full" で動作するが、lightweight 分岐のテストがない | `specReviewMode: "lightweight"` を渡すケースを追加し、出力に "Architecture and specification review only" が含まれることを assert する |
| 2 | LOW | maintainability | src/config/type-config.ts:21 | `TYPE_CONFIG` の型が `Record<string, TypeConfigEntry>` のため、typo で存在しない key にアクセスしても型エラーにならない。`as const satisfies` パターンで key を literal union にすると型安全性が向上する | 将来の拡張時に検討。現時点では helper 関数経由のアクセスで実害なし |
| 3 | LOW | consistency | src/core/step/spec-review.ts:88 | `specReviewMode` の解決元が `state.request.type` だが、propose.ts/executor.ts は `deps.request.type` を使用。同じ値を指すが参照パスが異なる | spec-review.ts の既存パターン（line 82 で `state.request.type` を使用）に従っているため整合的。変更不要 |

## Iteration Comparison

N/A（Iteration 1）
