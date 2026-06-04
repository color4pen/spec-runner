# Code Review Feedback — iteration 001

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | testing | tests/ (absent) | TC-021（must）と TC-022（must）が未実装。executor が `validateStepInputs` 失敗時に `runner.run()` / `step.run()` の前で停止し、`recordFailedStepResult` + `store.fail` + `step:error` emit が行われることを検証するテストが存在しない。test-cases.md の must 要件を満たしていない。 | `tests/unit/step/executor-input-validation.test.ts` を追加し、(a) AgentStep: `validateStepInputs` が reject → `runner.run()` が呼ばれない・failed StepRun が state に記録される・`step:error` が emit される、(b) CliStep: `validateStepInputs` が reject → `step.run()` が呼ばれない の2ケースをカバーする。既存の `executor.commit.test.ts` パターン（`RuntimeStrategy` mock + `StepExecutor` 直接呼び出し）を参考にする。 | yes |
| 2 | MEDIUM | correctness | src/core/step/code-fixer.ts:46, src/core/step/build-fixer.ts:46 | JSDoc コメントが旧挙動（`CODE_FIXER_NO_REVIEW_RESULT` / `BUILD_FIXER_NO_VERIFICATION_RESULT` を throw）を記述したまま残っている。tasks.md T-06 は「これらの error code がコードベースから消えている」を受け入れ基準に含む。`src/` 内のコメントが旧 API を参照しており、誤解を招く。 | 両ファイルの該当 JSDoc ブロック（"If no … result is found, throws SpecRunnerError with …"）を D4 後の実際の挙動（存在検証は事前検証 `STEP_INPUT_MISSING` が担う）に書き換える。 | yes |
| 3 | LOW | testing | tests/unit/step/code-fixer.test.ts:10, tests/unit/step/build-fixer.test.ts:6 | テストファイル冒頭の TC 番号コメントが旧挙動（`CODE_FIXER_NO_REVIEW_RESULT` / `BUILD_FIXER_NO_VERIFICATION_RESULT` を throw する TC-026 / TC-016）を記述している。実際のテスト内容は D4 後の仕様（throw しない）に更新済みだが、ヘッダーコメントが古い仕様を向いている。 | ヘッダーコメントを現行テストの意図（D4 後：throw しない・STEP_INPUT_MISSING 経路で止まる）を反映した記述に更新する。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 8.85

## Summary

実装品質は高い。型定義（`IoRef`/`RequiredInput`）・iteration helper（`nextIteration`/`latestIteration`）・12 step の reads/writes 宣言・RuntimeStrategy への `validateStepInputs` seam 追加・executor の事前検証配線・3 fixer の state 逆引き halt 置換、いずれも設計書通りに実装されており、`bun run typecheck && bun run test`（270 ファイル / 3189 テスト）が green。`src/util/paths.ts` と既存使い手は無変更。

ブロッカーは finding #1: TC-021（AgentStep executor 停止確認）と TC-022（CliStep executor 停止確認）の 2 件が test-cases.md では must 指定されているにもかかわらず未実装。executor のコードパスは正しいが、`runner.run()` が呼ばれていないことと failed StepRun 記録を assure するテストが無い。finding #2 の stale JSDoc は T-06 受け入れ基準（error code がコードベースから消えている）に対する形式的な違反。
