# managed-agent-adapter Specification (delta)

## Requirements

### Requirement: anthropic-client は SDK 型を直接使い `as unknown as` を廃止する

`src/adapter/managed-agent/anthropic-client.ts` SHALL `as unknown as` によるキャストを使用しない。

SDK 型 `BetaManagedAgentsAgent` の `version: number` field は非 optional で公開されているため、`(agent as unknown as { version?: number }).version ?? 1` パターンは不要である。`createAgent` / `retrieveAgent` / `updateAgent` の return 文は MUST `agent.version` を直接参照する。

`toSdkTool` の戻り値型は MUST `BetaManagedAgentsAgentToolset20260401Params | BetaManagedAgentsCustomToolParams` を SDK から import して明示する。これにより `createAgent` / `updateAgent` の `tools:` 行での `as unknown as Parameters<...>` キャストが不要になる。

#### Scenario: anthropic-client に `as unknown as` が存在しない

- **WHEN** `src/adapter/managed-agent/anthropic-client.ts` を inspect する
- **THEN** `as unknown as` の出現が 0 件である

#### Scenario: agent.version が直接参照される

- **WHEN** `createAgent` / `retrieveAgent` / `updateAgent` の return 文を inspect する
- **THEN** `agent.version` を直接参照している
- **AND** `?? 1` による fallback が存在しない

#### Scenario: toSdkTool の戻り値型が SDK 型に準拠する

- **WHEN** `toSdkTool` 関数の return type を inspect する
- **THEN** `BetaManagedAgentsAgentToolset20260401Params | BetaManagedAgentsCustomToolParams` 型である
- **AND** `Record<string, unknown>` ではない

### Requirement: AgentRunContext.emit の event 引数は DomainEvent 型に制約される

`src/core/port/agent-runner.ts` の `AgentRunContext.emit` SHALL 以下の signature を持つ:

```ts
emit: (event: DomainEvent, payload: Record<string, unknown>) => void;
```

`event` 引数の型が `string` ではなく `DomainEvent` (string literal union) であることで、typo した event 名を渡すと compile error になる。

`src/core/step/executor.ts` の emit forwarder は MUST `event as Parameters<EventBus["emit"]>[0]` キャストを含まない。`event` が既に `DomainEvent` 型であるため、型キャストなしで `this.events.emit(event, ...)` を呼べる。

#### Scenario: typo した event 名が compile error になる

- **WHEN** `ctx.emit("step:progrss", ...)` のように存在しない event 名を渡す
- **THEN** TypeScript compile error が発生する
- **AND** `bun run typecheck` が失敗する

#### Scenario: executor forwarder にキャストが存在しない

- **WHEN** `src/core/step/executor.ts` の emit forwarder を inspect する
- **THEN** `event as Parameters<EventBus["emit"]>[0]` が存在しない
- **AND** `event` がそのまま `this.events.emit` の第 1 引数に渡される
