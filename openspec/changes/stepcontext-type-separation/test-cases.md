# Test Cases: StepContext 型分離 + _updatedState 責務重複の解消

## Summary

- **Total**: 22 cases
- **Automated** (unit/integration/e2e): 19
- **Manual**: 3
- **Priority**: must: 14, should: 6, could: 2

## Test Cases

### TC-001: StepContext interface の定義フィールド

**Category**: unit
**Priority**: must
**Source**: design.md D1, tasks.md 1.1

**GIVEN** `src/core/types.ts` に `StepContext` interface が定義されている
**WHEN** その interface のフィールドを確認する
**THEN** `config: SpecRunnerConfig`, `slug: string`, `cwd?: string`, `request: ParsedRequest`, `repo: OriginInfo` の 5 フィールドのみが存在し、`client`/`githubClient`/`sleepFn` は含まれない

---

### TC-002: PipelineDeps extends StepContext の型互換性

**Category**: unit
**Priority**: must
**Source**: design.md D1, tasks.md 1.2

**GIVEN** `PipelineDeps` が `extends StepContext` として定義されている
**WHEN** `PipelineDeps` 型のオブジェクトを `StepContext` 型の変数に代入する
**THEN** TypeScript のコンパイルエラーが発生しない（Liskov 置換原則が成立する）

---

### TC-003: PipelineDeps のフィールド重複がない

**Category**: unit
**Priority**: must
**Source**: design.md D1, tasks.md 1.2

**GIVEN** `PipelineDeps extends StepContext` に変更済み
**WHEN** `PipelineDeps` の定義を確認する
**THEN** `config`, `slug`, `cwd`, `request`, `repo` が `PipelineDeps` 本体に重複定義されておらず、`client?`, `githubClient`, `sleepFn?` のみが追加フィールドとして定義されている

---

### TC-004: StepDeps が StepContext の alias になっている

**Category**: unit
**Priority**: must
**Source**: design.md D2, tasks.md 1.3

**GIVEN** `src/core/step/types.ts` の `StepDeps` 型定義
**WHEN** `StepDeps` の alias 先を確認する
**THEN** `StepDeps = StepContext` であり、`PipelineDeps` への alias ではない

---

### TC-005: PipelineDeps を渡しても StepDeps 型引数に型エラーが出ない

**Category**: unit
**Priority**: must
**Source**: design.md D1 D2, tasks.md 1.4

**GIVEN** Step メソッド（`buildMessage`/`resultFilePath`/`parseResult`）が `StepDeps`（= `StepContext`）を受け取るよう定義されている
**WHEN** executor が `PipelineDeps` 型のオブジェクトをそれらのメソッドに渡す
**THEN** `bun run typecheck` がエラーなしで通る（`PipelineDeps extends StepContext` により型互換が成立）

---

### TC-006: ClaudeCodeRunner の undefined as any が残存しない

**Category**: unit
**Priority**: must
**Source**: design.md D5, tasks.md 2.1 2.2 2.3, request.md 受け入れ基準

**GIVEN** `src/adapter/claude-code/agent-runner.ts` の実装
**WHEN** `grep -r "undefined as any" src/` を実行する
**THEN** 結果が 0 件である

---

### TC-007: ClaudeCodeRunner の deps 構築が StepContext フィールドのみを使う

**Category**: unit
**Priority**: must
**Source**: design.md D5, tasks.md 2.1 2.2

**GIVEN** `src/adapter/claude-code/agent-runner.ts` で `buildMessage`/`resultFilePath` に渡す deps オブジェクトを構築している
**WHEN** その deps の型と内容を確認する
**THEN** deps の型が `StepContext` であり、`config`, `slug`, `cwd`, `request`, `repo` のみが含まれ、`client`/`githubClient` が含まれない

---

### TC-008: ManagedAgentRunner に JobStateStore の import がない

**Category**: unit
**Priority**: must
**Source**: design.md D3, tasks.md 3.1

**GIVEN** `src/adapter/managed-agent/agent-runner.ts` の import 一覧
**WHEN** ファイルの import 宣言を確認する
**THEN** `JobStateStore` の import が存在しない

---

### TC-009: ManagedAgentRunner の runProposeStyle が AgentRunResult のみ返す

**Category**: unit
**Priority**: must
**Source**: design.md D3, tasks.md 3.2

**GIVEN** `ManagedAgentRunner.runProposeStyle` の実装
**WHEN** 正常系の agent 実行が完了する
**THEN** 返り値の型が `AgentRunResult` であり、`_updatedState` フィールドが含まれない

---

### TC-010: ManagedAgentRunner の runPollingStyle が AgentRunResult のみ返す

**Category**: unit
**Priority**: must
**Source**: design.md D3, tasks.md 3.3

**GIVEN** `ManagedAgentRunner.runPollingStyle` の実装
**WHEN** 正常系の agent 実行が完了する
**THEN** 返り値の型が `AgentRunResult` であり、`_updatedState` フィールドが含まれない

---

### TC-011: _updatedState が残存しない

**Category**: unit
**Priority**: must
**Source**: design.md D3 D4, tasks.md 3.4, request.md 受け入れ基準

**GIVEN** リファクタリング完了後の `src/` 以下全ファイル
**WHEN** `grep -r "_updatedState" src/` を実行する
**THEN** 結果が 0 件である

---

### TC-012: executor の runAgentStep 冒頭で store.update を呼ぶ

**Category**: unit
**Priority**: must
**Source**: design.md D4, tasks.md 4.1, request.md 受け入れ基準

**GIVEN** `src/core/step/executor.ts` の `runAgentStep` 実装
**WHEN** `runAgentStep` の最初の処理シーケンスを確認する
**THEN** `store.update(state, { step: step.name })` が runner.run より前に呼ばれている

---

### TC-013: executor の runAgentStep に managed/local 分岐が存在しない

**Category**: unit
**Priority**: must
**Source**: design.md D4, tasks.md 4.2, request.md 受け入れ基準

**GIVEN** `src/core/step/executor.ts` の `runAgentStep` 実装
**WHEN** 関数内の分岐を確認する
**THEN** `_updatedState` の有無を判定する if 分岐が存在しない（state 管理が 1 本道になっている）

---

### TC-014: executor が result.sessionId を step result の session フィールドに記録する

**Category**: integration
**Priority**: must
**Source**: design.md D4, tasks.md 4.3

**GIVEN** executor の `runAgentStep` が `AgentRunResult` を受け取った後の処理
**WHEN** `runner.run` が `sessionId` を含む `AgentRunResult` を返す
**THEN** `pushStepResult` または `store.appendHistory` に渡す step result に `sessionId` が記録されている

---

### TC-015: executor が result.agentBranch を state.branch にセットする

**Category**: integration
**Priority**: should
**Source**: design.md D4, tasks.md 4.4

**GIVEN** executor の `runAgentStep` が `agentBranch` を含む `AgentRunResult` を受け取った後の処理
**WHEN** `runner.run` が `agentBranch` を含む `AgentRunResult` を返し、かつ `state.branch` が未設定
**THEN** `state.branch` に `agentBranch` の値がセットされる

---

### TC-016: executor が result.agentBranch を既存 state.branch を上書きしない

**Category**: unit
**Priority**: should
**Source**: design.md D4, tasks.md 4.4

**GIVEN** executor の `runAgentStep` が `agentBranch` を含む `AgentRunResult` を受け取った後の処理
**WHEN** `runner.run` が `agentBranch` を含む `AgentRunResult` を返し、かつ `state.branch` がすでに設定されている
**THEN** `state.branch` が変更されない

---

### TC-017: executor が step 開始/完了の history entry を追加する

**Category**: integration
**Priority**: should
**Source**: design.md D3 D4（D3 リスク緩和策）, tasks.md 4.5

**GIVEN** executor の `runAgentStep` が正常系で完了する
**WHEN** step の実行前後の history を確認する
**THEN** step 開始時と完了時の history entry が `store.appendHistory` に記録されている

---

### TC-018: ManagedAgentRunner の store 操作が除去されてもセッション操作は残る

**Category**: unit
**Priority**: should
**Source**: design.md D3 Non-Goals

**GIVEN** `src/adapter/managed-agent/agent-runner.ts` の実装
**WHEN** sessionClient と githubClient の使用箇所を確認する
**THEN** `sessionClient.create`/`send`/`pollMessages` および `githubClient.getRawFile` の呼び出しが残っている

---

### TC-019: bun run typecheck が green

**Category**: manual
**Priority**: must
**Source**: tasks.md 1.4 5.4, request.md 受け入れ基準

**GIVEN** リファクタリング完了後のソースコード
**WHEN** `bun run typecheck` を実行する
**THEN** TypeScript の型エラーが 0 件で終了する

---

### TC-020: bun run test が全テスト pass

**Category**: manual
**Priority**: must
**Source**: tasks.md 5.5, request.md 受け入れ基準

**GIVEN** リファクタリング完了後のソースコードとテストコード
**WHEN** `bun run test` を実行する
**THEN** 全テストが PASS し、FAIL が 0 件である

---

### TC-021: ManagedAgentRunner テストが JobStateStore mock なしで動く

**Category**: integration
**Priority**: should
**Source**: design.md Risks/Trade-offs, tasks.md 5.2

**GIVEN** `ManagedAgentRunner` のテストファイル
**WHEN** `JobStateStore` の mock を除去した状態でテストを実行する
**THEN** テストが `AgentRunResult` の返り値のみを検証し、全ケースが PASS する

---

### TC-022: specrunner ps の step 列が実行中ステップ名を表示する

**Category**: manual
**Priority**: could
**Source**: design.md Goals（ps 表示バグ修正）, tasks.md 4.1, request.md Phase 4 要件 13

**GIVEN** agent step が実行中の pipeline がある
**WHEN** `specrunner ps` で一覧を確認する
**THEN** step 列に `init` ではなく現在実行中の step 名が表示されている
