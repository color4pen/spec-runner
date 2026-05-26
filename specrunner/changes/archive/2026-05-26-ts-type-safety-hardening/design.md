## Context

spec-runner の adapter / core 境界に TS 型の弛みが 2 箇所ある:

1. **`src/adapter/managed-agent/anthropic-client.ts`**: SDK レスポンスの `version` field を `as unknown as { version?: number }` でキャストし、不在時は `?? 1` で fallback する workaround が 4 箇所。tool 型の二重キャスト（`as unknown as Parameters<...>`）が 2 箇所。合計 6 箇所の `as unknown as`。SDK 型 `BetaManagedAgentsAgent` には `version: number` が非 optional で存在しており、workaround は不要になっている。
2. **`src/core/step/executor.ts` L163**: `AgentRunContext.emit` の event 名が `string` 型。adapter が typo した event 名を渡しても compile が通り、runtime まで検出できない。

## Goals / Non-Goals

**Goals:**

- `anthropic-client.ts` から `as unknown as` を全 6 箇所削除する
- SDK 型を直接使うことで version field の型安全性を確保する
- `AgentRunContext.emit` の event 名を `DomainEvent` 型に制約し、typo を compile 時に検出可能にする

**Non-Goals:**

- 他ファイルの `as unknown as` 一掃（本 request は anthropic-client.ts の 6 箇所に限定）
- EventBus 全体の型見直し（emit forwarder の event 名制約のみ）
- SDK 型定義の upstream 修正

## Decisions

### D1. version field: SDK 型を直接使い、`as unknown as` を削除

SDK 型 `BetaManagedAgentsAgent`（`node_modules/@anthropic-ai/sdk/resources/beta/agents/agents.d.ts`）は `version: number`（非 optional）を持つ。`sdk.beta.agents.create()` / `.retrieve()` / `.update()` の戻り値はこの型に準拠する。

したがって:
- `(agent as unknown as { version?: number }).version ?? 1` → `agent.version` に置換
- `?? 1` fallback も不要（SDK が `number` を保証）

### D2. tools 配列: `toSdkTool` の戻り値型を SDK 型に合わせる

現在 `toSdkTool` は `Record<string, unknown>` を返し、呼び出し側で `as unknown as Parameters<...>["tools"]` キャストしている。

SDK の `AgentCreateParams.tools` / `AgentUpdateParams.tools` は `Array<BetaManagedAgentsAgentToolset20260401Params | BetaManagedAgentsMCPToolsetParams | BetaManagedAgentsCustomToolParams>` を期待する。

core の `ToolSpec` 型（`AgentToolsetSpec | CustomToolSpec`）は SDK の `BetaManagedAgentsAgentToolset20260401Params | BetaManagedAgentsCustomToolParams` に構造的に互換する:

- `AgentToolsetSpec.type = "agent_toolset_20260401"` は `BetaManagedAgentsAgentToolset20260401Params.type` と同値
- `CustomToolSpec` は `{ type: "custom", name, description, input_schema }` で `BetaManagedAgentsCustomToolParams` と構造一致

**方針**: `toSdkTool` の戻り値型を SDK のパラメータ tool union 型に変更する。`BetaManagedAgentsAgentToolset20260401Params | BetaManagedAgentsCustomToolParams` を SDK から import し、戻り値として明示する。これにより `as unknown as` が不要になる。

`BetaManagedAgentsMCPToolsetParams` は現在使用しないため union から除外しても SDK の `tools` 配列型に代入可能（部分 union は全体 union に代入できる）。

### D3. `AgentRunContext.emit` の event 名を `DomainEvent` 型に制約

現状:
```ts
// src/core/port/agent-runner.ts L50
emit: (event: string, payload: Record<string, unknown>) => void;
```

変更後:
```ts
import type { DomainEvent } from "../event/types.js";
emit: (event: DomainEvent, payload: Record<string, unknown>) => void;
```

これにより adapter 側で `ctx.emit("step:progrss", ...)` のような typo が compile error になる。

executor 側の forwarder（L163-166）も型キャストが簡素化される:
```ts
// 現状
emit: (event: string, payload: Record<string, unknown>) => {
  this.events.emit(event as Parameters<EventBus["emit"]>[0], payload as never);
}

// 変更後
emit: (event: DomainEvent, payload: Record<string, unknown>) => {
  this.events.emit(event, payload as never);
}
```

`event as Parameters<EventBus["emit"]>[0]` キャストが不要になる（`event` が既に `DomainEvent` 型のため）。

### D4. adapter 側の `emitFn` 型も `DomainEvent` に更新

`src/adapter/claude-code/agent-runner.ts` の `emitToolProgress` 関数が `emitFn: (event: string, ...)` を受ける。`AgentRunContext.emit` の型変更に伴い、ここも `DomainEvent` 型に更新する。

現在 adapter が emit する event は `"step:progress"` のみで、これは `DomainEvent` union に含まれているため、既存動作に影響なし。

## Impact Analysis

**変更ファイル:**

| ファイル | 変更内容 |
|---------|---------|
| `src/adapter/managed-agent/anthropic-client.ts` | `as unknown as` 6 箇所削除、SDK 型 import 追加、`toSdkTool` 戻り値型変更 |
| `src/core/port/agent-runner.ts` | `emit` の event 引数を `string` → `DomainEvent` に変更 |
| `src/core/step/executor.ts` | forwarder の `event as Parameters<...>` キャスト削除 |
| `src/adapter/claude-code/agent-runner.ts` | `emitFn` / `emitToolProgress` の event 引数型を `DomainEvent` に変更 |

**spec 影響:**

- `agent-runner-port` spec の `AgentRunContext.emit` 型記述が `(event: DomainEvent) => void` から `(event: string, payload) => void` に変わった経緯がある（現行 spec は `(event: DomainEvent) => void` と記述）。今回の変更は spec の記述に**一致させる方向**のため delta 不要。
- adapter / core 境界の module-boundary invariant に影響なし（`DomainEvent` は `src/core/event/types.ts` で定義されており core 層）。
