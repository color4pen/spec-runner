# Test Cases: 各 step が入出力を宣言し、実行前に入力の存在を検証する

## Summary

- **Total**: 32 cases
- **Automated** (unit/integration): 32
- **Manual**: 0
- **Priority**: must: 26, should: 6, could: 0

---

## I/O 宣言（reads / writes）

### TC-001: 全 step が reads / writes を宣言している

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 各 step は読み書きするファイルを宣言する > Scenario: 全 step が reads / writes を宣言している

### TC-002: 宣言は util/paths を参照して path を導出する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 各 step は読み書きするファイルを宣言する > Scenario: 宣言は util/paths を参照して path を導出する

### TC-031: 全 12 step の宣言 path が util/paths 由来であり、ハードコード文字列を新規追加していない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** 12 step の reads / writes 実装
**WHEN** 各 step の reads / writes 実装を確認する
**THEN** path は util/paths の関数呼び出し結果であり、文字列リテラルで path を直接定義する箇所が新規追加されていない

### TC-032: adr-gen の writes ADR path が adr-gen 内の宣言にのみ存在する

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 / design.md > D5

**GIVEN** 本変更適用後のコードベース
**WHEN** ADR の成果物 path を他の step / 設計文書で参照していないか確認する
**THEN** ADR path の定義は adr-gen の writes 宣言のみにあり、design.md / tasks.md / 他 step には記述されていない

---

## 型・インターフェース（IoRef / Step 契約）

### TC-014: reads / writes を実装しない既存 Step ダブルがコンパイルエラーにならない

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** reads / writes を実装していないテスト用 Step ダブル（optional メソッドのため型互換）
**WHEN** bun run typecheck を実行する
**THEN** コンパイルエラーが発生しない

---

## iteration 解決（nextIteration / latestIteration）

### TC-003: writes は自 step の次反復に解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `{n}` は job state の iteration に解決される > Scenario: writes は自 step の次反復に解決される

### TC-004: reads は producer の最新反復に解決される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: `{n}` は job state の iteration に解決される > Scenario: reads は producer の最新反復に解決される

### TC-012: nextIteration / latestIteration が既存 inline 算出と同値を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** JobState に stepName の実行記録が複数ある（length = n）
**WHEN** nextIteration(state, stepName) と latestIteration(state, stepName) を呼ぶ
**THEN** nextIteration = n + 1、latestIteration = n となり、getOutputTemplates 等の既存 inline 算出と同値

### TC-013: producer 未実行時 latestIteration が 0 を返す

**Category**: unit
**Priority**: should
**Source**: design.md > D2

**GIVEN** JobState に対象 step の記録が無い（state.steps[stepName] が undefined）
**WHEN** latestIteration(state, stepName) を呼ぶ
**THEN** 0 を返し、この値で util/paths を呼ぶと存在しない path（例: xxx-000.md）が導出される

---

## 事前検証 — LocalRuntime

### TC-005: 必須入力が存在すれば step は実行される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: step 実行前に必須入力の存在を検証する > Scenario: 必須入力が存在すれば step は実行される

### TC-006: 必須入力が欠落していれば明示エラーで停止する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: step 実行前に必須入力の存在を検証する > Scenario: 必須入力が欠落していれば明示エラーで停止する

### TC-016: LocalRuntime — 必須 file が worktree に存在する場合は resolve する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** worktree に RequiredInput の path が存在する
**WHEN** LocalRuntime.validateStepInputs([{ path, artifact: "file" }], cwd, null) を呼ぶ
**THEN** Promise が resolve する

### TC-017: LocalRuntime — 必須 file が worktree に存在しない場合は STEP_INPUT_MISSING で reject する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** worktree に RequiredInput の path が存在しない
**WHEN** LocalRuntime.validateStepInputs([{ path, artifact: "file" }], cwd, null) を呼ぶ
**THEN** SpecRunnerError("STEP_INPUT_MISSING") で reject し、エラーメッセージに欠落 path を含む

---

## 事前検証 — ManagedRuntime

### TC-007: 検証は両 runtime で同じ宣言 path を対象にする

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: step 実行前に必須入力の存在を検証する > Scenario: 検証は両 runtime で同じ宣言 path を対象にする

### TC-018: ManagedRuntime — file が branch git state に存在する場合は resolve する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** origin/<branch> に RequiredInput の path が存在する（git cat-file -e が成功する）
**WHEN** ManagedRuntime.validateStepInputs([{ path, artifact: "file" }], cwd, branch) を呼ぶ
**THEN** Promise が resolve する

### TC-019: ManagedRuntime — file が branch git state に存在しない場合は STEP_INPUT_MISSING で reject する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04 Acceptance Criteria

**GIVEN** origin/<branch> に RequiredInput の path が存在しない
**WHEN** ManagedRuntime.validateStepInputs([{ path, artifact: "file" }], cwd, branch) を呼ぶ
**THEN** SpecRunnerError("STEP_INPUT_MISSING") で reject し、エラーメッセージに欠落 path を含む

### TC-020: ManagedRuntime — validateStepInputs が stdout を汚さない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D3

**GIVEN** ManagedRuntime.validateStepInputs を呼ぶ（fetch / cat-file の経路を含む）
**WHEN** stdout をキャプチャした状態で実行する
**THEN** stdout に何も書き出されない（stderr のみ許容）

---

## executor 配線

### TC-021: StepExecutor — 必須入力欠落時に agent session 起動前に halt し、failed StepRun が state に記録される

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** AgentStep の必須 reads が worktree に存在しない
**WHEN** StepExecutor が当該 step を実行しようとする
**THEN** runner.run() が呼ばれる前に STEP_INPUT_MISSING が throw され、recordFailedStepResult + store.fail + step:error emit が行われ、failed StepRun が state に記録される

### TC-022: StepExecutor — CliStep でも実行前に事前検証が走る

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** CliStep の必須 reads が存在しない
**WHEN** StepExecutor が当該 CliStep を実行しようとする
**THEN** step.run() が呼ばれる前に STEP_INPUT_MISSING で停止する

### TC-015: required: false な reads は RequiredInput に射影されない

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 / design.md > D5

**GIVEN** ある step の reads に required: false のエントリが含まれる
**WHEN** StepExecutor が reads を解決して RequiredInput[] に射影する
**THEN** required: false のエントリは RequiredInput[] に含まれず、validateStepInputs に渡されない

### TC-023: StepExecutor — runtimeStrategy 未注入時は validateStepInputs をスキップする

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** StepExecutor に runtimeStrategy が注入されていない
**WHEN** reads を持つ step を実行しようとする
**THEN** 検証ステップがスキップされ、step 本体の実行に進む

---

## fixer 置換（state 逆引き halt → 宣言入力＋事前検証）

### TC-008: code-fixer は state 逆引きせず宣言由来の path を使う

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 直し工程の state 逆引き halt を宣言入力＋事前検証へ置換する > Scenario: code-fixer は state 逆引きせず宣言由来の path を使う

### TC-009: 旧 halt error code が廃止される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 直し工程の state 逆引き halt を宣言入力＋事前検証へ置換する > Scenario: 旧 halt error code が廃止される

### TC-024: spec-fixer — buildMessage が latestIteration(state, "spec-review") 由来の path を使う

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** spec-review が過去 n 回実行された state
**WHEN** spec-fixer.buildMessage(state, deps) を呼ぶ
**THEN** prompt に埋め込まれる path は specReviewResultPath(slug, n) であり、`?? specReviewResultPath(slug, 1)` fallback による上書きは行われない

### TC-025: build-fixer — buildMessage が verificationResultPath(slug) で findings path を導出する

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** verification が完了した state
**WHEN** build-fixer.buildMessage(state, deps) を呼ぶ
**THEN** prompt の findings path は verificationResultPath(slug) であり、getLatestStepResult(state, "verification").findingsPath への参照が存在しない

### TC-026: getLatestStepResult 関数がコードベースに残っている

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** 本変更適用後のコードベース
**WHEN** getLatestStepResult の参照を確認する
**THEN** fixer の buildMessage からは除去されているが、関数自体（transition の when 等で使われる）は削除されていない

### TC-027: code-fixer / build-fixer の既存テストが STEP_INPUT_MISSING 経路で green になる

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** 旧 CODE_FIXER_NO_REVIEW_RESULT / BUILD_FIXER_NO_VERIFICATION_RESULT を参照していたテスト
**WHEN** bun run test を実行する
**THEN** 各テストが STEP_INPUT_MISSING 経路の期待値で通過する

---

## 挙動不変・回帰

### TC-010: 標準フローで事前検証は素通りする

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 標準 pipeline の挙動は不変である > Scenario: 標準フローで事前検証は素通りする

### TC-011: util/paths とその使い手は不変

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 標準 pipeline の挙動は不変である > Scenario: util/paths とその使い手は不変

### TC-028: 標準 pipeline の stdout スナップショットに差分がない

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** 本変更適用後のコードベースで標準 pipeline をシミュレーションする
**WHEN** cli-stdout-snapshot.test.ts 等のスナップショットテストを実行する
**THEN** 画面出力のスナップショットに差分が無い

### TC-029: bun run typecheck が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08 Acceptance Criteria

**GIVEN** 本変更適用後のコードベース
**WHEN** bun run typecheck を実行する
**THEN** 型エラーが 0 件

### TC-030: bun run test が green

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08 Acceptance Criteria

**GIVEN** 本変更適用後のコードベース
**WHEN** bun run test を実行する
**THEN** テスト失敗が 0 件

---

## Result

```yaml
result: completed
total: 32
automated: 32
manual: 0
must: 26
should: 6
could: 0
blocked_reasons: []
```
