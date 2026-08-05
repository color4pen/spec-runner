# Tasks: verification の失敗 phase を StepRun outcome に構造化記録する

実装は「型定義 → 記録経路 plumbing → producer 投影 → hint 修正 → テスト」の順。
各タスクは前段が無いと green にならない依存があるため T-01 から順に進める。

## T-01: `VerificationPhaseOutcome` 型と `StepOutcome.verificationPhases` フィールドを定義する

- [ ] `src/state/schema/types.ts` に新 interface を追加する:
      `VerificationPhaseOutcome { phase: string; status: "passed" | "failed" | "skipped"; exitCode: number | null }`。
      JSDoc に「phase 名または command ラベル / exitCode は skipped・非 spawn phase で null」を明記。
- [ ] 同ファイルの `StepOutcome`（:122）に optional フィールド
      `verificationPhases?: VerificationPhaseOutcome[]` を追加する。JSDoc に「verification step 専用・
      他 step と legacy record では absent・Added in verification-phase-outcome-record」を明記。
- [ ] `VerificationPhaseOutcome` が `src/state/schema.js`（`export * from "./schema/types.js"`）経由で
      再エクスポートされることを確認する（新規 barrel 追加は不要）。

**Acceptance Criteria**:
- `VerificationPhaseOutcome` が state schema 層に定義され、`import { VerificationPhaseOutcome } from "src/state/schema.js"` で参照できる。
- `StepOutcome.verificationPhases` は optional で、既存 record（フィールド不在）が型エラーにならない。
- `tsc` が通る。

## T-02: `pushStepResult` / `StepResultInput` に `verificationPhases` を通す

- [ ] `src/state/helpers.ts` の `StepResultInput`（:54）に
      `verificationPhases?: VerificationPhaseOutcome[]` を追加する（型を schema から import）。
- [ ] `pushStepResult`（:127）の `outcome` 構築（:138-148）に conditional spread を追加する:
      `...(partial.verificationPhases !== undefined ? { verificationPhases: partial.verificationPhases } : {})`。
      他フィールド（toolResult 等）と同じパターンで、undefined のときは outcome に載せない。

**Acceptance Criteria**:
- `pushStepResult(state, "verification", { ..., verificationPhases: [...] })` が
  `state.steps.verification[n].outcome.verificationPhases` に配列を格納する。
- `verificationPhases` を渡さない既存呼び出しは outcome に当該キーを含めない（後方互換）。
- `tsc` が通る。

## T-03: journal（`event-journal.ts`）に `verificationPhases` を通す

- [ ] `src/store/event-journal.ts` の `StepAttemptRecord.outcome`（:37-57）に
      `verificationPhases?: VerificationPhaseOutcome[]` を追加する（型を `../state/schema.js` から import）。
- [ ] `stepRunToRecord`（:434）の outcome serialize（:440-450）に conditional spread を追加する:
      `...(outcome.verificationPhases !== undefined ? { verificationPhases: outcome.verificationPhases } : {})`。
- [ ] `fold`（:258）の steps 再構築（:361-378 の `outcome` 構築）に conditional spread を追加する:
      `...(r.outcome.verificationPhases !== undefined ? { verificationPhases: r.outcome.verificationPhases } : {})`。
- [ ] `src/state/schema/operations.ts` の `normalizeSteps` は current-shape
      （`"attempt" in obj && "outcome" in obj`）を passthrough するため変更不要であることを確認する（変更しない）。

**Acceptance Criteria**:
- StepRun.outcome に `verificationPhases` を持つ record が `stepRunToRecord` で serialize され、
  `fold` で同一内容に再構築される（round-trip 保存）。
- `verificationPhases` 不在の既存 record は fold で当該キーを持たない（後方互換）。
- `tsc` が通る。

## T-04: `CliStep.run()` の戻り型を widen し `CliStepRunOutcome` を定義する

- [ ] `src/core/port/step-types.ts` に interface を追加する:
      `CliStepRunOutcome { verificationPhases?: VerificationPhaseOutcome[] }`（型を `../../state/schema.js` から import）。
      JSDoc に「multi-phase CLI step（verification）の phase 別 outcome。返さない CLI step は void でよい」を明記。
- [ ] `CliStep.run`（:339）の戻り型を `Promise<void>` → `Promise<CliStepRunOutcome | void>` に変更する。

**Acceptance Criteria**:
- `void` を返す既存 CliStep（bite-evidence `step.ts:41`、pr-create `pr-create.ts:31`）が無改修で型を満たす。
- 既存テストの inline CliStep（`run: async () => {}`）が型エラーにならない。
- `tsc` が通る。

## T-05: `VerificationStep.run` が `VerificationResult.phases` を投影して返す

- [ ] `src/core/step/verification.ts` の `run`（:34）で、`runVerification`（:49）の戻り値を
      変数に捕捉する（現状は破棄している）。
- [ ] `VerificationResult.phases`（`PhaseResult[]`）を `VerificationPhaseOutcome[]` に投影する:
      各 `p` を `{ phase: p.phase, status: p.status, exitCode: p.exitCode }` にマップし、
      `stdout` / `stderr` / `durationMs` / `skippedCount` は **落とす**（D3）。
- [ ] propagate 等の既存後続処理（:51-71）はそのまま実行し、`run` の末尾で
      `return { verificationPhases }` を返す。propagate 失敗の warning 経路も現状維持。
- [ ] `reads` / `writes` / `resultFilePath` / `parseResult` は **変更しない**（AC5・AC7）。

**Acceptance Criteria**:
- `VerificationStep.run` が `runVerification` の各 phase を `phase`/`status`/`exitCode` のみに投影した
  `verificationPhases` 配列を返す。
- `runVerification` の戻り phases が空配列なら `verificationPhases: []` を返す。
- `parseResult` / `verificationResultPath` 参照は無変更。
- 既存 `tests/unit/core/step/verification-step.test.ts` の TC-003 / TC-11 が green（run 戻り値を assert しないため無改修で通る）。

## T-06: executor が run() 戻り値を捕捉し `StepExecutionResult` 経由で記録する

- [ ] `src/core/step/commit-orchestrator.ts` の `StepExecutionResult` success variant（:56-93）に
      `verificationPhases?: VerificationPhaseOutcome[]` を追加する（型を schema から import）。
- [ ] `src/core/step/executor.ts` の `runCliStep`（:543）で `await step.run(state, deps)`（:568）の戻り値を
      捕捉する。戻り値が `CliStepRunOutcome` を持つ場合、その `verificationPhases` を最終の success
      `StepExecutionResult`（:613-621）に conditional で付加する。**verdict 導出
      （`deriveStepCompletion`, :608）には触れない**（D4）。
- [ ] `commit-orchestrator.ts` の `projectSuccess`（:108）で `result.verificationPhases` を destructure し、
      `pushStepResult`（:117）へ `verificationPhases` として渡す（conditional）。
- [ ] round 経路（`commitRound`）も同じ `projectSuccess` を通るが、verification は round member でないため
      `result.verificationPhases` は undefined となり無影響であることを確認する（追加変更不要）。

**Acceptance Criteria**:
- CliStep の `run()` が `{ verificationPhases }` を返すと、`runCliStep` が返す success 結果に
  `verificationPhases` が載る。
- `projectSuccess` → `pushStepResult` を経て `state.steps.verification[n].outcome.verificationPhases` に記録される。
- run() が void を返す CliStep（bite-evidence / pr-create）は success 結果に `verificationPhases` を含めない。
- verdict 導出経路（`deriveStepCompletion` / `parseResult`）は無変更。
- `tsc` が通る。

## T-07: `VERIFICATION` exhaustion hint を実在ファイル案内に修正する

- [ ] `src/core/pipeline/types.ts` の `LOOP_ERROR_CODES`（:167）の `VERIFICATION` エントリ（:173-177）の
      `hint` を、`verification-result-${nnn}.md` から実在する `verification-result.md`（＋ phase 別 status は
      該当 verification `step-attempt` の outcome を参照、の旨）に変更する。連番を使わないため引数は無視してよい。
- [ ] 他エントリ（SPEC_REVIEW / CODE_REVIEW / CONFORMANCE / REGRESSION_GATE / custom-reviewers）の hint は
      **変更しない**（それぞれ連番ファイルが実在する）。

**Acceptance Criteria**:
- `LOOP_ERROR_CODES[STEP_NAMES.VERIFICATION].hint(nnn)` が `verification-result.md` を案内し、
  `verification-result-001.md` のような連番ファイルを案内しない。
- 他 loop エントリの hint 文字列は無変更。
- `tsc` が通る。

## T-08: テストで受け入れ基準を固定する

- [ ] **TC-01（AC1）**: 失敗 iteration の phase 記録。build 失敗（exitCode 1）の verification について、
      `pushStepResult` → journal（`stepRunToRecord` → `fold`）を経た `step-attempt.outcome.verificationPhases`
      から `phase:"build", status:"failed", exitCode:1` が **markdown を一切読まずに** 取得できることを固定する。
      配置: `tests/store/event-journal.test.ts`（journal round-trip）。
- [ ] **TC-02（AC2）**: passed iteration の全 phase 記録。実行 phase は `passed`、skip された phase
      （security / test-coverage）は `skipped` として全 phase が `verificationPhases` に記録されることを固定する。
- [ ] **TC-03（AC3）**: 複数 iteration 独立記録。同一 step 名で 2 つの StepRun（iter1=build failed、
      iter2=全 passed）を append し、`fold` で 2 レコードに再構築、各々が独立の `verificationPhases` を保持し
      後者が前者を上書きしないことを固定する。配置: `tests/store/event-journal.test.ts`。
- [ ] **TC-04（producer 投影）**: `VerificationStep.run` の投影テスト。`runVerification` を
      `phases:[{phase:"build",status:"failed",exitCode:1,stdout:"...",stderr:"...",durationMs:5}]` で mock し、
      `run` が `{ verificationPhases:[{phase:"build",status:"failed",exitCode:1}] }` を返し
      stdout/stderr/durationMs を落とすことを固定する。配置: `tests/unit/core/step/verification-step.test.ts`（拡張）。
- [ ] **TC-05（executor threading）**: `runCliStep` が run() の返す `verificationPhases` を success 結果へ
      thread し、記録される StepRun.outcome に載ることを固定する。既存 runCliStep テスト
      `tests/unit/core/step/executor-cli-entry-oid.test.ts` を先例として同ディレクトリに配置。
- [ ] **TC-06（AC6）**: `LOOP_ERROR_CODES[VERIFICATION].hint` が `verification-result.md` を案内し
      `verification-result-001.md` を案内しないこと、かつ他エントリの hint が無変更であることを固定する。
      配置: pipeline types のユニットテスト（`tests/unit/pipeline/` 配下に新規 or 既存に追記）。
- [ ] **AC4 / AC5 / AC7（無変更の確認）**: 以下の既存テスト群が **無変更で green** であることを確認する
      （新規・改変しない。緑であること自体が受け入れ基準）:
      - `verification-result.md` 生成パス・書式: `tests/unit/core/verification/runner*.test.ts`,
        `tests/unit/core/verification/parse-result.test.ts`
      - build-fixer 読み取り経路: `tests/unit/step/build-fixer.test.ts`, `tests/prompts/build-fixer-system.test.ts`
      - verdict / 遷移: `tests/unit/pipeline/transition-when.test.ts`,
        `tests/unit/core/pipeline/pipeline.transitions.test.ts`,
        `tests/unit/core/pipeline/pipeline.build-fixer-reentry.test.ts`

**Acceptance Criteria**:
- TC-01〜TC-06 が新規追加され green。
- TC-01・TC-03 は markdown を一切パースせず outcome から phase を取得している。
- AC4/AC5/AC7 対象の既存テストが **無変更** で green（diff にこれらの改変が含まれない）。
- `bun run build` / `bun run typecheck` / `bun run test` / `bun run lint` が通る。
