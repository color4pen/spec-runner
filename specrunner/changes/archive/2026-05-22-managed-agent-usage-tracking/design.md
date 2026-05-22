# Design: managed-agent-usage-tracking

## Overview

Managed Agent adapter の `run()` が返す `AgentRunResult.modelUsage` を実装する。
`BetaManagedAgentsSession.usage` (session cumulative) を終端で 1 回 read し、`ModelUsage` に変換して返す。

## Design Decisions

### D1: port に `getSessionUsage(sessionId)` を追加

**選択**: `SessionClient` port に read 専用メソッド 1 つ追加

**理由**: SSE 正常終了経路は `pollUntilComplete` を通らないため、戻り型拡張では SSE 経路の usage を取り損ねる。両経路の終端から独立に呼べる read 専用メソッドが DRY。

**シグネチャ**:
```typescript
// src/core/port/session-client.ts に追加
getSessionUsage(sessionId: string): Promise<SessionUsage | undefined>;
```

**戻り型** (`SessionUsage`): SDK 型を露出しない手書き構造。`ModelUsage` と同一フィールド:
```typescript
export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}
```

`SessionUsage` は `ModelUsage` と同一構造だが、意味が異なる (port 契約 vs state 記録) ため型エイリアスではなく独立定義する。呼び出し元で `ModelUsage` へ代入可能 (structural typing)。

失敗時は `undefined` を返す (best-effort)。

### D2: 変換純粋関数 `mapSessionUsage` を adapter 層に配置

**配置先**: `src/adapter/managed-agent/usage.ts` (新規ファイル)

**理由**: 単一責務。`session-client.ts` は SDK API 呼び出しの責務、`completion.ts` は polling の責務を持つ。usage 変換は独立した関心事であり新規ファイルが適切。

**関数シグネチャ**:
```typescript
import type { BetaManagedAgentsSessionUsage } from "@anthropic-ai/sdk/resources/beta/sessions/sessions";

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export function mapSessionUsage(
  raw: BetaManagedAgentsSessionUsage | null | undefined,
): SessionUsage | undefined;
```

**変換ロジック**:
- `input_tokens` → `inputTokens` (undefined → 0)
- `output_tokens` → `outputTokens` (undefined → 0)
- `cache_read_input_tokens` → `cacheReadInputTokens` (undefined → 0)
- `cache_creation.ephemeral_1h_input_tokens + cache_creation.ephemeral_5m_input_tokens` → `cacheCreationInputTokens` (undefined → 0)
- `raw` が null/undefined → `undefined` を返す (= best-effort)
- 全フィールドが 0 でも構造を返す (呼び出し元が undefined チェックするだけで良い)

### D3: adapter 実装 `getSessionUsage` の経路

**選択**: `retrieveSession` を独立呼び出し (既存 polling の相乗りはしない)

**理由**:
- `pollUntilComplete` 内の `retrieveSession` は polling ループ内で呼ばれており、最終結果を外部に渡す設計になっていない
- SSE 経路では `pollUntilComplete` を通らないため相乗り不可
- 独立呼び出しは 1 回の追加 API call だが、session 完了後の read なので latency は無視可能

**実装** (`AnthropicSessionClient.getSessionUsage`):
```typescript
async getSessionUsage(sessionId: string): Promise<SessionUsage | undefined> {
  try {
    const session = await retrieveSession(this.client, sessionId);
    return mapSessionUsage(session.usage);
  } catch {
    return undefined; // best-effort
  }
}
```

### D4: モデル名キーの解決

**選択**: `step.agent.model` を一次キー

**理由**: `step.agent.model` は `AgentRunContext` 全経路で scope 内。`resolvedConfig.model` は SSE end_turn 成功経路で未計算 (polling fallback ブロック内でのみ生成)。hoist は不要な複雑化。

**実装箇所**: `agent-runner.ts` の各 return 前で `{ [step.agent.model]: usage }` を組み立てる。

### D5: usage read の呼び出し位置

**SSE 経路 (`runDesignStyle`)**:
- GitHub verification (Stage 4) の直前、follow-up 完了後に 1 回呼ぶ
- follow-up turn 込みの cumulative 値が取れる

**Polling 経路 (`runPollingStyle`)**:
- follow-up turn 完了後、`requiresCommit` guard の直前に 1 回呼ぶ
- follow-up turn 込みの cumulative 値が取れる

両経路とも「全 turn 完了 → usage read → result 組み立て」の順序。

### D6: `SessionUsage` 型の配置

`SessionUsage` 型は 2 箇所で必要:
1. port interface (`src/core/port/session-client.ts`) — 戻り型として
2. adapter 純粋関数 (`src/adapter/managed-agent/usage.ts`) — 変換先として

**選択**: `src/core/port/session-client.ts` に `SessionUsage` を export し、adapter が import する。port が型の所有者。`ModelUsage` との構造互換は structural typing に委ねる (import 不要)。

## File Change Map

| File | Change |
|------|--------|
| `src/core/port/session-client.ts` | `SessionUsage` interface 追加 + `getSessionUsage` メソッド追加 |
| `src/adapter/managed-agent/usage.ts` | 新規: `mapSessionUsage` 純粋関数 |
| `src/adapter/managed-agent/session-client.ts` | `getSessionUsage` 実装 |
| `src/adapter/managed-agent/sdk/sessions.ts` | `BetaManagedAgentsSessionUsage` 型の re-export 追加 |
| `src/adapter/managed-agent/agent-runner.ts` | 両経路の return 前に usage read + result に反映 |
| `tests/unit/adapter/managed-agent/usage.test.ts` | 新規: `mapSessionUsage` table-driven test |
| `tests/unit/adapter/managed-agent/agent-runner.test.ts` | usage 反映の integration test 追加 |

## Non-Goals

- `ModelUsage` 型自体の変更
- Claude/Codex adapter への影響
- job-level cost 集約
