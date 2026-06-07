# `as StepName` の force cast を validated cast に置き換える

## Meta

- **type**: refactoring
- **slug**: stepname-open
- **base-branch**: main
- **adr**: false

## 背景

`StepName` は固定の string literal union 型で、動的に決まる step 名を代入する際に `as StepName` で force cast している箇所が 7 箇所ある。force cast は型チェックをすり抜けるため、step 名の追加・変更時に不正な値が compile error にならない。

該当箇所（8箇所）：
- `pipeline.ts`: 3 箇所（resumePoint.step 記録、handleExhausted の resumeStep 導出）
- `resolve-step.ts`: 1 箇所（`--from` の step 名直接指定）
- `managed.ts`: 1 箇所（signal handler の resumePoint 記録）
- `local.ts`: 1 箇所（signal handler の resumePoint 記録）
- `resume.ts`: 1 箇所（startStepForCheck のキャスト）
- `executor.ts`: 1 箇所（timeout 時の resumePoint 記録）

## 要件

1. `toStepName(name: string): StepName` を復活させる（runtime validation 付き、不正な step 名で throw）。
2. 上記 8 箇所の `as StepName` を `toStepName()` 呼び出しに置き換える。
3. `StepName` 型自体は変更しない（string literal union を維持）。

## スコープ外

- `StepName` を open な `string` 型に変更する（汎用パイプライン化は別 request）
- step 名の追加・削除
- `job-state-store.ts:674` の `(validated.step ?? "init") as StepName`。`"init"` は StepName に含まれない特殊値（journal 復元時のフォールバック）であり、`toStepName` の単純置換では壊れる。別途対処する。

## 受け入れ基準

- [ ] 上記 8 箇所から `as StepName` が消え、`toStepName()` に置き換わっている
- [ ] `job-state-store.ts` の 1 箇所はスコープ外として残存を許容する
- [ ] 不正な step 名を `toStepName` に渡すと実行時エラーになる
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- `toStepName` は resume-simplify で削除されたが、pipeline / runtime の cast 箇所には依然必要。`resolve-step.ts` に再配置するか、`step-names.ts` に置くかは設計フェーズで判断。
