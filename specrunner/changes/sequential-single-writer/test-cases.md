# Test Cases: 逐次経路の single-writer（StepExecutor producer 化 ＋ CommitOrchestrator 単一適用）

## Summary

- **Total**: 28 cases
- **Automated** (unit/integration): 27
- **Manual**: 1
- **Priority**: must: 24, should: 4, could: 0

---

### TC-001: 成功 step で executor が store 書き込みを行わない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: StepExecutor は state を永続化せず実行結果を値として返す > Scenario: 成功 step で executor が store 書き込みを行わない

---

### TC-002: 失敗 step で executor が遷移を手組みしない

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: StepExecutor は state を永続化せず実行結果を値として返す > Scenario: 失敗 step で executor が遷移を手組みしない

---

### TC-003: 成功結果を CommitOrchestrator が適用する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CommitOrchestrator が成功・halt・skip の唯一の適用点である > Scenario: 成功結果を CommitOrchestrator が適用する

---

### TC-004: halt 結果を CommitOrchestrator が適用し throw する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CommitOrchestrator が成功・halt・skip の唯一の適用点である > Scenario: halt 結果を CommitOrchestrator が適用し throw する

---

### TC-005: 開始マーカーが実行前に永続化される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CommitOrchestrator が成功・halt・skip の唯一の適用点である > Scenario: 開始マーカーが実行前に永続化される

---

### TC-006: agent 成功 step の最終 verdict / history が従来と一致する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 逐次 step の観測可能な挙動を不変に保つ > Scenario: agent 成功 step の最終 verdict / history が従来と一致する

---

### TC-007: 並列 member 実行が従来どおり動作する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 逐次 step の観測可能な挙動を不変に保つ > Scenario: 並列 member 実行が従来どおり動作する

---

### TC-008: catalog と歯の B-x ID が双方向一致する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: invariant B-13 / B-14 を歯と catalog で ratify する > Scenario: catalog と歯の B-x ID が双方向一致する

---

### TC-009: executor に禁止 call-site を再導入すると歯が red になる

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: invariant B-13 / B-14 を歯と catalog で ratify する > Scenario: executor に禁止 call-site を再導入すると歯が red になる

---

### TC-010: StepExecutionResult DU が exhaustive に判別できる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `StepExecutionResult` 型の値が `kind` フィールドを持ち、`"success"` / `"halt"` / `"skipped"` のいずれかが取りうる
**WHEN** `switch (result.kind)` で全 case を網羅し TypeScript の exhaustive check を適用する
**THEN** コンパイルエラーが出ず、`default` 節に到達する path が型レベルで `never` になる

---

### TC-011: 既存 6 factory の error / thrownErr が拡張前と一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `makeAgentThrowHalt` / `makeTimeoutHalt` / `makeNonSuccessHalt` / `makeDriftHalt` / `makeOutputGateHalt` / `makeCommitFailHalt` に従来と同じ引数を渡す（`recordOpts` / `history` field 追加前と同じシグネチャで呼ぶ）
**WHEN** 各 factory を呼ぶ
**THEN** 返る `error.code` / `error.message` / `error.hint` / `thrownErr` が `recordOpts` / `history` フィールド追加前と一致し、既存テストへの回帰がない

---

### TC-012: makeInputMissingHalt が正しい kind / code / history を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `validateRequiredInputs` が失敗し `err` と `stepName` と `recordOpts` を用意する
**WHEN** `makeInputMissingHalt(err, stepName, recordOpts)` を呼ぶ
**THEN** `kind === "failed"`、`error.code === "STEP_INPUT_MISSING"`、`history.label === "{step}-failed"` / `history.status === "error"` / `history.message` が `"${step} failed: ${code} — ${message}"` 形式であり、`recordOpts` が正しく設定される

---

### TC-013: makeCliStepFailHalt が正しい kind / code を返し history が未設定である

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `runCliStep` の `step.run` が throw し `err` と `stepName` と `recordOpts` を用意する
**WHEN** `makeCliStepFailHalt(err, stepName, recordOpts)` を呼ぶ
**THEN** `kind === "failed"`、`error.code === "CLI_STEP_FAILED"`、`error.message` が `"${step} failed: ${errMsg}"` 形式、`history` フィールドが `undefined`（追記なし）

---

### TC-014: commitHalt の全 path が throw で終わる（Promise\<never\>）

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `CommitOrchestrator` に `failed` variant の `StepHalt` と `awaiting-resume` variant の `StepHalt` をそれぞれ準備する
**WHEN** `commitHalt(step, state, halt)` を両 variant で呼ぶ
**THEN** 両経路とも `attachStateAndRethrow` が呼ばれ値を返さずに throw する。戻り型 `Promise<never>` が型チェックレベルでも成立する

---

### TC-015: commitSuccess の副作用順が現 finalizeStep と一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** mock store と mock EventBus を持つ `CommitOrchestrator` を準備し、producer が成功結果（`verdict` / `session` / `agentBranch` / `modelUsage` 等）を返す
**WHEN** `CommitOrchestrator.commitSuccess(step, state, deps, result)` を実行する
**THEN** mock の呼び出し記録が `pushStepResult` → `{step}-verdict` history 追記 → branch 設定 → `pullRequest` 反映 → usage 追記 → `store.persist` → lineage 追記 → `verdict:parsed` emit の順に一致する

---

### TC-016: commitSkipped の副作用順が現 finalizeSkippedStep と一致する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** mock store と mock EventBus を持つ `CommitOrchestrator` を準備し、activation skip の `skipReason` を用意する
**WHEN** `CommitOrchestrator.commitSkipped(step, state, skipReason)` を実行する
**THEN** mock の呼び出し記録が `pushStepResult`（`verdict: "skipped"`）→ `{step}-skipped` warning history → `verdict:parsed` emit（`"skipped"`）→ `store.persist` の順に一致する

---

### TC-017: commitHalt（failed）の副作用順が現 guard 適用ブロックと一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** mock store を持つ `CommitOrchestrator` を準備し、`kind === "failed"` の `StepHalt`（non-success / agent-throw / output-gate 系、`history` あり variant）を用意する
**WHEN** `CommitOrchestrator.commitHalt(step, state, halt)` を実行する
**THEN** `recordFailedStepResult` → `store.fail` → `store.appendHistory`（halt.history あり時）→ `store.persist` → `attachStateAndRethrow` の順で呼ばれ、throw する

---

### TC-018: commitHalt（awaiting-resume）の副作用順が現 guard 適用ブロックと一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** mock store を持つ `CommitOrchestrator` を準備し、`kind === "awaiting-resume"` の `StepHalt`（timeout / drift 系）を用意する
**WHEN** `CommitOrchestrator.commitHalt(step, state, halt)` を実行する
**THEN** `recordFailedStepResult` → `transitionJob("awaiting-resume", ...)` → `store.appendInterruption` → `store.appendHistory`（halt.history あり時）→ `store.persist` → `attachStateAndRethrow` の順で呼ばれ、throw する

---

### TC-019: execute シグネチャとコンストラクタ引数が不変

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** refactor 後の `StepExecutor`（producer 化済み）
**WHEN** 既存テスト `executor-commit-mutex` / `executor-drift-detection` / `executor-no-op` / `executor-resume-context` / `judge-verdict` をコンパイルして実行する
**THEN** コンパイルエラーなし・全テストが pass する（`execute(step, jobState, deps)` のシグネチャとコンストラクタ引数が不変）

---

### TC-020: finalizeStepArtifacts / commitMutex が producer 内に残存する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** refactor 後の `executor.ts`（producer 化済み）
**WHEN** `executor-commit-mutex.test.ts` の TC-035 を実行する
**THEN** TC-035 が pass する（`finalizeStepArtifacts`・`commitMutex` による git 直列化が executor producer 内に維持されている）

---

### TC-021: B-13 / B-14 の歯が refactor 後 green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `executor.ts` から禁止 call-site を除去し `CommitOrchestrator` が対応 call-site を持つ状態
**WHEN** `core-invariants.test.ts` の `describe("B-13")` と `describe("B-14")` を実行する
**THEN** 両 describe ブロックが green となる。liveness（`commit-orchestrator.ts` に対応 call-site が存在する）も通過し、executor に禁止 call-site が 0 件であることが確認される

---

### TC-022: domain-model.md に StepHalt Value Object が追加される

**Category**: manual
**Priority**: should
**Source**: tasks.md > T-04

**GIVEN** T-04 の成果物（`architecture/domain-model.md`）
**WHEN** `domain-model.md` の `## Value Objects` セクションを目視確認する
**THEN** `### StepHalt — step 停止判断の VO`（`failed` / `awaiting-resume` の DU）と `→ src/core/step/step-halt.ts` の参照が存在する

---

### TC-023: executor に mock store を渡して単一適用点を確認する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `commit-orchestrator.test.ts` で call-tracking mock store を使い `StepExecutor` をセットアップする
**WHEN** 成功・halt（failed）・halt（awaiting-resume）の各パスで `StepExecutor.execute` を実行する
**THEN** mock store の `persist` / `fail` への呼び出しが `CommitOrchestrator` 経由でのみ記録され、executor が直接呼んだ形跡が 0 件である

---

### TC-024: agent 失敗（non-success）の throw ＋ 最終 state が不変

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** agent step が non-success guard に入る（`completionReason !== "success"`）シナリオを用意する
**WHEN** `StepExecutor.execute` を通す
**THEN** 投げられる error に `state` が attach されており（`attachStateAndRethrow` 効果）、最終 state の `status === "failed"` / `error` フィールドが本変更前と一致する

---

### TC-025: awaiting-resume の resumePoint / interruption / history が不変

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** agent step が timeout または drift により `awaiting-resume` に遷移するシナリオを用意する
**WHEN** `StepExecutor.execute` を通す
**THEN** 最終 state の `resumePoint` / `interruption` エントリ / history エントリ列が本変更前と一致する

---

### TC-026: CLI step 成功パスの verdict ＋ 最終 state が不変

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** CLI step（prose-parse 等）が正常完了するシナリオを用意する
**WHEN** `StepExecutor.execute` を通す
**THEN** 返る `JobState` の `verdict` / `steps` 配列 / history エントリが本変更前と一致する

---

### TC-027: typecheck && test が全 green

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** T-01〜T-05 の全タスク完了後の codebase
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 両コマンドが exit code 0 で完了し、`core-invariants` / `invariant-catalog-parity` / `executor-*` / `commit-orchestrator` / 並列 e2e を含む全テストが pass する

---

### TC-028: commit-orchestrator.ts が core/step 層に配置され DSM edge を増やさない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** `src/core/step/commit-orchestrator.ts` が新規作成された状態
**WHEN** `core-invariants.test.ts` の DSM closure テストを実行する
**THEN** DSM closure が pass し、`commit-orchestrator.ts` が domain 層（`src/core/step/`）を逸脱する import を持たないことが確認される

---

## Result

```yaml
result: completed
total: 28
automated: 27
manual: 1
must: 24
should: 4
could: 0
blocked_reasons: []
```
