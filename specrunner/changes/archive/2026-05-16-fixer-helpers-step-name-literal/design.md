# Design: fixer-helpers-step-name-literal

## Overview

`src/core/step/fixer-helpers.ts:54` のローカル定数 `STEP_NAMES_BUILD_FIXER = "build-fixer"` を削除し、既に import 済みの `STEP_NAMES.BUILD_FIXER` に置き換える。

## Motivation

- `step-names.ts` が step name の Single Source of Truth として機能しているが、この 1 箇所だけリテラルで重複定義されている
- step name を rename した場合、`FIXER_STEP_NAMES`（L13-17）は `STEP_NAMES` 経由で連動するが、L54 は取り残される
- PR #233 の code-review で 2 回指摘されたが未対応

## Design Decisions

### 1. ローカル定数を削除して直接参照に変更

**選択肢 A**: ローカル定数の代入元を変更（`const STEP_NAMES_BUILD_FIXER = STEP_NAMES.BUILD_FIXER`）
**選択肢 B**: ローカル定数を削除し、使用箇所で `STEP_NAMES.BUILD_FIXER` を直接参照 ✓

B を選択。ローカル定数にエイリアスを持つ意味がない（同ファイルで既に `STEP_NAMES` を import 済み、他箇所は直接参照している）。

### 2. 挙動変更なし

`STEP_NAMES.BUILD_FIXER` の値は `"build-fixer"` であり、削除する定数と同値。ランタイムの挙動は一切変わらない。

## Affected Files

| File | Change |
|------|--------|
| `src/core/step/fixer-helpers.ts` | L54 の定数削除 + L55-56 の参照を `STEP_NAMES.BUILD_FIXER` に変更 |

## Risks

なし。値が同一であり、型も `string` リテラル比較のまま。
