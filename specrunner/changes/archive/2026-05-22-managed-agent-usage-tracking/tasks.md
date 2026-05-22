# Tasks: managed-agent-usage-tracking

## Task 1: `SessionUsage` 型と port メソッド追加 [x]

**File**: `src/core/port/session-client.ts`

1. `SessionUsage` interface を export する:
   ```typescript
   export interface SessionUsage {
     inputTokens: number;
     outputTokens: number;
     cacheReadInputTokens: number;
     cacheCreationInputTokens: number;
   }
   ```
2. `SessionClient` interface に `getSessionUsage` メソッドを追加:
   ```typescript
   /**
    * Retrieve cumulative token usage for a completed session.
    * Best-effort: returns undefined on failure (non-fatal).
    */
   getSessionUsage(sessionId: string): Promise<SessionUsage | undefined>;
   ```

**Verify**: `bun run typecheck` (型エラーが出る — adapter 未実装のため。Task 3 で解消)

---

## Task 2: `mapSessionUsage` 純粋関数 [x]

**File**: `src/adapter/managed-agent/usage.ts` (新規)

1. `BetaManagedAgentsSessionUsage` を SDK 型から import
2. `SessionUsage` を `../../core/port/session-client.js` から import
3. `mapSessionUsage` 関数を実装:
   - `raw` が null/undefined → `undefined` を返す
   - `cache_creation` ネストを平坦化: `(ephemeral_1h_input_tokens ?? 0) + (ephemeral_5m_input_tokens ?? 0)`
   - 各フィールド undefined → 0 埋め
4. `sdk/sessions.ts` に `BetaManagedAgentsSessionUsage` の re-export を追加 (既に `BetaManagedAgentsSession` は re-export 済み)

**Verify**: `bun run typecheck`

---

## Task 3: `AnthropicSessionClient.getSessionUsage` 実装 [x]

**File**: `src/adapter/managed-agent/session-client.ts`

1. `retrieveSession` import は既存 (completion.ts 経由ではなく `./sdk/sessions.js` から直接)
2. `mapSessionUsage` を `./usage.js` から import
3. `getSessionUsage` メソッド実装:
   ```typescript
   async getSessionUsage(sessionId: string): Promise<SessionUsage | undefined> {
     try {
       const session = await retrieveSession(this.client, sessionId);
       return mapSessionUsage(session.usage);
     } catch {
       return undefined;
     }
   }
   ```
4. `SessionUsage` 型を port から import (戻り型注釈用)

**Verify**: `bun run typecheck`

---

## Task 4: `agent-runner.ts` 両経路に usage read を組み込み [x]

**File**: `src/adapter/managed-agent/agent-runner.ts`

### 4a: runDesignStyle

follow-up turn 完了後 (現在の `// Stage 4: GitHub verification` コメントの直前) に挿入:

```typescript
// Usage read (best-effort, session cumulative)
let modelUsage: Record<string, ModelUsage> | undefined;
const sessionUsage = await this.sessionClient.getSessionUsage(sessionId!);
if (sessionUsage) {
  modelUsage = { [step.agent.model]: sessionUsage };
}
```

`designBaseResult` に `modelUsage` を含める:
```typescript
const designBaseResult: AgentRunResult = {
  completionReason: "success",
  resultContent: null,
  sessionId: sessionId!,
  modelUsage,
};
```

### 4b: runPollingStyle

follow-up turn 完了後、`requiresCommit` guard の直前に挿入:

```typescript
// Usage read (best-effort, session cumulative)
let modelUsage: Record<string, ModelUsage> | undefined;
const sessionUsage = await this.sessionClient.getSessionUsage(sessionId!);
if (sessionUsage) {
  modelUsage = { [step.agent.model]: sessionUsage };
}
```

`pollingBaseResult` に `modelUsage` を含める:
```typescript
const pollingBaseResult: AgentRunResult = {
  completionReason: "success",
  resultContent: null,
  sessionId: sessionId!,
  modelUsage,
};
```

### 4c: import 追加

`agent-runner.ts` 冒頭に:
```typescript
import type { ModelUsage } from "../../core/port/model-usage.js";
```

**Verify**: `bun run typecheck`

---

## Task 5: unit test — `mapSessionUsage` [x]

**File**: `tests/unit/adapter/managed-agent/usage.test.ts` (新規)

Table-driven test:
- null input → undefined
- undefined input → undefined
- 全フィールド present → 正しく変換
- 全フィールド undefined (空オブジェクト) → 全 0 埋め
- `cache_creation` の片方だけ present → 合算
- `cache_creation` が undefined → `cacheCreationInputTokens: 0`

SDK モック不要 (純粋関数)。

---

## Task 6: unit test — agent-runner usage 反映 [x]

**File**: `tests/unit/adapter/managed-agent/agent-runner.test.ts` (既存に追記)

### 6a: polling 経路で usage が返る

- `sessionClient.getSessionUsage` mock が `SessionUsage` を返す
- `run()` 結果の `modelUsage` が `{ [step.agent.model]: usage }` である

### 6b: SSE 経路で usage が返る

- `sessionClient.getSessionUsage` mock が `SessionUsage` を返す
- `run()` 結果の `modelUsage` が `{ [step.agent.model]: usage }` である

### 6c: usage read 失敗時 undefined

- `sessionClient.getSessionUsage` mock が `undefined` を返す
- `run()` 結果の `modelUsage` が undefined である
- pipeline は止まらない (completionReason === "success")

**注意**: 既存 mock の `SessionClient` 型に `getSessionUsage` を追加する必要あり。

---

## Task 7: 最終検証 [x]

```bash
bun run typecheck && bun run test
```

全 green を確認。
