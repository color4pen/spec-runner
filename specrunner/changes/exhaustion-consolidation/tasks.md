# Tasks: ループ枯渇判定を1箇所に集約する

## T-01: 枯渇判定を担う private メソッド `tryExhaust` を追加する

- [x] `src/core/pipeline/pipeline.ts` の `Pipeline` クラスに private async メソッド `tryExhaust(state, deps, opts)` を追加する。`opts` は `{ iteration: number; stepName: string; phase: "review-exhausted" | "review-after-final-fix"; reportIteration?: number; bypassIteration?: number }`、返り値は `Promise<{ exhausted: boolean; state: JobState }>`。
- [x] メソッド本体: (1) `opts.iteration < this.maxIterations` なら `{ exhausted: false, state }` を返す。(2) `opts.bypassIteration !== undefined && opts.bypassIteration >= this.maxIterations` なら `{ exhausted: false, state }` を返す（bypass）。(3) それ以外は枯渇として、`logPipelineDiag("pipeline:loop:exhausted", \`step=${opts.stepName}, iter=${opts.reportIteration ?? opts.iteration}, max=${this.maxIterations}\`)` → `this.events.emit("pipeline:iteration:exhausted", { step: opts.stepName, iteration: opts.reportIteration ?? opts.iteration, maxIterations: this.maxIterations })` → `const next = await this.handleExhausted(state, deps, opts.stepName, opts.phase)` → `this.printPipelineFinished(next)` → `{ exhausted: true, state: next }` を返す。
- [x] `handleExhausted` / `printPipelineFinished` / `LOOP_ERROR_CODES` 等、既存ロジックは一切変更しない。

**Acceptance Criteria**:
- `tryExhaust` が `iteration >= maxIterations` かつ bypass 不成立のときのみ `exhausted: true` を返し、枯渇 state を `state` に載せて返す。
- `bypassIteration >= maxIterations` のとき `exhausted: false` を返し、副作用（emit / handleExhausted）を起こさない。
- emit する `iteration` は `reportIteration ?? iteration` に等しい。
- `bun run typecheck` が green。

## T-02: メインループの3箇所の枯渇インラインを `tryExhaust` 呼び出しへ置き換える

- [x] **Site A（current-loop exhaustion, 現行 ~L329-341）**: `isAnyLoopStep && nextStep !== "end" && nextStep !== "escalate" && outcome !== "approved" && outcome !== "passed"` かつ `loopFixerPairs[currentStep] === undefined` のガード内で、インラインの `currentLoopIter >= this.maxIterations` 比較 + emit + handleExhausted + printPipelineFinished + break を、`const r = await this.tryExhaust(state, deps, { iteration: loopIters.get(currentStep) ?? 0, stepName: currentStep, phase: "review-exhausted" }); if (r.exhausted) { state = r.state; break; }` に置き換える。
- [x] **Site B（next-loop exhaustion, 現行 ~L343-366）**: `this.loopNames.includes(nextStep)` のガード内で、インラインの `nextLoopIter >= this.maxIterations` 比較・`fixerAtMax` の bypass 比較・emit + handleExhausted + printPipelineFinished + break を、`const pairedFixer = this.loopFixerPairs[nextStep as string]; const r = await this.tryExhaust(state, deps, { iteration: loopIters.get(nextStep as string) ?? 0, stepName: nextStep as string, phase: "review-exhausted", bypassIteration: pairedFixer !== undefined ? (fixerIters.get(pairedFixer) ?? 0) : undefined }); if (r.exhausted) { state = r.state; break; }` に置き換える。
- [x] **Site C（fixer exhaustion, 現行 ~L368-383）**: `fixerNames.has(nextStep)` のガード内で、インラインの `nextFixerIter >= this.maxIterations` 比較 + emit + handleExhausted + printPipelineFinished + break を、`pairedReview` 算出はそのまま残しつつ `const r = await this.tryExhaust(state, deps, { iteration: fixerIters.get(nextStep as string) ?? 0, stepName: exhaustedLoopName, phase: "review-after-final-fix", reportIteration: this.maxIterations }); if (r.exhausted) { state = r.state; break; }` に置き換える。
- [x] 置き換え後、メインループ本体（`runInternal`）から `>= this.maxIterations` のインライン比較が4箇所すべて消えていることを確認する（残るのは `tryExhaust` 内と `handleExhausted` 内のみ）。
- [x] transition table・episode reset・loop/fixer counter の bookkeeping・`pairedReview` / `exhaustedLoopName` の算出ロジックは変更しない。

**Acceptance Criteria**:
- 3箇所すべてが `tryExhaust` 呼び出し + `if (r.exhausted) { state = r.state; break; }` の定型になっている。
- `runInternal` 本体に `>= this.maxIterations`（および `>= maxIterations`）のインライン比較が残っていない。
- `bun run typecheck` が green。

## T-03: 既存の枯渇関連テストで挙動不変を検証する

- [x] 既存テストを変更せずに以下を実行して green を確認する: `tests/core/pipeline/pipeline.test.ts`（TC-063 / TC-069）、`tests/pipeline-integration.test.ts`（TC-012 / TC-016 / TC-061 および各 +1 bypass シナリオ）、`tests/unit/core/pipeline/pipeline.transitions.test.ts`、`tests/unit/core/pipeline/pipeline.episode-reset.test.ts`、`tests/error-codes.test.ts`。
- [x] 観測挙動が現行と一致することを確認する: `error.code`（`SPEC_REVIEW_RETRIES_EXHAUSTED` / `CODE_REVIEW_RETRIES_EXHAUSTED` / `VERIFICATION_RETRIES_EXHAUSTED` 等）、`status === "awaiting-resume"`、`resumePoint.exhaustionPhase`（`review-exhausted` / `review-after-final-fix`）、iteration 回数（bypass 込み `maxIterations + 1`）、`pipeline:iteration:exhausted` の stderr 文言（`[iter N/M] retries exhausted on <step>, escalating`）。
- [x] テスト追加・変更は原則不要。挙動を変えずに通すこと。既存テストが落ちる場合は実装側の等価性崩れを疑い、テストを書き換えて回避しない。

**Acceptance Criteria**:
- 上記テストファイルがすべて green。
- 既存テストの assertion を緩めて通していない。

## T-04: 全体検証

- [x] `bun run typecheck && bun run test` が green。
- [x] request.md の受け入れ基準を確認する: (1) 枯渇判定が1メソッドに集約され、メインループからインラインの maxIterations 比較が消えている。(2) 既存の枯渇関連テストが全て通る。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- request.md の受け入れ基準がすべて満たされている。
