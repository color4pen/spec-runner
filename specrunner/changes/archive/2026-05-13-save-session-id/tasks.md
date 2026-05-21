# Tasks: save-session-id

## [x] T1: session_id 抽出変数の追加

- **file**: `src/adapter/claude-code/agent-runner.ts`
- **location**: L141 付近（`extractedModelUsage` 宣言の直後）
- **action**: `let extractedSessionId: string | undefined;` を追加する

## [x] T2: success result ブロックで session_id を保存

- **file**: `src/adapter/claude-code/agent-runner.ts`
- **location**: L183-198 の `if (lastResult && lastResult.subtype === "success")` ブロック内
- **action**: `extractedModelUsage` 設定の後に `extractedSessionId = successResult.session_id;` を追加する
- **理由**: `successResult` は既に `SDKResultSuccess` にキャスト済み。`session_id` は SDK 型で必須フィールド（`string`）

## [x] T3: success return に sessionId を追加

- **file**: `src/adapter/claude-code/agent-runner.ts`
- **location**: L275-279 の success return オブジェクト
- **action**: `modelUsage: extractedModelUsage,` の次行に `sessionId: extractedSessionId,` を追加する

## [x] T4: AgentRunResult.sessionId の JSDoc 更新

- **file**: `src/core/port/agent-runner.ts`
- **location**: L67 の `sessionId` フィールドの JSDoc コメント
- **action**: `/** Session ID for managed runtime (undefined for local) */` → `/** Session ID from the agent runtime (undefined when not available) */` に変更する

## 検証

- [x] `bun run typecheck` が pass すること
- [x] `bun run test` が pass すること（テストが存在する場合）
