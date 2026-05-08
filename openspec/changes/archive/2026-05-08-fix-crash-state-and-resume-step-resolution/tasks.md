# Implementation Tasks: fix-crash-state-and-resume-step-resolution

## Phase 1: pipeline catch safety net

- [x] **T1.1**: `pipeline.runInternal()` の catch パスに `else` 分岐を追加する
  - ファイル: `src/core/pipeline/pipeline.ts` L154-160
  - `errWithState.state` が存在しない場合の `else` ブロックを追加
  - `new JobStateStore(state.jobId)` で store を生成
  - `store.fail(state, { code: "UNEXPECTED_STEP_ERROR", message: (err as Error).message, hint: "" }, currentStep)` を呼び出し、返り値を `state` に代入
  - 既存の `if (errWithState.state)` ブロックはそのまま維持
  - コメント `// Safety net: executor threw without attaching state.` を追加

- [x] **T1.2**: `pipeline.run()` の catch パスに running → awaiting-resume fallback を追加する
  - ファイル: `src/core/pipeline/pipeline.ts` L79-87
  - `const finalState` を `let finalState` に変更
  - `finalState.status === "running"` の場合:
    - `new JobStateStore(finalState.jobId)` で store 生成
    - `finalState` を `{ ...finalState, status: "awaiting-resume", resumePoint: { step: (finalState.step ?? "propose") as StepName, reason: (err as Error).message, iterationsExhausted: 0 }, error: { code: "PIPELINE_UNHANDLED_ERROR", message: (err as Error).message, hint: "" }, updatedAt: new Date().toISOString() }` で上書き
    - `await store.persist(finalState)` で永続化
  - `this.events.emit("pipeline:fail", ...)` は変更後の `finalState` を使用する
  - `pipeline.run()` メソッドの catch を async 対応にする（既に async メソッド内なので追加対応不要）

## Phase 2: resolveResumeStep default logic 分岐

- [x] **T2.1**: `REVIEWER_STEPS` 定数を追加する
  - ファイル: `src/core/resume/resolve-step.ts`
  - `CODE_PHASE_STEPS` の後に追加
  - `const REVIEWER_STEPS = new Set<StepName>(["spec-review", "code-review"]);`
  - JSDoc: `Steps that are reviewers (critic role). Used to distinguish crash from review exhaustion.`

- [x] **T2.2**: `resolveResumeStep()` の from 未指定時の default logic を書き換える
  - ファイル: `src/core/resume/resolve-step.ts` L63-80
  - `from !== undefined` の場合: 既存の role-based mapping を維持（`from` → `role` → `STEP_MAPPING[phase][role]`）
  - `from === undefined` かつ `resumePoint !== null` の場合:
    - `REVIEWER_STEPS.has(resumePoint.step)` かつ `resumePoint.iterationsExhausted > 0`: `STEP_MAPPING[phase]["fixer"]` を返す
    - それ以外: `resumePoint.step` をそのまま返す
  - `from === undefined` かつ `resumePoint === null` の場合: `fallbackStep` から phase を推定し `STEP_MAPPING[phase]["critic"]` を返す（既存挙動維持）

## Phase 3: テスト — pipeline catch safety net

- [x] **T3.1**: `.state` なしの throw で state が `awaiting-resume` になるテストを追加する（要件 7）
  - ファイル: `tests/unit/core/pipeline/` 配下に新規または既存ファイルに追加
  - executor.execute が `.state` プロパティなしの Error を throw するモックを作成
  - pipeline.run() 実行後、返り値の `state.status` が `"awaiting-resume"` であることを検証
  - `state.resumePoint` が存在し、`step` が crash した step 名であることを検証
  - `state.error.code` が `"UNEXPECTED_STEP_ERROR"` であることを検証

- [x] **T3.2**: `pipeline.run()` の catch まで throw が漏れても state が `awaiting-resume` になるテストを追加する（要件 8）
  - runInternal が直接 throw するケース（例: 存在しない step 名を startStep に指定）
  - pipeline.run() が throw した後、persist された state の `status` が `"awaiting-resume"` であることを検証
  - `state.error.code` が `"PIPELINE_UNHANDLED_ERROR"` であることを検証

## Phase 4: テスト — resolveResumeStep 分岐

- [x] **T4.1**: crash（iterationsExhausted=0）→ `resumePoint.step` から再開するテストを追加する（要件 9）
  - `resolveResumeStep(undefined, { step: "implementer", reason: "crash", iterationsExhausted: 0 })` → `"implementer"` を返す
  - `resolveResumeStep(undefined, { step: "propose", reason: "crash", iterationsExhausted: 0 })` → `"propose"` を返す
  - `resolveResumeStep(undefined, { step: "verification", reason: "crash", iterationsExhausted: 0 })` → `"verification"` を返す

- [x] **T4.2**: review exhaustion（iterationsExhausted>0、reviewer step）→ fixer から再開するテストを追加する（要件 10）
  - `resolveResumeStep(undefined, { step: "spec-review", reason: "exhausted", iterationsExhausted: 3 })` → `"spec-fixer"` を返す
  - `resolveResumeStep(undefined, { step: "code-review", reason: "exhausted", iterationsExhausted: 3 })` → `"code-fixer"` を返す

- [x] **T4.3**: non-reviewer step + iterationsExhausted>0 → `resumePoint.step` から再開するテストを追加する
  - `resolveResumeStep(undefined, { step: "verification", reason: "exhausted", iterationsExhausted: 3 })` → `"verification"` を返す（reviewer でないので crash 扱い）

- [x] **T4.4**: `--from` 指定時は `--from` が最優先されることを検証するテストを追加する（要件 11）
  - `resolveResumeStep("creator", { step: "code-review", reason: "exhausted", iterationsExhausted: 3 })` → `"implementer"` を返す（crash/exhaustion に関係なく `--from` 優先）
  - `resolveResumeStep("fixer", { step: "implementer", reason: "crash", iterationsExhausted: 0 })` → `"code-fixer"` を返す

## Phase 5: 検証

- [x] **T5.1**: 型チェック実行
  - `bun run typecheck` が green

- [x] **T5.2**: テストスイート実行
  - `bun run test` が green（既存テスト含む全件パス）

## Notes for Implementer

- **executor は変更しない**: executor.ts の既存コードには一切触れない。pipeline 側の defense in depth で解決する
- **既存テストの互換性**: `resolve-step.test.ts` L70-78 の `from=undefined` テストは `makeResumePoint()` が `iterationsExhausted: 0` で生成するため、crash 扱いとなり `resumePoint.step` をそのまま返す。既存テストの期待値は変わらない
- **`store.fail()` の冪等性**: `store.fail()` は内部で `persist()` を呼ぶ。T1.1 の後に L164 で再度 `persist()` されるが、同じ state を書くだけなので問題ない
- **`pipeline.run()` の catch 内 await**: T1.2 の修正で catch 内に `await store.persist()` が入る。pipeline.run() は async メソッドなので追加対応不要
