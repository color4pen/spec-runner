# Test Cases: managed-agent-usage-tracking

## TC-01: mapSessionUsage — null 入力

- **Category**: Unit / Pure Function
- **Priority**: must
- **Source**: tasks.md Task 5, request.md 要件 2

**GIVEN** `mapSessionUsage` に `null` を渡す  
**WHEN** 関数を呼ぶ  
**THEN** `undefined` を返す

---

## TC-02: mapSessionUsage — undefined 入力

- **Category**: Unit / Pure Function
- **Priority**: must
- **Source**: tasks.md Task 5, request.md 要件 2

**GIVEN** `mapSessionUsage` に `undefined` を渡す  
**WHEN** 関数を呼ぶ  
**THEN** `undefined` を返す

---

## TC-03: mapSessionUsage — 全フィールド present

- **Category**: Unit / Pure Function
- **Priority**: must
- **Source**: tasks.md Task 5, design.md D2

**GIVEN** `{ input_tokens: 100, output_tokens: 200, cache_read_input_tokens: 50, cache_creation: { ephemeral_1h_input_tokens: 30, ephemeral_5m_input_tokens: 20 } }` を渡す  
**WHEN** 関数を呼ぶ  
**THEN** `{ inputTokens: 100, outputTokens: 200, cacheReadInputTokens: 50, cacheCreationInputTokens: 50 }` を返す (30+20=50)

---

## TC-04: mapSessionUsage — 全フィールド undefined (空オブジェクト)

- **Category**: Unit / Pure Function
- **Priority**: must
- **Source**: tasks.md Task 5, design.md D2 (undefined → 0 埋め)

**GIVEN** `{}` (全フィールド欠損) を渡す  
**WHEN** 関数を呼ぶ  
**THEN** `{ inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }` を返す

---

## TC-05: mapSessionUsage — cache_creation 片方だけ present

- **Category**: Unit / Pure Function
- **Priority**: must
- **Source**: tasks.md Task 5, request.md 要件 2 (ネスト平坦化)

**GIVEN** `{ cache_creation: { ephemeral_1h_input_tokens: 40 } }` を渡す (`ephemeral_5m_input_tokens` 欠損)  
**WHEN** 関数を呼ぶ  
**THEN** `cacheCreationInputTokens: 40` を返す (0+40=40)

---

## TC-06: mapSessionUsage — cache_creation 自体が undefined

- **Category**: Unit / Pure Function
- **Priority**: must
- **Source**: tasks.md Task 5, design.md D2

**GIVEN** `{ input_tokens: 10, output_tokens: 20 }` を渡す (`cache_creation` フィールド自体なし)  
**WHEN** 関数を呼ぶ  
**THEN** `cacheCreationInputTokens: 0` を返す

---

## TC-07: SessionClient port — getSessionUsage の型契約

- **Category**: Static / Type Check
- **Priority**: must
- **Source**: tasks.md Task 1, request.md 要件 1, design.md D1

**GIVEN** `src/core/port/session-client.ts` の `SessionClient` interface  
**WHEN** `bun run typecheck` を実行する  
**THEN** `getSessionUsage(sessionId: string): Promise<SessionUsage | undefined>` が定義されており型エラーなし

---

## TC-08: SessionClient port — SDK 型非露出

- **Category**: Static / Architecture
- **Priority**: must
- **Source**: request.md 要件 1, design.md D1 / D6

**GIVEN** `src/core/port/session-client.ts`  
**WHEN** ファイル内の import を確認する  
**THEN** `@anthropic-ai/sdk` を import していない (`SessionUsage` は手書き interface)

---

## TC-09: AnthropicSessionClient.getSessionUsage — 正常系

- **Category**: Unit / Adapter
- **Priority**: must
- **Source**: tasks.md Task 3, design.md D3

**GIVEN** `retrieveSession` が `{ usage: { input_tokens: 100, output_tokens: 200 } }` を返す mock  
**WHEN** `getSessionUsage(sessionId)` を呼ぶ  
**THEN** `{ inputTokens: 100, outputTokens: 200, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 }` を返す

---

## TC-10: AnthropicSessionClient.getSessionUsage — API 失敗時 best-effort

- **Category**: Unit / Adapter
- **Priority**: must
- **Source**: tasks.md Task 3, request.md 要件 3 (best-effort), design.md D3

**GIVEN** `retrieveSession` が例外を throw する mock  
**WHEN** `getSessionUsage(sessionId)` を呼ぶ  
**THEN** 例外は伝播せず `undefined` を返す

---

## TC-11: AnthropicSessionClient.getSessionUsage — session.usage が undefined

- **Category**: Unit / Adapter
- **Priority**: should
- **Source**: design.md D3, request.md 外部 API 制約 (全フィールド optional)

**GIVEN** `retrieveSession` が `{ usage: undefined }` を返す mock  
**WHEN** `getSessionUsage(sessionId)` を呼ぶ  
**THEN** `undefined` を返す

---

## TC-12: SSE 経路 — usage が modelUsage に反映される

- **Category**: Unit / agent-runner
- **Priority**: must
- **Source**: tasks.md Task 6b, request.md 要件 3, design.md D5

**GIVEN** SSE end_turn 成功シナリオで `sessionClient.getSessionUsage` が `SessionUsage` を返す mock  
**WHEN** `run()` を実行する  
**THEN** 返り値の `modelUsage` が `{ [step.agent.model]: <SessionUsage> }` である

---

## TC-13: SSE 経路 — モデルキーは step.agent.model

- **Category**: Unit / agent-runner
- **Priority**: must
- **Source**: request.md 要件 4, design.md D4

**GIVEN** `step.agent.model = "claude-opus-4-5"` で SSE end_turn 成功  
**WHEN** `run()` を実行する  
**THEN** `modelUsage` のキーが `"claude-opus-4-5"` である

---

## TC-14: SSE 経路 — usage read 失敗時 pipeline 継続

- **Category**: Unit / agent-runner
- **Priority**: must
- **Source**: tasks.md Task 6c, request.md 要件 3 (best-effort)

**GIVEN** SSE end_turn 成功シナリオで `sessionClient.getSessionUsage` が `undefined` を返す mock  
**WHEN** `run()` を実行する  
**THEN** `completionReason === "success"` かつ `modelUsage === undefined` で正常終了 (例外なし)

---

## TC-15: Polling 経路 — usage が modelUsage に反映される

- **Category**: Unit / agent-runner
- **Priority**: must
- **Source**: tasks.md Task 6a, request.md 要件 3, design.md D5

**GIVEN** polling 成功シナリオで `sessionClient.getSessionUsage` が `SessionUsage` を返す mock  
**WHEN** `run()` を実行する  
**THEN** 返り値の `modelUsage` が `{ [step.agent.model]: <SessionUsage> }` である

---

## TC-16: Polling 経路 — モデルキーは step.agent.model

- **Category**: Unit / agent-runner
- **Priority**: must
- **Source**: request.md 要件 4, design.md D4

**GIVEN** `step.agent.model = "claude-sonnet-4-5"` で polling 成功  
**WHEN** `run()` を実行する  
**THEN** `modelUsage` のキーが `"claude-sonnet-4-5"` である

---

## TC-17: Polling 経路 — usage read 失敗時 pipeline 継続

- **Category**: Unit / agent-runner
- **Priority**: must
- **Source**: tasks.md Task 6c, request.md 要件 3 (best-effort)

**GIVEN** polling 成功シナリオで `sessionClient.getSessionUsage` が `undefined` を返す mock  
**WHEN** `run()` を実行する  
**THEN** `completionReason === "success"` かつ `modelUsage === undefined` で正常終了 (例外なし)

---

## TC-18: follow-up turn — session cumulative で総量

- **Category**: Unit / agent-runner
- **Priority**: must
- **Source**: request.md 要件 3 (終端 1 read = 総量), design.md D5

**GIVEN** follow-up turn を含む SSE/polling シナリオで `getSessionUsage` が cumulative な `SessionUsage` を返す mock  
**WHEN** `run()` が全 turn 完了後に usage read する  
**THEN** `getSessionUsage` 呼び出し回数は 1 回のみ (turn 数に依らず)

---

## TC-19: usage read の呼び出しタイミング — follow-up 完了後

- **Category**: Unit / agent-runner
- **Priority**: should
- **Source**: design.md D5 (「全 turn 完了 → usage read → result 組み立て」の順序)

**GIVEN** follow-up turn を含む SSE 経路  
**WHEN** `run()` を実行する  
**THEN** `getSessionUsage` は follow-up turn の処理が完了した後に呼ばれる (= turn ループ内では呼ばれない)

---

## TC-20: 型検査 — 全変更ファイルで typecheck green

- **Category**: Static / Build
- **Priority**: must
- **Source**: tasks.md Task 7, request.md 受け入れ基準

**GIVEN** Task 1〜4 の実装が完了した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラー 0 件

---

## TC-21: 全テスト green

- **Category**: Integration / Build
- **Priority**: must
- **Source**: tasks.md Task 7, request.md 受け入れ基準

**GIVEN** Task 1〜6 の実装が完了した状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テスト pass

---

## TC-22: Claude adapter 無改修

- **Category**: Regression
- **Priority**: must
- **Source**: request.md スコープ外 / 受け入れ基準

**GIVEN** `src/adapter/claude-code/agent-runner.ts` の変更前後  
**WHEN** git diff で確認する  
**THEN** ファイルに変更なし

---

## TC-23: Codex adapter 無改修

- **Category**: Regression
- **Priority**: must
- **Source**: request.md スコープ外 / 受け入れ基準

**GIVEN** `src/adapter/codex/agent-runner.ts` の変更前後  
**WHEN** git diff で確認する  
**THEN** ファイルに変更なし

---

## TC-24: mapSessionUsage — cache_creation 両フィールド 0

- **Category**: Unit / Pure Function
- **Priority**: could
- **Source**: design.md D2 (全フィールド optional の境界値)

**GIVEN** `{ cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 } }` を渡す  
**WHEN** 関数を呼ぶ  
**THEN** `cacheCreationInputTokens: 0` かつ `undefined` ではなく構造体を返す

---

## TC-25: SessionUsage 構造互換 — ModelUsage へ代入可能

- **Category**: Static / Type Check
- **Priority**: should
- **Source**: design.md D1 (structural typing で ModelUsage 互換)

**GIVEN** `getSessionUsage` の戻り型 `SessionUsage`  
**WHEN** `Record<string, ModelUsage>` の値として代入するコードを書く  
**THEN** 型エラーなし (structural subtyping で互換)
