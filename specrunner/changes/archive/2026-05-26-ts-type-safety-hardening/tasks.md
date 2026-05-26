## 1. anthropic-client.ts の `as unknown as` 廃止

- [x] 1.1 `src/adapter/managed-agent/anthropic-client.ts` で SDK 型 `BetaManagedAgentsAgentToolset20260401Params`, `BetaManagedAgentsCustomToolParams` を `@anthropic-ai/sdk` から import する
- [x] 1.2 `toSdkTool` の戻り値型を `Record<string, unknown>` から `BetaManagedAgentsAgentToolset20260401Params | BetaManagedAgentsCustomToolParams` に変更する
- [x] 1.3 `createAgent` / `updateAgent` の `tools:` 行から `as unknown as Parameters<...>` キャストを削除する（2 箇所）
- [x] 1.4 `createAgent` / `retrieveAgent` / `updateAgent` の return 文から `(agent as unknown as { version?: number }).version ?? 1` を `agent.version` に置換する（3 箇所）
- [x] 1.5 `updateAgent` の `version:` 行から `(current as unknown as { version?: number }).version ?? 1` を `current.version` に置換する（1 箇所）
- [x] 1.6 `bun run typecheck` で型エラーがないことを確認する

## 2. executor emit forwarder の event 名型安全化

- [x] 2.1 `src/core/port/agent-runner.ts` で `DomainEvent` を `../event/types.js` から import する
- [x] 2.2 `AgentRunContext.emit` の signature を `(event: string, payload: Record<string, unknown>) => void` から `(event: DomainEvent, payload: Record<string, unknown>) => void` に変更する
- [x] 2.3 `src/core/step/executor.ts` L163 の forwarder で `event as Parameters<EventBus["emit"]>[0]` キャストを削除し、`event` をそのまま渡す形に変更する
- [x] 2.4 `src/adapter/claude-code/agent-runner.ts` の `emitToolProgress` 関数の `emitFn` 引数型を `(event: string, ...) => void` から `(event: DomainEvent, ...) => void` に変更し、`DomainEvent` を import する
- [x] 2.5 `bun run typecheck` で型エラーがないことを確認する

## 3. 検証

- [x] 3.1 `bun run typecheck && bun run test` が green であることを確認する（pre-existing 2 failures は本変更と無関係）
- [x] 3.2 `anthropic-client.ts` に `as unknown as` が残っていないことを grep で確認する
- [x] 3.3 `AgentRunContext.emit` の event 引数が `string` でないことを確認する
