## 1. Error hint factory の iteration 引数化

- [x] 1.1 `src/errors.ts` の `specReviewResultNotFoundError` のシグネチャを `(slug, branch, iteration: number)` に変更し、内部で `String(iteration).padStart(3, '0')` を使って `spec-review-result-{NNN}.md` を含む hint を組み立てる。hint MUST also include guidance such as "If the agent wrote the file but did not commit + push, re-run the step or check the agent session logs for git push errors"
- [x] 1.2 `src/errors.ts` に新規 `codeReviewResultNotFoundError(slug, branch, iteration: number)` を追加し、`review-feedback-{NNN}.md` を含む hint を組み立てる。hint MUST also include guidance such as "If the agent wrote the file but did not commit + push, re-run the step or check the agent session logs for git push errors"
- [x] 1.3 既存 unit test に iteration=1, 2, 10 で hint string を assert するケースを追加（filename suffix 計算と branch 名挿入を検証）

## 2. Step capability 宣言の修正

- [x] 2.1 `src/core/step/code-review.ts` の `capabilities` を `{}` から `{ gitWrite: true }` に変更
- [x] 2.2 `src/core/step/code-review.ts` のコメントを「source code は read-only / review-feedback file requires gitWrite」相当に訂正し、openspec-workflow からの逸脱理由（Managed Agents 制約）を 1 行で参照
- [x] 2.3 `src/core/step/spec-review.ts` の capabilities が `{ gitWrite: true }` になっていることを確認（無ければ追加）し、コメントを spec-review-result file の push 必須性を明示する形に揃える

## 3. Step error hint 呼び出しの iteration 渡し

- [x] 3.1 `src/core/step/spec-review.ts` の `specReviewResultNotFoundError` 呼び出し箇所に現在の iteration を渡すよう変更
- [x] 3.2 `src/core/step/code-review.ts` の `codeReviewResultNotFoundError` 呼び出しを追加（既存の generic error から差し替え）し、現在の iteration を渡す
- [x] 3.3 `src/core/step/executor.ts` は既に `step.resultFilePath` 経由で agent と同一 helper を使うため、コード修正は不要見込み。本 task は invariant の確認（grep + 1 行コメント追加）に限定する。DoD として agent message と executor の resultFilePath が一致する unit test を 1 件追加する

## 4. Review system prompt の commit/push 指示追加

- [x] 4.1 `src/prompts/spec-review-system.ts` の system prompt または initial message template に「After writing the verdict and findings, commit the file to branch `{{BRANCH}}` and push to origin」相当の文を追加
- [x] 4.2 同 prompt に「Do NOT end_turn until push is complete」相当の文を追加
- [x] 4.3 propose / fixer 系と同じ shape の `buildGitPushInstruction(branch)` を spec-review の user message 組み立てに組み込む
- [x] 4.4 `src/prompts/code-review-system.ts` は既存の "MUST commit and push" 文を維持し、capability 宣言と矛盾しないことを確認
- [x] 4.5 `src/prompts/code-review-system.ts` または `src/core/step/code-review.ts` の `buildCodeReviewInitialMessage` に `branch` 引数を追加し、user message 末尾に `buildGitPushInstruction(branch)` を embed する。`src/core/step/code-review.ts` の `buildMessage`（または相当箇所）で `state.branch`（または `deps.branch`）を取得して `buildCodeReviewInitialMessage` に渡す

## 5. Implementer prompt の workflow context 追記

- [x] 5.1 `src/prompts/implementer-system.ts` に workflow context を positive framing で追記する。既存 `IMPLEMENTER_SYSTEM_PROMPT` は全文日本語のため、追記文言も日本語に揃える。例: 「あなたは pipeline の stage 3 (implementer) です。次工程: verification (build/test/lint), その次: code-review。build/test/lint は次工程に渡してください」
- [x] 5.2 verification が build / test / lint を担当する次工程であることを明示し、implementer 自身がそれを実行しないよう「次工程に渡せ」表現で書く

## 6. Test cases の追加

> test-cases.md は Step 3.5 (test-case-generator) が生成済み前提。本セクションのタスクは Step 4 (implementer) で処理する。

- [x] 6.1 `test-cases.md` に must シナリオを追加: spec-review agent が result file を origin に commit + push して end_turn する E2E 経路、code-review.ts の `capabilities.gitWrite` が true である構成検証、`specReviewResultNotFoundError` / `codeReviewResultNotFoundError` の dynamic suffix 計算、executor の fetch filename と agent message filename の一致
- [x] 6.2 system prompt snapshot test に commit/push 指示を含むことの assertion を追加
- [x] 6.3 `code-review.ts` / `spec-review.ts` の capabilities 構成を検証する unit test を追加
- [x] 6.4 既存 491 tests の regression 0 を確認

## 7. ADR 生成

- [x] 7.1 `openspec-workflow/adr/ADR-20260430-review-exit-contract-managed-agents.md` を生成（Title / Status / Context / Decision / Consequences / Alternatives 構成）
- [x] 7.2 ADR の Title に「Review-side exit contract: agent-driven push (deviation from openspec-workflow's orchestrator-driven commit)」を記述する
- [x] 7.3 ADR の Context セクションに claude-code (local execution, orchestrator commit) vs Managed Agents (remote workspace, agent push) の architecture 差分を記述
- [x] 7.4 Consequences で「custom_tool で content を返す方式」「local relay 方式」を将来検討候補として記録

## 8. 検証と dogfooding

- [x] 8.1 `bun test` で全 test PASS を確認（regression 0、新規シナリオ含む）
- [x] 8.2 `bun lint` / `bun typecheck` を実行し PASS
- [ ] 8.3 `bun bin/specrunner.ts run /tmp/dogfooding-001-request.md` を実行し end-to-end PASS（PR 作成まで完走）を確認
- [ ] 8.4 dogfooding の job state ログと session events を確認し、spec-review agent が push してから end_turn していることを検証
