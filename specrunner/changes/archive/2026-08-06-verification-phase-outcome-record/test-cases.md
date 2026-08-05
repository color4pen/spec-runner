# Test Cases: verification の失敗 phase を StepRun outcome に構造化記録する

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 17
- **Manual**: 0
- **Priority**: must: 14, should: 3, could: 0

---

### TC-001: 失敗 iteration の phase が step-attempt から取得できる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification は各 iteration の phase 結果を step-attempt outcome に構造化記録する > Scenario: 失敗 iteration の phase が step-attempt から取得できる

---

### TC-002: passed iteration でも実行された全 phase の status が記録される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification は各 iteration の phase 結果を step-attempt outcome に構造化記録する > Scenario: passed iteration でも実行された全 phase の status が記録される

---

### TC-003: 失敗 → 修正 → 成功で両 iteration の phase が残る

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 複数 iteration の phase 結果は独立に記録され上書きされない > Scenario: 失敗 → 修正 → 成功で両 iteration の phase が残る

---

### TC-004: markdown の生成パスと書式が現状のまま

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification-result.md の出力・パス・書式は不変 > Scenario: markdown の生成パスと書式が現状のまま

---

### TC-005: build-fixer の読み取り経路が不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verification-result.md の出力・パス・書式は不変 > Scenario: build-fixer の読み取り経路が不変

---

### TC-006: verdict 経路が現状と同一

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: verdict 判定と routing は不変 > Scenario: verdict 経路が現状と同一

---

### TC-007: VERIFICATION hint が実在ファイルを案内する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: VERIFICATION exhaustion hint は実在情報を案内する > Scenario: VERIFICATION hint が実在ファイルを案内する

---

### TC-008: 他 step の hint は無変更

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: VERIFICATION exhaustion hint は実在情報を案内する > Scenario: 他 step の hint は無変更

---

### TC-009: VerificationPhaseOutcome 型が schema から参照でき StepOutcome.verificationPhases は optional

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/state/schema/types.ts` に `VerificationPhaseOutcome` interface と `StepOutcome.verificationPhases?: VerificationPhaseOutcome[]` が追加されている
**WHEN** `import { VerificationPhaseOutcome } from "src/state/schema.js"` でインポートし `tsc` を実行する
**THEN** コンパイルが通り、`verificationPhases` フィールド不在の既存 `StepOutcome` レコードが型エラーを起こさない

---

### TC-010: pushStepResult が verificationPhases を格納し、渡さない呼び出しでは outcome に含めない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `StepResultInput` に `verificationPhases` を渡す呼び出しと、渡さない呼び出しが存在する
**WHEN** それぞれ `pushStepResult` を実行する
**THEN** 渡した呼び出しでは `state.steps.verification[n].outcome.verificationPhases` に配列が格納され、渡さない呼び出しでは `outcome` に `verificationPhases` キーが存在しない

---

### TC-011: journal round-trip — verificationPhases が stepRunToRecord → fold で同一内容に再構築される

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `verificationPhases: [{phase:"build", status:"failed", exitCode:1}]` を持つ StepRun outcome を含む record
**WHEN** `stepRunToRecord` で serialize し `fold` で再構築する
**THEN** 再構築された `step-attempt.outcome.verificationPhases` の内容が元の配列と同一である

---

### TC-012: verificationPhases 不在の既存 record が fold で欠落・破損しない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `verificationPhases` フィールドを持たない既存形式の `step-attempt` record
**WHEN** `fold` で再構築する
**THEN** 再構築された outcome に `verificationPhases` キーが存在せず、`verdict` 等の他フィールドは正常に復元される

---

### TC-013: 既存 void 返し CliStep が戻り型 widen 後も型エラーにならない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `bite-evidence` / `pr-create` の CliStep（`run: async () => {}` で void を返す）と、`CliStep.run` 戻り型が `Promise<CliStepRunOutcome | void>` に変更されている状態
**WHEN** `tsc` を実行する
**THEN** これら既存 CliStep の実装で型エラーが発生しない（`void` が `CliStepRunOutcome | void` に代入可能なため）

---

### TC-014: VerificationStep.run が phases を phase/status/exitCode のみに投影して返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 / T-08 TC-04

**GIVEN** `runVerification` を `phases:[{phase:"build", status:"failed", exitCode:1, stdout:"err output", stderr:"trace", durationMs:5}]` で mock した `VerificationStep`
**WHEN** `run()` を実行する
**THEN** 戻り値が `{ verificationPhases:[{phase:"build", status:"failed", exitCode:1}] }` であり、`stdout` / `stderr` / `durationMs` が含まれない

---

### TC-015: VerificationStep.run が空 phases のとき verificationPhases: [] を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** `runVerification` が `phases: []` を返す mock を使った `VerificationStep`
**WHEN** `run()` を実行する
**THEN** 戻り値が `{ verificationPhases: [] }` である

---

### TC-016: executor が run() の verificationPhases を success StepExecutionResult に thread し verdict 導出は不変

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 / T-08 TC-05

**GIVEN** `run()` が `{ verificationPhases: [{phase:"lint", status:"failed", exitCode:2}] }` を返す CliStep を `runCliStep` で実行する環境
**WHEN** `runCliStep` を実行する
**THEN** 返される success `StepExecutionResult` の `verificationPhases` に当該配列が含まれ、`deriveStepCompletion` / `parseResult` は一切変更されていない経路で verdict を導出する

---

### TC-017: void を返す CliStep の success 結果に verificationPhases が含まれない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** `run()` が void を返す CliStep（bite-evidence / pr-create 相当）を `runCliStep` で実行する環境
**WHEN** `runCliStep` を実行する
**THEN** 返される success `StepExecutionResult` に `verificationPhases` フィールドが存在しない

---

## Result

```yaml
result: completed
total: 17
automated: 17
manual: 0
must: 14
should: 3
could: 0
blocked_reasons: []
```
