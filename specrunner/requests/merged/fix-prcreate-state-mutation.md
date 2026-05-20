# PrCreateStep の state 直接ミューテーションを解消する

## Meta

- **type**: bug-fix
- **slug**: fix-prcreate-state-mutation
- **base-branch**: main

## 背景

`src/core/step/pr-create.ts:46` で `state.pullRequest` を直接変更している。他の全ステップは state を read-only として扱っており、これが唯一の immutability 違反（architect レビュー Finding #3, HIGH）。

JavaScript のオブジェクト参照によって動作しているが、`StepExecutor.finalizeStep()` がこの変更を認識しないため、persist 時に上書きされる可能性がある。

## 要件

1. `PrCreateStep.run()` から `state.pullRequest` への直接代入を除去する

2. PR 情報（url, number）を `pr-create-result.md` に記録する（現状でも記録しているか確認し、不足があれば追加する）

3. `PrCreateStep.parseResult()` が PR 情報を `ParsedStepResult` 経由で返すようにする。`ParsedStepResult` に `pullRequest?: { url: string; number: number; createdAt: string }` フィールドを追加する

4. `StepExecutor.finalizeStep()` が `ParsedStepResult.pullRequest` を検出した場合に `state.pullRequest` に反映する

## スコープ外

- PrCreateStep 以外のステップの変更
- PR 作成ロジック（`src/core/pr-create/runner.ts`）の変更
- pullRequest フィールドの state schema 変更（既存の型をそのまま使う）

## 受け入れ基準

- [ ] `PrCreateStep.run()` 内で `state` を変更していない
- [ ] pipeline 完了後の `state.pullRequest` に url と number が格納されている
- [ ] `runner.ts:172` の PR URL 表示が引き続き動作する
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
