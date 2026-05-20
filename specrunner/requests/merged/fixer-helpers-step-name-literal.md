# fixer-helpers.ts の STEP_NAMES_BUILD_FIXER リテラルを定数参照に置き換える

## Meta

- **type**: refactoring
- **slug**: fixer-helpers-step-name-literal
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen
- **issue**: #234

## 背景

`src/core/step/fixer-helpers.ts:54` で `STEP_NAMES_BUILD_FIXER = "build-fixer"` がリテラル文字列で定義されている。同ファイル冒頭で `import { STEP_NAMES } from "./step-names.js"` 済みであり、`FIXER_STEP_NAMES` (L15) は `STEP_NAMES.BUILD_FIXER` を経由しているが、ここだけリテラル。

PR #233 の code-review feedback-001 / feedback-002 で 2 回指摘されたが取り残された箇所。step name を rename した場合に `FIXER_STEP_NAMES` 側は連動するが、この箇所は取り残されて `buildContinuationMessage` の分岐が壊れる構造。

関連 issue: #234

## 目的

リテラル文字列を `STEP_NAMES.BUILD_FIXER` の参照に置き換え、step name の Single Source of Truth を `step-names.ts` に統一する。

## 設計判断

1. **挙動変更なし**: 値は `"build-fixer"` 文字列で同一。型と参照経路が変わるだけ
2. **ローカル定数を削除**: `STEP_NAMES_BUILD_FIXER` 自体を削除し、参照箇所を `STEP_NAMES.BUILD_FIXER` に置換 (定数を残す意味がない)

## 要件

### 1. ローカル定数の削除

`src/core/step/fixer-helpers.ts:54` の `const STEP_NAMES_BUILD_FIXER = "build-fixer";` を削除する。

### 2. 参照箇所の置換

`buildContinuationMessage` 内の `opts.stepName === STEP_NAMES_BUILD_FIXER` を `opts.stepName === STEP_NAMES.BUILD_FIXER` に置換する。

### 3. test

既存 test (`buildContinuationMessage` 系) が変更なしで pass することを確認する。新規 test は不要。

## スコープ外

- `fixer-helpers.ts` 内の他のリテラル整理 (本 request は #234 で指摘された 1 箇所のみ)
- `STEP_NAMES` 自体の構造変更

## 受け入れ基準

- [ ] `src/core/step/fixer-helpers.ts` から `STEP_NAMES_BUILD_FIXER` リテラル定数が削除されている
- [ ] 参照箇所が `STEP_NAMES.BUILD_FIXER` 経由になっている
- [ ] `grep -rn "STEP_NAMES_BUILD_FIXER" src/` が 0 件
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
