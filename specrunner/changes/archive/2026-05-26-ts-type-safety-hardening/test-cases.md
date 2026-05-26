# Test Cases: ts-type-safety-hardening

## A. anthropic-client.ts の `as unknown as` 廃止

### A-1 `as unknown as` が anthropic-client.ts に残っていない
- **Priority**: must
- **Category**: static analysis
- **Source**: request.md 受け入れ基準, tasks.md 3.2

**GIVEN** 変更後の `src/adapter/managed-agent/anthropic-client.ts`  
**WHEN** ファイル内の `as unknown as` を grep する  
**THEN** マッチが 0 件であること

---

### A-2 `toSdkTool` の戻り値型が SDK 型に変更されている
- **Priority**: must
- **Category**: type signature
- **Source**: tasks.md 1.2, design.md D2

**GIVEN** `src/adapter/managed-agent/anthropic-client.ts`  
**WHEN** `toSdkTool` の関数シグネチャを確認する  
**THEN** 戻り値型が `Record<string, unknown>` でなく `BetaManagedAgentsAgentToolset20260401Params | BetaManagedAgentsCustomToolParams` であること

---

### A-3 SDK 型が import されている
- **Priority**: must
- **Category**: type signature
- **Source**: tasks.md 1.1, design.md D2

**GIVEN** `src/adapter/managed-agent/anthropic-client.ts`  
**WHEN** import 文を確認する  
**THEN** `BetaManagedAgentsAgentToolset20260401Params` と `BetaManagedAgentsCustomToolParams` が `@anthropic-ai/sdk` から import されていること

---

### A-4 `createAgent` の tools キャストが削除されている
- **Priority**: must
- **Category**: static analysis
- **Source**: tasks.md 1.3

**GIVEN** `src/adapter/managed-agent/anthropic-client.ts`  
**WHEN** `createAgent` 内の `tools:` 行を確認する  
**THEN** `as unknown as Parameters<` キャストが存在しないこと

---

### A-5 `updateAgent` の tools キャストが削除されている
- **Priority**: must
- **Category**: static analysis
- **Source**: tasks.md 1.3

**GIVEN** `src/adapter/managed-agent/anthropic-client.ts`  
**WHEN** `updateAgent` 内の `tools:` 行を確認する  
**THEN** `as unknown as Parameters<` キャストが存在しないこと

---

### A-6 `createAgent` return 文が `agent.version` を直接参照している
- **Priority**: must
- **Category**: type correctness
- **Source**: tasks.md 1.4, design.md D1

**GIVEN** `src/adapter/managed-agent/anthropic-client.ts`  
**WHEN** `createAgent` の return 文を確認する  
**THEN** `(agent as unknown as { version?: number }).version ?? 1` ではなく `agent.version` が使われていること

---

### A-7 `retrieveAgent` return 文が `agent.version` を直接参照している
- **Priority**: must
- **Category**: type correctness
- **Source**: tasks.md 1.4, design.md D1

**GIVEN** `src/adapter/managed-agent/anthropic-client.ts`  
**WHEN** `retrieveAgent` の return 文を確認する  
**THEN** `agent.version` が使われており `?? 1` fallback が存在しないこと

---

### A-8 `updateAgent` return 文が `agent.version` を直接参照している
- **Priority**: must
- **Category**: type correctness
- **Source**: tasks.md 1.4, design.md D1

**GIVEN** `src/adapter/managed-agent/anthropic-client.ts`  
**WHEN** `updateAgent` の return 文を確認する  
**THEN** `agent.version` が使われており `?? 1` fallback が存在しないこと

---

### A-9 `updateAgent` の current version 参照が直接アクセスに変更されている
- **Priority**: must
- **Category**: type correctness
- **Source**: tasks.md 1.5, design.md D1

**GIVEN** `src/adapter/managed-agent/anthropic-client.ts`  
**WHEN** `updateAgent` 内の `current` を使う `version:` 行を確認する  
**THEN** `(current as unknown as { version?: number }).version ?? 1` ではなく `current.version` が使われていること

---

## B. executor emit forwarder の event 名型安全化

### B-1 `AgentRunContext.emit` の event 引数が `DomainEvent` 型
- **Priority**: must
- **Category**: type signature
- **Source**: tasks.md 2.2, design.md D3

**GIVEN** `src/core/port/agent-runner.ts`  
**WHEN** `AgentRunContext` interface の `emit` signature を確認する  
**THEN** event 引数の型が `string` でなく `DomainEvent` であること

---

### B-2 `DomainEvent` が port ファイルに import されている
- **Priority**: must
- **Category**: type signature
- **Source**: tasks.md 2.1, design.md D3

**GIVEN** `src/core/port/agent-runner.ts`  
**WHEN** import 文を確認する  
**THEN** `DomainEvent` が `../event/types.js` から import されていること

---

### B-3 typo した event 名でコンパイルエラーになる
- **Priority**: must
- **Category**: compile-time safety
- **Source**: request.md 受け入れ基準, design.md D3

**GIVEN** `AgentRunContext.emit` の event 引数が `DomainEvent` 型に変更された状態  
**WHEN** `ctx.emit("step:progrss", payload)` のように存在しない event 名を渡すコードを書く  
**THEN** `bun run typecheck` が型エラーを報告すること

---

### B-4 `executor.ts` forwarder の不要キャストが削除されている
- **Priority**: must
- **Category**: static analysis
- **Source**: tasks.md 2.3, design.md D3

**GIVEN** `src/core/step/executor.ts`  
**WHEN** emit forwarder の実装を確認する  
**THEN** `event as Parameters<EventBus["emit"]>[0]` キャストが存在せず、`event` をそのまま渡していること

---

### B-5 `adapter/claude-code/agent-runner.ts` の `emitFn` 引数型が `DomainEvent`
- **Priority**: must
- **Category**: type signature
- **Source**: tasks.md 2.4, design.md D4

**GIVEN** `src/adapter/claude-code/agent-runner.ts`  
**WHEN** `emitToolProgress` 関数の `emitFn` 引数型を確認する  
**THEN** event 引数の型が `string` でなく `DomainEvent` であること

---

### B-6 `DomainEvent` が adapter/claude-code/agent-runner.ts に import されている
- **Priority**: must
- **Category**: type signature
- **Source**: tasks.md 2.4

**GIVEN** `src/adapter/claude-code/agent-runner.ts`  
**WHEN** import 文を確認する  
**THEN** `DomainEvent` が import されていること

---

## C. 型チェックとテスト

### C-1 `bun run typecheck` が green
- **Priority**: must
- **Category**: build
- **Source**: tasks.md 1.6, 2.5, 3.1, request.md 受け入れ基準

**GIVEN** 全変更が適用された状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件で終了すること

---

### C-2 `bun run test` が green
- **Priority**: must
- **Category**: regression
- **Source**: tasks.md 3.1, request.md 受け入れ基準

**GIVEN** 全変更が適用された状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し、失敗・エラーが 0 件であること

---

## D. Regression

### D-1 `"step:progress"` emit が正常動作する
- **Priority**: must
- **Category**: regression
- **Source**: design.md D4

**GIVEN** `DomainEvent` union に `"step:progress"` が含まれる状態  
**WHEN** adapter が `ctx.emit("step:progress", payload)` を呼ぶ  
**THEN** コンパイルエラーが発生せず、既存動作が維持されること

---

### D-2 `AgentRunContext.emit` の string 型参照が残っていない
- **Priority**: should
- **Category**: static analysis
- **Source**: tasks.md 3.3

**GIVEN** 変更後のコードベース全体  
**WHEN** `AgentRunContext` の `emit` 定義を grep する  
**THEN** event 引数が `string` 型の定義が存在しないこと

---

### D-3 スコープ外ファイルに変更がない
- **Priority**: should
- **Category**: scope guard
- **Source**: request.md スコープ外, design.md Non-Goals

**GIVEN** 変更差分  
**WHEN** 変更されたファイル一覧を確認する  
**THEN** 変更ファイルが `anthropic-client.ts` / `agent-runner.ts` (port) / `executor.ts` / `agent-runner.ts` (claude-code adapter) の 4 ファイルに収まっていること（他ファイルの `as unknown as` には触れていない）
