# Test Cases: refactor-executor-finalize-step

> 振る舞い不変リファクタリング。既存テストが全 pass することが最重要。以下は regression guard と新メソッドの契約検証に重点を置く。

## TC-01: finalizeStep が runAgentStep から呼ばれる【must】

**GIVEN** executor.ts に `finalizeStep` private メソッドが存在する  
**WHEN** `runAgentStep` の success path を追跡する  
**THEN** `pushStepResult` の呼び出しが `finalizeStep` 内の 1 箇所のみに存在する（`grep -c "pushStepResult" executor.ts === 1`）

---

## TC-02: finalizeStep が runCliStep から呼ばれる【must】

**GIVEN** executor.ts に `finalizeStep` private メソッドが存在する  
**WHEN** `runCliStep` の success path を追跡する  
**THEN** `events.emit("verdict:parsed", ...)` の呼び出しが `finalizeStep` 内の 1 箇所のみに存在する（`grep -c "verdict:parsed" executor.ts === 1`）

---

## TC-03: executor.ts の行数が 280 行以下【must】

**GIVEN** finalizeStep への統合が完了している  
**WHEN** `wc -l src/core/step/executor.ts` を実行する  
**THEN** 行数が 280 以下である

---

## TC-04: 全既存テストが pass する【must】

**GIVEN** リファクタリング後の executor.ts  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass する（red になるテストが 0 件）

---

## TC-05: typecheck が green【must】

**GIVEN** リファクタリング後の executor.ts  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件

---

## TC-06: Agent step — resultContent が non-null のとき verdict をパースする【must】

**GIVEN** runAgentStep が `completionReason === "success"` で戻る  
**AND** `result.resultContent` が `"approved"` を含む文字列  
**WHEN** `finalizeStep` が呼ばれる  
**THEN** `step.parseResult(resultContent, deps)` が呼ばれ、その verdict が `pushStepResult` に渡される

---

## TC-07: Agent step — resultContent が null かつ completionVerdict がある場合はフォールバック【must】

**GIVEN** runAgentStep が `result.resultContent === null` で戻る  
**AND** `step.completionVerdict` が `"approved"` に設定されている  
**WHEN** `finalizeStep` が呼ばれる  
**THEN** `step.parseResult` は呼ばれず、verdict は `"approved"` として扱われる  
**AND** warning は stderr に出力されない

---

## TC-08: CLI step — resultFile が読めない場合は escalation にフォールバック【must】

**GIVEN** runCliStep の `step.run()` が成功する  
**AND** `readFile` がエラーをスローする（ファイル不存在）  
**WHEN** `finalizeStep` が呼ばれる（fileContent = null）  
**THEN** `stderrWrite` で warning が出力される  
**AND** verdict が `"escalation"` として `pushStepResult` に渡される

---

## TC-09: verdict が null の場合は escalation + warning【must】

**GIVEN** `resultContent` が存在するが `step.parseResult()` が `{ verdict: null }` を返す  
**WHEN** `finalizeStep` が呼ばれる  
**THEN** `stderrWrite` が `"${step.kind} step '${step.name}'"` を含む warning を出力する  
**AND** verdict が `"escalation"` として扱われる

---

## TC-10: warning メッセージが step.kind と step.name を含む【should】

**GIVEN** verdict パースに失敗した（verdict === null）  
**WHEN** warning が stderr に書き出される  
**THEN** メッセージが `Warning: Could not parse verdict from ${step.kind} step '${step.name}'. Treating as escalation.` の形式である  
**AND** CLI step でも agent step でも同形式のメッセージが使用される（D4）

---

## TC-11: verdict:parsed イベントが発火される【must】

**GIVEN** `finalizeStep` が実行される  
**WHEN** verdict が確定した後  
**THEN** `events.emit("verdict:parsed", { step: step.name, outcome: { verdict } })` が正確に 1 回発火される

---

## TC-12: appendHistory が verdict エントリを追加する【must】

**GIVEN** `finalizeStep` が実行される  
**WHEN** `store.appendHistory` が呼ばれる  
**THEN** `step: "${step.name}-verdict"`, `status: "ok"`, `message: "${step.name} verdict: ${verdict}"` のエントリが追加される

---

## TC-13: store.persist が finalizeStep 内で呼ばれる【must】

**GIVEN** `finalizeStep` が実行される  
**WHEN** `store.appendHistory` 完了後  
**THEN** `store.persist(state)` が呼ばれ、更新済み state が永続化される  
**AND** `grep -c "store.persist" executor.ts` が 3 以下（finalizeStep 内 1 + エラーパス 2）

---

## TC-14: Agent step — sessionId が pushStepResult の session に渡される【must】

**GIVEN** `agentResult.sessionId` が `"sess-abc"` である  
**WHEN** `finalizeStep` が `pushStepResult` を呼ぶ  
**THEN** `session: { id: "sess-abc", agentId: "", environmentId: "" }` が渡される

---

## TC-15: Agent step — sessionId が undefined の場合は session が null【should】

**GIVEN** `agentResult.sessionId` が `undefined` または `agentResult` 自体が undefined  
**WHEN** `finalizeStep` が `pushStepResult` を呼ぶ  
**THEN** `session: null` が渡される

---

## TC-16: Agent step — modelUsage が pushStepResult に渡される【should】

**GIVEN** `agentResult.modelUsage` が `{ "claude-opus-4": { inputTokens: 100, outputTokens: 50 } }` である  
**WHEN** `finalizeStep` が `pushStepResult` を呼ぶ  
**THEN** `modelUsage` が同値で渡される

---

## TC-17: CLI step — pushStepResult に modelUsage が渡されない【should】

**GIVEN** `finalizeStep` が CLI step から呼ばれる（agentResult なし）  
**WHEN** `pushStepResult` が呼ばれる  
**THEN** `modelUsage` が `undefined`（または省略）で渡される

---

## TC-18: agentBranch が state.branch を設定する（branch 未設定時）【must】

**GIVEN** `agentResult.agentBranch` が `"feat/some-branch"` である  
**AND** `state.branch` が `null` または `undefined`  
**WHEN** `finalizeStep` が実行される  
**THEN** 返却された `state.branch` が `"feat/some-branch"` になる

---

## TC-19: agentBranch は state.branch が既存の場合は上書きしない【should】

**GIVEN** `agentResult.agentBranch` が `"feat/new-branch"` である  
**AND** `state.branch` が `"feat/existing-branch"` に設定済み  
**WHEN** `finalizeStep` が実行される  
**THEN** 返却された `state.branch` が `"feat/existing-branch"` のまま変わらない

---

## TC-20: setsBranch === true の場合に branch を生成する（branch 未設定時）【must】

**GIVEN** `step.setsBranch === true` である  
**AND** `state.branch` が `null` または `undefined`  
**AND** `agentResult.agentBranch` が `undefined`  
**WHEN** `finalizeStep` が実行される  
**THEN** `getBranchPrefix(deps.request.type)` が呼ばれ、`${prefix}${deps.slug}-${state.jobId.slice(0, 8)}` 形式の branch が state にセットされる

---

## TC-21: setsBranch === true でも state.branch が既存なら branch を生成しない【should】

**GIVEN** `step.setsBranch === true` である  
**AND** `state.branch` が `"feat/already-set"` に設定済み  
**WHEN** `finalizeStep` が実行される  
**THEN** `getBranchPrefix` は呼ばれない  
**AND** `state.branch` が `"feat/already-set"` のまま

---

## TC-22: CLI step — setsBranch / agentBranch フィールドがなく branch は変更されない【should】

**GIVEN** `finalizeStep` が CLI step から呼ばれる（agentResult なし、CliStep は `setsBranch` フィールドを持たない）  
**AND** `state.branch` が `null`  
**WHEN** `finalizeStep` が実行される  
**THEN** `state.branch` が `null` のまま（branch 生成が発生しない）

---

## TC-23: pushStepResult の呼び出しが executor.ts 全体で 1 箇所のみ【must】

**GIVEN** finalizeStep への統合が完了している  
**WHEN** `grep -c "pushStepResult" src/core/step/executor.ts` を実行する  
**THEN** 結果が `1`

---

## TC-24: Agent step のエラーパスは finalizeStep を呼ばない【must】

**GIVEN** `runner.run()` がエラーをスローする  
**WHEN** `runAgentStep` のエラーハンドリングが実行される  
**THEN** `finalizeStep` は呼ばれない  
**AND** `attachStateAndRethrow` が呼ばれてエラーが再スローされる

---

## TC-25: CLI step のエラーパスは finalizeStep を呼ばない【must】

**GIVEN** `step.run()` がエラーをスローする  
**WHEN** `runCliStep` のエラーハンドリングが実行される  
**THEN** `finalizeStep` は呼ばれない  
**AND** `attachStateAndRethrow` が呼ばれてエラーが再スローされる

---

## TC-26: finalizeStep の返り値が runAgentStep / runCliStep から返却される【must】

**GIVEN** `finalizeStep` が更新済み `state` を返す  
**WHEN** `runAgentStep` または `runCliStep` が `finalizeStep` の結果を return する  
**THEN** `execute()` が受け取る JobState が `finalizeStep` から返された state と同一である

---

## TC-27: resultContent が存在し completionVerdict も存在する場合は resultContent 優先【could】

**GIVEN** `result.resultContent` が non-null の文字列を持つ  
**AND** `step.completionVerdict` も設定されている  
**WHEN** `finalizeStep` が呼ばれる  
**THEN** `step.parseResult` が呼ばれ（resultContent 優先）、`step.completionVerdict` は参照されない
