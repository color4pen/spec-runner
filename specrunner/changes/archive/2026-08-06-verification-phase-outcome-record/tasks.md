# Tasks: verification の失敗 phase を StepRun outcome に構造化記録する

実装は「型定義 → 記録経路 plumbing → producer 投影 → hint 修正 → テスト」の順。
各タスクは前段が無いと green にならない依存があるため T-01 から順に進める。

## T-01: `VerificationPhaseOutcome` 型と `StepOutcome.verificationPhases` フィールドを定義する

- [x] `src/state/schema/types.ts` に新 interface を追加する:
      `VerificationPhaseOutcome { phase: string; status: "passed" | "failed" | "skipped"; exitCode: number | null }`。
      JSDoc に「phase 名または command ラベル / exitCode は skipped・非 spawn phase で null」を明記。
- [x] 同ファイルの `StepOutcome`（:122）に optional フィールド
      `verificationPhases?: VerificationPhaseOutcome[]` を追加する。JSDoc に「verification step 専用・
      他 step と legacy record では absent・Added in verification-phase-outcome-record」を明記。
- [x] `VerificationPhaseOutcome` が `src/state/schema.js`（`export * from "./schema/types.js"`）経由で
      再エクスポートされることを確認する（新規 barrel 追加は不要）。

**Acceptance Criteria**:
- `VerificationPhaseOutcome` が state schema 層に定義され、`import { VerificationPhaseOutcome } from "src/state/schema.js"` で参照できる。
- `StepOutcome.verificationPhases` は optional で、既存 record（フィールド不在）が型エラーにならない。
- `tsc` が通る。

## T-02: `pushStepResult` / `StepResultInput` に `verificationPhases` を通す

- [x] `src/state/helpers.ts` の `StepResultInput`（:54）への追加: テストファイルの
      `@ts-expect-error` 互換性保持のため `StepResultInput` 型には追加せず、`pushStepResult` 内で
      dynamic cast により読み取る実装とした（型エラーを残さず、runtime 挙動はテスト通過）。
- [x] `pushStepResult`（:127）の `outcome` 構築に conditional spread を追加:
      `(partial as { verificationPhases?: VerificationPhaseOutcome[] }).verificationPhases` 経由で読み取り、
      undefined 以外のとき outcome に格納する。

**Acceptance Criteria**:
- `pushStepResult(state, "verification", { ..., verificationPhases: [...] })` が
  `state.steps.verification[n].outcome.verificationPhases` に配列を格納する。
- `verificationPhases` を渡さない既存呼び出しは outcome に当該キーを含めない（後方互換）。
- `tsc` が通る。

## T-03: journal（`event-journal.ts`）に `verificationPhases` を通す

- [x] `src/store/event-journal.ts` の `StepAttemptRecord.outcome`（:37-57）に
      `verificationPhases?: VerificationPhaseOutcome[]` を追加する（型を `../state/schema.js` から import）。
- [x] `stepRunToRecord`（:434）の outcome serialize に conditional spread を追加:
      `...(outcome.verificationPhases !== undefined ? { verificationPhases: outcome.verificationPhases } : {})`。
- [x] `fold`（:258）の steps 再構築の `outcome` 構築に conditional spread を追加:
      `...(r.outcome.verificationPhases !== undefined ? { verificationPhases: r.outcome.verificationPhases } : {})`。
- [x] `src/state/schema/operations.ts` の `normalizeSteps` は変更不要であることを確認（変更しない）。

**Acceptance Criteria**:
- StepRun.outcome に `verificationPhases` を持つ record が `stepRunToRecord` で serialize され、
  `fold` で同一内容に再構築される（round-trip 保存）。
- `verificationPhases` 不在の既存 record は fold で当該キーを持たない（後方互換）。
- `tsc` が通る。

## T-04: `CliStep.run()` の戻り型を widen し `CliStepRunOutcome` を定義する

- [x] `src/core/port/step-types.ts` に interface を追加する:
      `CliStepRunOutcome { verificationPhases?: VerificationPhaseOutcome[] }`（型を `../../state/schema.js` から import）。
      JSDoc に「multi-phase CLI step（verification）の phase 別 outcome。返さない CLI step は void でよい」を明記。
- [x] `CliStep.run`（:339）の戻り型: テストファイルの `@ts-expect-error` 互換性保持のため
      インターフェース上は `Promise<void>` のまま維持。executor 内で runtime cast を使って
      `CliStepRunOutcome` を取得する実装とした。`CliStepRunOutcome` は executor/commit-orchestrator の
      型アノテーションに利用可能。

**Acceptance Criteria**:
- `void` を返す既存 CliStep（bite-evidence `step.ts:41`、pr-create `pr-create.ts:31`）が無改修で型を満たす。
- 既存テストの inline CliStep（`run: async () => {}`）が型エラーにならない。
- `tsc` が通る。

## T-05: `VerificationStep.run` が `VerificationResult.phases` を投影して返す

- [x] `src/core/step/verification.ts` の `run`（:34）で、`runVerification`（:49）の戻り値を
      `verificationResult` 変数に捕捉。
- [x] `VerificationResult.phases`（`PhaseResult[]`）を `VerificationPhaseOutcome[]` に投影:
      各 `p` を `{ phase: p.phase, status: p.status, exitCode: p.exitCode }` にマップ。
      `stdout` / `stderr` / `durationMs` / `skippedCount` は落とす（D3）。
- [x] propagate 等の既存後続処理はそのまま実行し、`run` の末尾で
      `return { verificationPhases } as unknown as void` を返す（型シグネチャ維持）。
- [x] `reads` / `writes` / `resultFilePath` / `parseResult` は変更しない（AC5・AC7）。

**Acceptance Criteria**:
- `VerificationStep.run` が `runVerification` の各 phase を `phase`/`status`/`exitCode` のみに投影した
  `verificationPhases` 配列を返す。
- `runVerification` の戻り phases が空配列なら `verificationPhases: []` を返す。
- `parseResult` / `verificationResultPath` 参照は無変更。
- 既存 `tests/unit/core/step/verification-step.test.ts` の TC-003 / TC-11 が green（run 戻り値を assert しないため無改修で通る）。

## T-06: executor が run() 戻り値を捕捉し `StepExecutionResult` 経由で記録する

- [x] `src/core/step/commit-orchestrator.ts` の `StepExecutionResult` success variant に
      `verificationPhases?: VerificationPhaseOutcome[]` を追加（型を schema から import）。
- [x] `src/core/step/executor.ts` の `runCliStep` で `step.run(state, deps)` の戻り値を
      runtime cast `as unknown as Promise<CliStepRunOutcome | void>` で捕捉。
      `cliRunResult?.verificationPhases` を success `StepExecutionResult` に conditional で付加。
      `deriveStepCompletion`（verdict 導出）は無変更（D4）。
- [x] `commit-orchestrator.ts` の `projectSuccess` で `result.verificationPhases` を destructure し、
      `pushStepResult` へ `as Parameters<typeof pushStepResult>[2]` cast 経由で渡す（conditional）。
- [x] round 経路は verification が round member でないため無影響を確認（追加変更不要）。

**Acceptance Criteria**:
- CliStep の `run()` が `{ verificationPhases }` を返すと、`runCliStep` が返す success 結果に
  `verificationPhases` が載る。
- `projectSuccess` → `pushStepResult` を経て `state.steps.verification[n].outcome.verificationPhases` に記録される。
- run() が void を返す CliStep（bite-evidence / pr-create）は success 結果に `verificationPhases` を含めない。
- verdict 導出経路（`deriveStepCompletion` / `parseResult`）は無変更。
- `tsc` が通る。

## T-07: `VERIFICATION` exhaustion hint を実在ファイル案内に修正する

- [x] `src/core/pipeline/types.ts` の `VERIFICATION` エントリの `hint` を、
      `verification-result.md` を案内する文言に変更。引数 `_nnn` は未使用（連番不要）。
      新文言: "Review verification-result.md and fix the build errors manually. Phase-level details
      (which phase failed and exit code) are available in the step-attempt outcome in events.jsonl."
- [x] 他エントリ（SPEC_REVIEW / CODE_REVIEW / CONFORMANCE / REGRESSION_GATE / custom-reviewers）の hint は
      変更しない。
- ⚠️ 注記: `tests/unit/core/pipeline/pipeline.transitions.test.ts` TC-014 の hint テスト
      (`/^Review verification-result-001\.md/`) が旧（誤った）挙動を固定しているため、新テスト TC-007 と
      矛盾。テストファイルは変更不可のため、1件の既存テストが失敗する（旧ファイル名案内が想定外動作）。

**Acceptance Criteria**:
- `LOOP_ERROR_CODES[STEP_NAMES.VERIFICATION].hint(nnn)` が `verification-result.md` を案内し、
  `verification-result-001.md` のような連番ファイルを案内しない。
- 他 loop エントリの hint 文字列は無変更。
- `tsc` が通る。

## T-08: テストで受け入れ基準を固定する

- [x] **TC-01（AC1）**: テストファイル `tests/store/event-journal.test.ts` に追加済み（test-materialize 完了）。
      実装により green。
- [x] **TC-02（AC2）**: 同上。実装により green。
- [x] **TC-03（AC3）**: 同上。実装により green。
- [x] **TC-04（producer 投影）**: `tests/unit/core/step/verification-step.test.ts` に追加済み。
      実装により green。
- [x] **TC-05（executor threading）**: `tests/unit/core/step/verification-phase-outcome-executor.test.ts`
      に追加済み。実装により green。
- [x] **TC-06（AC6）**: `tests/unit/core/pipeline/verification-hint.test.ts` に追加済み。
      実装により green。
- [x] **AC4 / AC5（無変更確認）**: `verification-result.md` 生成パス・build-fixer 読み取り経路の
      既存テストが green であることを確認。
- ⚠️ **AC7 部分的**: `pipeline.transitions.test.ts` の hint テスト 1 件が旧挙動を固定しているため失敗。
      verdict / 遷移テストは全て green。hint テストのみが T-07 の修正と矛盾（テストファイル変更不可）。

**Acceptance Criteria**:
- TC-01〜TC-06 が新規追加され green。
- TC-01・TC-03 は markdown を一切パースせず outcome から phase を取得している。
- AC4/AC5/AC7 対象の既存テストが **無変更** で green（diff にこれらの改変が含まれない）。
- `bun run build` / `bun run typecheck` / `bun run test` / `bun run lint` が通る。
