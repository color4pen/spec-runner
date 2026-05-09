# Proposal: PrCreateStep の state 直接ミューテーション解消

## Why

`PrCreateStep.run()` は `state.pullRequest` を直接変更している（L47）。他の全ステップは `ParsedStepResult` 経由で情報を返し、`StepExecutor.finalizeStep()` が immutable な spread で state を更新する設計になっている。PrCreateStep だけがこの規約に違反しており:

1. `pushStepResult()` が新しい state オブジェクトを返した後、古いオブジェクトへの mutation が残る
2. `finalizeStep()` が `pullRequest` の存在を認識しない — persist 時に上書きされる理論的リスクがある
3. コードベースの immutability 契約が破綻している

## What Changes

- `ParsedStepResult` に `pullRequest` optional フィールドを追加
- `PrCreateStep.parseResult()` が `pr-create-result.md` から PR 情報を抽出して `ParsedStepResult.pullRequest` に格納
- `PrCreateStep.run()` から `state.pullRequest` への直接代入を除去
- `StepExecutor.finalizeStep()` が `ParsedStepResult.pullRequest` を検出した場合に `state = { ...state, pullRequest }` で反映

## Capabilities

### Modified Capabilities

- **ParsedStepResult**: `pullRequest?: { url: string; number: number; createdAt: string }` フィールド追加
- **PrCreateStep.parseResult()**: PR URL と number を result file から抽出
- **PrCreateStep.run()**: state mutation を除去。result file への書き込みのみ担当
- **StepExecutor.finalizeStep()**: pullRequest フィールドの state 反映ロジック追加

## Impact

- `src/core/step/types.ts` — `ParsedStepResult` 型拡張
- `src/core/step/pr-create.ts` — run() から mutation 除去、parseResult() に PR 情報抽出追加
- `src/core/step/executor.ts` — finalizeStep() に pullRequest 反映ロジック追加
- `tests/unit/step/pr-create.test.ts` — TC-013, TC-015 を parseResult 経由のテストに変更
