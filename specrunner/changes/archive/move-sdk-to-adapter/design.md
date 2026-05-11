## Context

`src/sdk/` には 4 ファイルが存在する:

| File | 用途 | 外部 import 元 |
|------|------|---------------|
| `client.ts` | `Anthropic` インスタンス生成（managed-agents beta header 付き） | `cli/init.ts`, `cli/rm.ts`, `core/runtime/factory.ts` |
| `environments.ts` | Environment CRUD ラッパー | `cli/init.ts` |
| `agents.ts` | Agent CRUD ラッパー | **なし（デッドコード）** |
| `sessions.ts` | 型再エクスポート + narrowing ヘルパー | `tests/completion.test.ts` のみ |

`src/adapter/managed-agent/` には既に以下が存在する:
- `anthropic-client.ts`: `AnthropicClient` port の実装（Agent CRUD）。`agents.ts` と機能重複
- `sdk/sessions.ts`: Session CRUD + 型再エクスポート + narrowing ヘルパー。`sessions.ts` の完全上位互換
- `session-client.ts`: `SessionClient` port の実装

`factory.ts` は現在 `sdk/client.js` と `adapter/managed-agent/session-client.js` の両方を import しており、core→adapter 依存と core→sdk 依存の 2 つの境界違反がある。

## Goals / Non-Goals

**Goals:**

- `src/sdk/` を廃止し、SDK ラッパーを `src/adapter/managed-agent/` に集約
- `src/core/` から `@anthropic-ai/sdk` の直接 import を零にする
- `factory.ts` から adapter/ への import を除去し、DI でクライアントを受け取る
- module-boundary spec を実態に合わせて更新

**Non-Goals:**

- factory.ts 以外の core 層コードの変更
- managed runtime の機能変更
- init の責務分離（Issue #156 で対応）

## Decisions

### D1: ファイル移動先と削除判定

| Source | Destination | 理由 |
|--------|-------------|------|
| `sdk/client.ts` | `adapter/managed-agent/client.ts` | SDK クライアント生成は adapter 責務 |
| `sdk/environments.ts` | `adapter/managed-agent/environments.ts` | Environment CRUD は SDK ラッパー |
| `sdk/agents.ts` | 削除 | import 元ゼロ。`anthropic-client.ts` が同等機能を port 経由で提供済み |
| `sdk/sessions.ts` | 削除 | `adapter/managed-agent/sdk/sessions.ts` が完全上位互換。型 + ヘルパー + CRUD 全て含む |

**理由**: `agents.ts` と `sessions.ts` は既に adapter 層に吸収済み。移動ではなく削除が適切。

### D2: factory.ts の DI 設計

`createRuntime()` に `sessionClient?: SessionClient` パラメータを追加する。managed runtime 時は呼び出し元（cli 層）が `createAnthropicClient()` → `createAnthropicSessionClient()` で構築した `SessionClient` を渡す。

**Before:**
```typescript
// src/core/runtime/factory.ts
import { createAnthropicClient } from "../../sdk/client.js";
import { createAnthropicSessionClient } from "../../adapter/managed-agent/session-client.js";

export function createRuntime(config, cwd, githubClient, repo): RuntimeStrategy {
  if (config.runtime === "local") return new LocalRuntime({ cwd, githubClient });
  const anthropicClient = createAnthropicClient(config.anthropic.apiKey);
  const sessionClient = createAnthropicSessionClient(anthropicClient);
  return new ManagedRuntime(cwd, sessionClient, githubClient, repo);
}
```

**After:**
```typescript
// src/core/runtime/factory.ts
import type { SessionClient } from "../port/session-client.js";

export function createRuntime(
  config, cwd, githubClient, repo,
  sessionClient?: SessionClient,
): RuntimeStrategy {
  if (config.runtime === "local") return new LocalRuntime({ cwd, githubClient });
  if (!sessionClient) throw new Error("sessionClient is required for managed runtime");
  return new ManagedRuntime(cwd, sessionClient, githubClient, repo);
}
```

呼び出し元（`cli/run.ts`, `cli/bootstrap.ts`）:
```typescript
import { createAnthropicClient } from "../adapter/managed-agent/client.js";
import { createAnthropicSessionClient } from "../adapter/managed-agent/session-client.js";

const sessionClient = config.runtime !== "local"
  ? createAnthropicSessionClient(createAnthropicClient(config.anthropic.apiKey))
  : undefined;
const runtime = createRuntime(config, cwd, githubClient, repo, sessionClient);
```

**理由**:
- `SessionClient` は `core/port/` で定義済みの port interface → factory.ts が adapter を import する必要がない
- `rm/runner.ts` の `SessionDeleteClient` パターン（structural interface で SDK 型を回避）と同じアプローチ
- cli/ は composition root なので adapter import は architecture 上正当

**Trade-off**: factory.ts のコメント「ALL config.runtime branching is confined to this function」に対し、呼び出し元でも `config.runtime` 分岐が発生する。ただし hexagonal architecture の原則（composition root が adapter を wire する）が優先。

### D3: tests/completion.test.ts の import 先

`src/sdk/sessions.ts` の型 + narrowing ヘルパーは `src/adapter/managed-agent/sdk/sessions.ts` に全て含まれている。テストの import パスをそちらに切り替える。

## Risks / Trade-offs

- [Risk] `adapter/managed-agent/client.ts` が既存の `anthropic-client.ts` と名前が紛らわしい → 役割は明確に異なる（`client.ts` = raw SDK インスタンス生成、`anthropic-client.ts` = AnthropicClient port の adapter 実装）。命名変更は本 change のスコープ外
- [Trade-off] `createRuntime` の呼び出し元 2 箇所に runtime 分岐が追加される → composition root での adapter wiring として正当。factory.ts のコメントは更新する
