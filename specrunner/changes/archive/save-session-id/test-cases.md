# Test Cases: save-session-id

## TC-001: session_id が success result から AgentRunResult に伝播する

- **Category**: correctness
- **Priority**: must
- **Source**: T2, T3 / 受け入れ基準①

**GIVEN** SDK `query()` が `session_id: "abc-123"` を含む success result を返す  
**WHEN** `ClaudeCodeRunner.run()` が完了する  
**THEN** 返り値の `AgentRunResult.sessionId` が `"abc-123"` と一致する

---

## TC-002: sessionId が StepRun に記録される

- **Category**: correctness
- **Priority**: must
- **Source**: T3 / 受け入れ基準①

**GIVEN** `AgentRunResult.sessionId` に `"abc-123"` が設定されている  
**WHEN** `StepExecutor.finalizeStep()` が `AgentRunResult` を処理する  
**THEN** job state JSON の `StepRun.sessionId` が `"abc-123"` になる（null にならない）

---

## TC-003: session_id が取得できない場合は undefined のまま

- **Category**: correctness
- **Priority**: must
- **Source**: T2 / 要件③ / 受け入れ基準②

**GIVEN** SDK `query()` が `session_id` フィールドを持たない（または `undefined`）success result を返す  
**WHEN** `ClaudeCodeRunner.run()` が完了する  
**THEN** `AgentRunResult.sessionId` が `undefined` である（エラーにならない）

---

## TC-004: success ブロックを通過しない場合は sessionId が undefined

- **Category**: correctness
- **Priority**: must
- **Source**: T1 / 要件③

**GIVEN** SDK `query()` が subtype `"error"` の result を返す（success ブロックを通過しない）  
**WHEN** `ClaudeCodeRunner.run()` が完了する  
**THEN** 返り値の `completionReason` が `"error"` であり、`sessionId` フィールドが含まれない（または `undefined`）

---

## TC-005: timeout 時は sessionId が undefined

- **Category**: correctness
- **Priority**: must
- **Source**: T1 / 要件③

**GIVEN** AbortController による timeout が発火する  
**WHEN** `ClaudeCodeRunner.run()` が完了する  
**THEN** 返り値の `completionReason` が `"timeout"` であり、`sessionId` は含まれない（または `undefined`）

---

## TC-006: session_id 抽出は modelUsage 抽出と共存する

- **Category**: correctness
- **Priority**: must
- **Source**: T2

**GIVEN** SDK `query()` が `session_id: "abc-123"` と `modelUsage` の両方を含む success result を返す  
**WHEN** `ClaudeCodeRunner.run()` が完了する  
**THEN** `AgentRunResult.sessionId` が `"abc-123"` であり、かつ `AgentRunResult.modelUsage` も正しく設定される（両フィールドが共存する）

---

## TC-007: typecheck が pass する

- **Category**: correctness
- **Priority**: must
- **Source**: T3 / 検証

**GIVEN** T1〜T4 の変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了する

---

## TC-008: 既存テストが全 pass する

- **Category**: correctness
- **Priority**: must
- **Source**: 検証

**GIVEN** T1〜T4 の変更が適用されている  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが PASS する（regression なし）

---

## TC-009: AgentRunResult.sessionId の JSDoc が実態を反映する

- **Category**: maintainability
- **Priority**: should
- **Source**: T4

**GIVEN** `src/core/port/agent-runner.ts` の `sessionId` フィールドの JSDoc が更新されている  
**WHEN** コードを読む  
**THEN** JSDoc が `"Session ID from the agent runtime (undefined when not available)"` であり、`"managed runtime"` 限定という誤記が除去されている

---

## TC-010: lastResult が null の場合でも session_id 抽出でエラーにならない

- **Category**: correctness
- **Priority**: should
- **Source**: T2 / 要件③

**GIVEN** SDK `query()` がメッセージを一件も返さず `lastResult` が `null` のまま終了する  
**WHEN** `ClaudeCodeRunner.run()` が完了する  
**THEN** `sessionId` が `undefined` であり、エラーや例外がスローされない
