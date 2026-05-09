# Tasks: SSE / ポーリングのセッション状態ハンドリング網羅

## T1: TerminationReason 型の拡張 + SseStreamResult の更新

**File**: `src/adapter/managed-agent/sse-stream.ts`

**Location**: Line 19-31（`TerminationReason` 型と `SseStreamResult` 定義）

**Changes**:
1. `TerminationReason` に `"requires_action"` / `"retries_exhausted"` / `"session_error"` / `"session_deleted"` を追加

**Detailed steps**:
- Line 19-24 の `TerminationReason` を以下に置き換え:
  ```typescript
  export type TerminationReason =
    | "end_turn"
    | "terminated"
    | "sse_error"
    | "aborted"
    | "requires_action"
    | "retries_exhausted"
    | "session_error"
    | "session_deleted"
    | "unknown";
  ```

**Expected diff**:
```diff
 export type TerminationReason =
   | "end_turn"
   | "terminated"
   | "sse_error"
   | "aborted"
+  | "requires_action"
+  | "retries_exhausted"
+  | "session_error"
+  | "session_deleted"
   | "unknown";
```

---

## T2: SDK ナローイング関数の追加

**File**: `src/adapter/managed-agent/sdk/sessions.ts`

**Location**: Line 86 以降（既存ナローイング関数の後）

**Changes**:
1. `isStatusRescheduledEvent` 追加
2. `isSessionErrorEvent` 追加
3. `isSessionDeletedEvent` 追加
4. `isRetryStatusRetrying` ヘルパー追加
5. `listEvents` ラッパー関数追加
6. 必要な型の re-export 追加

**Detailed steps**:

- import セクション（Line 27-32）に追加:
  ```typescript
  import type {
    BetaManagedAgentsStreamSessionEvents,
    BetaManagedAgentsAgentCustomToolUseEvent,
    BetaManagedAgentsSessionStatusIdleEvent,
    BetaManagedAgentsSessionStatusTerminatedEvent,
    BetaManagedAgentsSessionStatusRescheduledEvent,
    BetaManagedAgentsSessionErrorEvent,
    BetaManagedAgentsSessionDeletedEvent,
  } from "@anthropic-ai/sdk/resources/beta/sessions/events";
  ```

- re-export セクション（Line 10-25）に追加:
  ```typescript
  export type {
    BetaManagedAgentsSessionStatusRescheduledEvent,
    BetaManagedAgentsSessionErrorEvent,
    BetaManagedAgentsSessionDeletedEvent,
    BetaManagedAgentsSessionEvent,
  } from "@anthropic-ai/sdk/resources/beta/sessions/events";
  ```

- Line 119 の後に以下を追加:
  ```typescript
  /**
   * Narrowing helper: check if event is a session status rescheduled event.
   */
  export function isStatusRescheduledEvent(
    e: BetaManagedAgentsStreamSessionEvents,
  ): e is BetaManagedAgentsSessionStatusRescheduledEvent {
    return e.type === "session.status_rescheduled";
  }

  /**
   * Narrowing helper: check if event is a session error event.
   */
  export function isSessionErrorEvent(
    e: BetaManagedAgentsStreamSessionEvents,
  ): e is BetaManagedAgentsSessionErrorEvent {
    return e.type === "session.error";
  }

  /**
   * Narrowing helper: check if event is a session deleted event.
   */
  export function isSessionDeletedEvent(
    e: BetaManagedAgentsStreamSessionEvents,
  ): e is BetaManagedAgentsSessionDeletedEvent {
    return e.type === "session.deleted";
  }

  /**
   * Check if a session error's retry_status indicates the server is retrying.
   * When true, the client should wait and continue listening.
   *
   * `error` is typed as `BetaManagedAgentsSessionErrorEvent["error"]`, a union of
   * `BetaManagedAgentsUnknownError | BetaManagedAgentsBillingError | ...`.
   * All variants share a `retry_status` discriminated union:
   * `RetryStatusRetrying | RetryStatusExhausted | RetryStatusTerminal`.
   * This function narrows to the `{ type: "retrying" }` case.
   */
  export function isRetryStatusRetrying(
    error: BetaManagedAgentsSessionErrorEvent["error"],
  ): boolean {
    return error.retry_status.type === "retrying";
  }

  /**
   * List session events (paginated), ordered most-recent-first.
   * Used by polling to inspect the latest idle stop_reason.
   *
   * Passing `order: "desc"` ensures the first yielded event is the newest,
   * so `getIdleStopReason` can return immediately on the first idle event
   * without scanning all pages.
   */
  export async function listEvents(
    client: Anthropic,
    sessionId: string,
  ) {
    return client.beta.sessions.events.list(sessionId, { order: "desc" });
  }
  ```

---

## T3: SSE ストリームのイベントハンドリング拡張

**File**: `src/adapter/managed-agent/sse-stream.ts`

**Location**: Line 86-128（`for await` ループ内）

**Changes**:
1. `idle` + `requires_action` → `terminationReason = "requires_action"` でエラー break
2. `idle` + `retries_exhausted` → `terminationReason = "retries_exhausted"` でエラー break
3. `session.error` → `retry_status` を確認。`retrying` なら続行、それ以外はエラー break
4. `session.deleted` → エラー break
5. `session.status_rescheduled` → ログ出力して続行
6. 未知イベント → ログ出力して続行（既存の暗黙的素通りを明示化は不要。未マッチは自然と次の iteration へ）

**Detailed steps**:

- import セクション（Line 6-13）に追加:
  ```typescript
  import {
    streamEvents,
    sendEvents,
    isCustomToolUseEvent,
    isStatusIdleEvent,
    isStatusTerminatedEvent,
    isStatusRescheduledEvent,
    isSessionErrorEvent,
    isSessionDeletedEvent,
    isEndTurnIdle,
    isRetryStatusRetrying,
  } from "./sdk/sessions.js";
  ```

- Line 117-128 の `else if (isStatusIdleEvent(event))` ブロックを以下に置き換え:
  ```typescript
      } else if (isStatusIdleEvent(event)) {
        if (isEndTurnIdle(event)) {
          assertBreakAfterCompletion(event);
          idleEndTurnDetected = true;
          terminationReason = "end_turn";
          break;
        }
        // idle but not end_turn: requires_action or retries_exhausted
        // Both are error conditions for spec-runner
        const stopType = event.stop_reason.type;
        if (stopType === "requires_action") {
          stderrWrite("Session idle with requires_action (unexpected in spec-runner).");
          terminated = true;
          terminationReason = "requires_action";
          break;
        }
        if (stopType === "retries_exhausted") {
          stderrWrite("Session idle with retries_exhausted (unrecoverable).");
          terminated = true;
          terminationReason = "retries_exhausted";
          break;
        }
        // Unknown future stop_reason — log and continue
        stderrWrite(`Session idle with unknown stop_reason: ${stopType}. Continuing.`);
      } else if (isStatusTerminatedEvent(event)) {
        terminated = true;
        terminationReason = "terminated";
        break;
      } else if (isSessionErrorEvent(event)) {
        if (isRetryStatusRetrying(event.error)) {
          stderrWrite(`Session error (${event.error.type}), SDK retrying. Continuing.`);
          // SDK is auto-retrying; continue listening
        } else {
          stderrWrite(`Session error (${event.error.type}), retry_status: ${event.error.retry_status.type}. Stopping.`);
          terminated = true;
          terminationReason = "session_error";
          break;
        }
      } else if (isSessionDeletedEvent(event)) {
        stderrWrite("Session deleted (unrecoverable).");
        terminated = true;
        terminationReason = "session_deleted";
        break;
      } else if (isStatusRescheduledEvent(event)) {
        stderrWrite("Session rescheduled (error recovery in progress). Continuing.");
        // SDK is recovering; continue listening
      }
  ```

**注意**: `SseStreamResult.terminated` を `true` にセットする新パス（`requires_action`, `retries_exhausted`, `session_error`, `session_deleted`）が追加される。`agent-runner.ts` Line 159 で `sseResult.terminated` をチェックしているため、これらの状態は既存のエラーパスに乗る。

---

## T4: ポーリングの rescheduling ハンドリング

**File**: `src/adapter/managed-agent/completion.ts`

**Location**: Line 52-88（`pollUntilComplete` 関数）

**Changes**:
1. `isProposeComplete` を `isSessionIdle` にリネーム（命名の整合性。`idle` を検知するだけで完了を保証しない）
2. `rescheduling` status のカウントを追加
3. 上限（10 回）超過でエラー throw
4. `rescheduling` 時はログ出力して続行

**リネーム方針**: `isProposeComplete` は「完了した」という意味を持つが、T5 で idle の `stop_reason` を区別してエラーにする場合、「idle = 完了」の前提が成立しない。`isSessionIdle` にリネームすることで、関数の責務（status が idle かどうかを確認する）と T5 の stop_reason 区別ロジックの間の認知的矛盾を解消する。

**Detailed steps**:

- Line 10 の後にエラーファクトリの import を追加:
  ```typescript
  import { sessionTerminatedError, sessionReschedulingExhaustedError } from "../../errors.js";
  ```

- Line 24-26 の `isProposeComplete` 関数をリネーム:
  ```typescript
  /**
   * Determine if a session is in idle status (turn complete or stop_reason TBD).
   * Use getIdleStopReason() to distinguish end_turn from requires_action / retries_exhausted.
   */
  export function isSessionIdle(session: BetaManagedAgentsSession): boolean {
    return session.status === "idle";
  }
  ```

- `pollUntilComplete` 関数内、Line 61 の `let intervalMs` の後に追加:
  ```typescript
  const MAX_RESCHEDULING_COUNT = 10;
  let reschedulingCount = 0;
  ```

- Line 76-84 のセッション状態チェックを以下に置き換え（`isProposeComplete` → `isSessionIdle`）:
  ```typescript
    const session = await retrieveSession(client, sessionId);

    if (isSessionTerminated(session)) {
      throw sessionTerminatedError();
    }

    if (session.status === "rescheduling") {
      reschedulingCount++;
      stderrWrite(`Session rescheduling (${reschedulingCount}/${MAX_RESCHEDULING_COUNT}).`);
      if (reschedulingCount >= MAX_RESCHEDULING_COUNT) {
        throw sessionReschedulingExhaustedError(sessionId);
      }
      intervalMs = calculateBackoff(0, intervalMs);
      continue;
    }

    // Reset rescheduling count on any non-rescheduling status
    reschedulingCount = 0;

    if (isSessionIdle(session)) {
      return session;
    }

    intervalMs = calculateBackoff(0, intervalMs);
  ```

---

## T5: ポーリングの stop_reason 区別

**File**: `src/adapter/managed-agent/completion.ts`

**Location**: `pollUntilComplete` 関数内、`isSessionIdle(session)` の後（T4 でリネーム済み）

**Changes**:
1. `session.status === "idle"` を確認後、`events.list()` で最新 idle イベントを取得
2. `stop_reason.type === "end_turn"` のみ return
3. `requires_action` / `retries_exhausted` は throw

**Detailed steps**:

- import に `listEvents`, `isStatusIdleEvent`, `isEndTurnIdle` を追加:
  ```typescript
  import { retrieveSession, listEvents } from "./sdk/sessions.js";
  ```

- `isSessionIdle(session)` のブロックを以下に置き換え:
  ```typescript
    if (isSessionIdle(session)) {
      // Verify stop_reason via events.list() to distinguish end_turn from error states
      const stopReason = await getIdleStopReason(client, sessionId);
      if (stopReason === "end_turn") {
        return session;
      }
      if (stopReason === "requires_action") {
        throw sessionRequiresActionError(sessionId);
      }
      if (stopReason === "retries_exhausted") {
        throw sessionRetriesExhaustedError(sessionId);
      }
      // Unknown stop_reason — log and treat as success (forward compat)
      stderrWrite(`Polling: idle with unknown stop_reason '${stopReason}'. Treating as complete.`);
      return session;
    }
  ```

- `pollUntilComplete` の後に private helper を追加:
  ```typescript
  /**
   * After polling detects idle, inspect events.list() to find the stop_reason.
   * Returns the stop_reason type string, or "unknown" if not found.
   *
   * listEvents() is called with order: "desc" (most-recent-first), so the first
   * session.status_idle event encountered is the latest one — no need to scan all pages.
   */
  async function getIdleStopReason(
    client: Anthropic,
    sessionId: string,
  ): Promise<string> {
    try {
      const events = await listEvents(client, sessionId);
      // First idle event is the most recent (order: "desc" in listEvents).
      for await (const event of events) {
        if (event.type === "session.status_idle") {
          return event.stop_reason.type;
        }
      }
      return "unknown";
    } catch {
      stderrWrite("Failed to fetch events for stop_reason check. Assuming end_turn.");
      return "end_turn";
    }
  }
  ```

**設計判断**: `listEvents()` は `order: "desc"` で呼び出す（T2 の `listEvents` ラッパーに組み込み済み）。最新イベントが先頭に来るため、`getIdleStopReason` は最初にヒットした `session.status_idle` イベントの `stop_reason` を返せばよい。全ページ走査は不要。

---

## T6: エラーコード・ファクトリの追加

**File**: `src/errors.ts`

**Location**: Line 45（`ERROR_CODES` の末尾）、Line 160 以降（ファクトリ関数）

**Changes**:
1. `SESSION_RETRIES_EXHAUSTED`, `SESSION_REQUIRES_ACTION`, `SESSION_RESCHEDULING_EXHAUSTED` を追加

**Detailed steps**:

- `ERROR_CODES` に追加:
  ```typescript
  SESSION_RETRIES_EXHAUSTED: "SESSION_RETRIES_EXHAUSTED",
  SESSION_REQUIRES_ACTION: "SESSION_REQUIRES_ACTION",
  SESSION_RESCHEDULING_EXHAUSTED: "SESSION_RESCHEDULING_EXHAUSTED",
  ```

- ファクトリ関数を追加:
  ```typescript
  export function sessionRetriesExhaustedError(sessionId: string): SpecRunnerError {
    return new SpecRunnerError(
      ERROR_CODES.SESSION_RETRIES_EXHAUSTED,
      "The SDK exhausted its retry budget. Check session logs on the Anthropic dashboard.",
      `Session ${sessionId} ended with retries_exhausted.`,
    );
  }

  export function sessionRequiresActionError(sessionId: string): SpecRunnerError {
    return new SpecRunnerError(
      ERROR_CODES.SESSION_REQUIRES_ACTION,
      "The session requires user action that spec-runner does not support. Check session logs on the Anthropic dashboard.",
      `Session ${sessionId} is idle with requires_action (unexpected in spec-runner).`,
    );
  }

  export function sessionReschedulingExhaustedError(sessionId: string): SpecRunnerError {
    return new SpecRunnerError(
      ERROR_CODES.SESSION_RESCHEDULING_EXHAUSTED,
      "The session has been rescheduling too many times. This indicates a persistent infrastructure issue.",
      `Session ${sessionId} exceeded rescheduling limit.`,
    );
  }
  ```

---

## T7: Port インターフェースの TerminationReason 型拡張

**File**: `src/core/port/session-client.ts`

**Location**: Line 79（`terminationReason` の型定義）

**Changes**:
`terminationReason` の型リテラルに新しい値を追加

**Detailed steps**:
- Line 79 を以下に置き換え:
  ```typescript
    terminationReason: "end_turn" | "terminated" | "sse_error" | "aborted" | "requires_action" | "retries_exhausted" | "session_error" | "session_deleted" | "unknown";
  ```

---

## T8: SessionClient adapter の terminationReason 型同期

**File**: `src/adapter/managed-agent/session-client.ts`

**Location**: Line 85（`terminationReason` の返り値型）

**Changes**:
Port の型と同期。`runSseStream` が返す `SseStreamResult.terminationReason` は `TerminationReason` 型なので、adapter の返り値型を Port に合わせる。

**Detailed steps**:
- Line 85 を以下に置き換え:
  ```typescript
    terminationReason: "end_turn" | "terminated" | "sse_error" | "aborted" | "requires_action" | "retries_exhausted" | "session_error" | "session_deleted" | "unknown";
  ```

**注意**: `sse-stream.ts` の `TerminationReason` 型を import して使うのが DRY。Port 側が adapter の型に依存できないため、Port は string literal union のまま維持し、adapter 側で `TerminationReason` を import する形がベスト。

---

## T9: agent-runner.ts の terminated ハンドリング確認

**File**: `src/adapter/managed-agent/agent-runner.ts`

**Location**: Line 159-163, Line 166-168

**Changes**:
確認のみ。追加変更が必要な場合のみ修正。

**確認事項**:
- Line 159: `sseResult.terminated` が `true` の場合にエラーを throw → 新しい `terminationReason`（`requires_action`, `retries_exhausted`, `session_error`, `session_deleted`）は全て `terminated = true` をセットするため、このパスに乗る。**追加変更不要**。
- Line 166-168: `terminationReason !== "end_turn" && !== "terminated"` の場合に polling fallback → 新しい terminationReason は `terminated = true` のため Line 159 で先に catch される。**追加変更不要**。

ただし、エラーメッセージの改善を検討:
- 現在 `sessionTerminatedError()` を一律で投げているが、`terminationReason` に応じた具体的なエラー（T6 で追加したファクトリ）を使うとデバッグ性が向上する。

**Optional improvement**:
```typescript
if (sseResult.terminated) {
  const errFactory = getTerminationError(sseResult.terminationReason);
  const termErr = errFactory();
  // ...
}
```

これは Optional。`sessionTerminatedError()` でも機能上は問題ない。実装者の判断に委ねる。

---

## T9a: normalizeSessionError が新規エラーコードを正しく伝搬するか確認

**File**: `src/adapter/managed-agent/session-error.ts`, `src/adapter/managed-agent/session-client.ts`

**Location**: `normalizeSessionError` 関数、`AnthropicSessionClient.pollUntilComplete`

**Changes**:
確認のみ。追加変更が必要な場合のみ修正。

**確認事項**:
1. `session-error.ts` の `normalizeSessionError` は `err.code` が非空文字列の場合にそのコードを保持する
2. T6 で追加する `sessionRetriesExhaustedError()`, `sessionRequiresActionError()`, `sessionReschedulingExhaustedError()` は全て `SpecRunnerError` インスタンスを返す
3. `SpecRunnerError` は `public readonly code: string` を持つため、`normalizeSessionError` の `.code` 保持ロジックに正しくヒットする
4. 結果: `AnthropicSessionClient.pollUntilComplete` は新規エラーを `{ status: "terminated", error: { code: "SESSION_RETRIES_EXHAUSTED", message: "...", hint: "..." } }` に変換する
5. **結論**: 追加変更不要。現行の `normalizeSessionError` ロジックで新規 `SpecRunnerError` インスタンスを正しく処理できる

**追加確認**: `session-client.ts` の `pollUntilComplete` の返り値型（`status: "idle" | "terminated"`）は変更不要。新規エラーはすべて `status: "terminated"` に集約される。エラーの詳細は `error.code` で区別できる。

---

## T10: ユニットテスト追加

**File**: `tests/completion.test.ts`（既存ファイルに追加）

**Changes**:
以下のテストケースを追加

### T10-1: SSE — requires_action で terminated + terminationReason 設定

```typescript
describe("SSE: idle + requires_action", () => {
  it("isEndTurnIdle returns false for requires_action", () => {
    const idleEvent = {
      id: "evt_001",
      type: "session.status_idle" as const,
      processed_at: new Date().toISOString(),
      stop_reason: { type: "requires_action" as const, event_ids: ["evt_002"] },
    } as BetaManagedAgentsSessionStatusIdleEvent;
    expect(isEndTurnIdle(idleEvent)).toBe(false);
  });
});
```

### T10-2: SSE — retries_exhausted で terminated + terminationReason 設定

```typescript
describe("SSE: idle + retries_exhausted", () => {
  it("isEndTurnIdle returns false for retries_exhausted", () => {
    const idleEvent = {
      id: "evt_001",
      type: "session.status_idle" as const,
      processed_at: new Date().toISOString(),
      stop_reason: { type: "retries_exhausted" as const },
    } as BetaManagedAgentsSessionStatusIdleEvent;
    expect(isEndTurnIdle(idleEvent)).toBe(false);
  });
});
```

### T10-3: SDK ナローイング関数のテスト

```typescript
describe("SDK narrowing helpers", () => {
  it("isStatusRescheduledEvent identifies rescheduled", () => {
    const event = { type: "session.status_rescheduled", id: "evt_001", processed_at: "..." };
    expect(isStatusRescheduledEvent(event as BetaManagedAgentsStreamSessionEvents)).toBe(true);
  });

  it("isSessionErrorEvent identifies error", () => {
    const event = { type: "session.error", id: "evt_001", processed_at: "...", error: { type: "unknown_error", message: "test", retry_status: { type: "retrying" } } };
    expect(isSessionErrorEvent(event as BetaManagedAgentsStreamSessionEvents)).toBe(true);
  });

  it("isSessionDeletedEvent identifies deleted", () => {
    const event = { type: "session.deleted", id: "evt_001", processed_at: "..." };
    expect(isSessionDeletedEvent(event as BetaManagedAgentsStreamSessionEvents)).toBe(true);
  });

  it("isRetryStatusRetrying returns true for retrying", () => {
    expect(isRetryStatusRetrying({ type: "unknown_error", message: "test", retry_status: { type: "retrying" } })).toBe(true);
  });

  it("isRetryStatusRetrying returns false for exhausted", () => {
    expect(isRetryStatusRetrying({ type: "unknown_error", message: "test", retry_status: { type: "exhausted" } })).toBe(false);
  });
});
```

### T10-4: ポーリング — rescheduling 上限超過

```typescript
describe("Polling: rescheduling exhaustion", () => {
  it("throws after MAX_RESCHEDULING_COUNT consecutive rescheduling", async () => {
    let callCount = 0;
    const mockClient = {
      beta: {
        sessions: {
          retrieve: vi.fn().mockImplementation(() => {
            callCount++;
            return Promise.resolve(makeSession({ status: "rescheduling" as any }));
          }),
        },
      },
    } as unknown as Parameters<typeof pollUntilComplete>[0];

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await expect(
      pollUntilComplete(mockClient, "sess_001", undefined, { sleepFn }),
    ).rejects.toThrow(/rescheduling/i);
  });
});
```

### T10-5: ポーリング — rescheduling 後に idle 復帰

```typescript
describe("Polling: rescheduling recovery", () => {
  it("recovers when rescheduling transitions to idle", async () => {
    let callCount = 0;
    const mockClient = {
      beta: {
        sessions: {
          retrieve: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount <= 3) {
              return Promise.resolve(makeSession({ status: "rescheduling" as any }));
            }
            return Promise.resolve(makeSession({ status: "idle" }));
          }),
          events: {
            list: vi.fn().mockReturnValue({
              [Symbol.asyncIterator]: async function* () {
                yield { type: "session.status_idle", stop_reason: { type: "end_turn" } };
              },
            }),
          },
        },
      },
    } as unknown as Parameters<typeof pollUntilComplete>[0];

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    const result = await pollUntilComplete(mockClient, "sess_001", undefined, { sleepFn });
    expect(result.status).toBe("idle");
  });
});
```

### T10-6: ポーリング — idle + requires_action でエラー

```typescript
describe("Polling: idle + requires_action", () => {
  it("throws SESSION_REQUIRES_ACTION when stop_reason is requires_action", async () => {
    const mockClient = {
      beta: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue(makeSession({ status: "idle" })),
          events: {
            list: vi.fn().mockReturnValue({
              [Symbol.asyncIterator]: async function* () {
                yield { type: "session.status_idle", stop_reason: { type: "requires_action", event_ids: [] } };
              },
            }),
          },
        },
      },
    } as unknown as Parameters<typeof pollUntilComplete>[0];

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await expect(
      pollUntilComplete(mockClient, "sess_001", undefined, { sleepFn }),
    ).rejects.toThrow(/requires_action/i);
  });
});
```

---

## T11: 型チェックとテスト実行

**Command**: `bun run typecheck && bun test`

**Expected outcome**:
- 型エラーなし
- 全テスト green

**Verification checklist**:
- [ ] `bun run typecheck` が exit 0
- [ ] `bun test tests/completion.test.ts` の新規テストが全て pass
- [ ] `bun test` 全体が green

---

## タスク依存関係

```
T1 (TerminationReason 型拡張)
T2 (SDK ナローイング関数 + listEvents order:desc)  ← T1 と並行可
T6 (エラーコード追加)                              ← T1 と並行可
  ↓
T3 (SSE ハンドリング拡張)                          ← T1, T2 に依存
T4 (ポーリング rescheduling + isProposeComplete リネーム)  ← T6 に依存
T5 (ポーリング stop_reason + isSessionIdle 使用)   ← T2, T6, T4 に依存
  ↓
T7 (Port 型拡張)                  ← T1 に依存
T8 (Adapter 型同期)               ← T1, T7 に依存
T9 (agent-runner 確認)            ← T3 に依存
T9a (normalizeSessionError 確認)  ← T6 に依存（確認のみ）
  ↓
T10 (テスト追加)                  ← T2-T6 に依存
  ↓
T11 (typecheck + test)            ← 全タスク完了後
```

実行順序の推奨: T1 → T2, T6（並行）→ T7, T3, T4（並行）→ T5（T4 完了後）→ T8, T9, T9a → T10 → T11

---

## 受け入れ基準の検証手順

### AC1: SSE が新しい状態を適切にハンドリングする

**手順**: T10-1〜T10-3 のテストが pass すること

### AC2: ポーリングが rescheduling を認識する

**手順**: T10-4, T10-5 のテストが pass すること

### AC3: ポーリングが stop_reason を区別する

**手順**: T10-6 のテストが pass すること

### AC4: TerminationReason 型が新しい状態を表現できる

**手順**: `bun run typecheck` が pass すること（Port と adapter の型が同期）

### AC5: bun run typecheck && bun run test が green

**手順**: T11 を実行

---

## 実装ノート

- **Line numbers**: main branch 基準。実装時にコンフリクトした場合はコメント文字列 / 関数名で検索すること
- **events.list() のソート順**: `listEvents()` ラッパーに `{ order: "desc" }` を組み込み済み。最新イベントが先頭に来るため、`getIdleStopReason` は最初にヒットした idle イベントを返すだけでよい（全ページ走査不要）
- **isProposeComplete → isSessionIdle リネーム**: `isProposeComplete` は「完了」を意図させる命名だが、T5 で idle の stop_reason を区別してエラーにする流れと矛盾する。`isSessionIdle`（status が idle かを確認するだけ）にリネームして認知的矛盾を解消する
- **rescheduling 上限の定数化**: `MAX_RESCHEDULING_COUNT = 10` はファイルスコープの定数。config 注入は不要（architect 判断済み）
- **Port 型の重複**: `session-client.ts` の `terminationReason` リテラル型と `sse-stream.ts` の `TerminationReason` 型は意図的に分離されている（core は adapter に依存できない）。値の追加時は両方を更新すること
- **session.error + retrying**: SDK が自動リトライ中のため、spec-runner はログだけ出して SSE ストリーム続行。追加のリトライロジックは不要
- **T5 の getIdleStopReason**: events.list() の API コールが追加される。ポーリング完了時の 1 回のみなので性能影響は軽微
- **normalizeSessionError の互換性**: 新規 `SpecRunnerError`（`SESSION_RETRIES_EXHAUSTED` 等）は `.code` を持つため、`normalizeSessionError` の既存ロジックで正しく伝搬される。変更不要（T9a 参照）

---

## 完了条件

- [x] T1: `TerminationReason` に 4 つの新値を追加
- [x] T2: SDK ナローイング関数 4 つ + `listEvents` ラッパー追加（`order: "desc"` 付き）
- [x] T3: SSE ストリームが全状態をハンドリング
- [x] T4: `isProposeComplete` を `isSessionIdle` にリネーム + ポーリングが `rescheduling` を認識し上限超過でエラー
- [x] T5: ポーリングが `stop_reason` を区別（`isSessionIdle` 使用、`getIdleStopReason` は `order: "desc"` 前提）
- [x] T6: エラーコード 3 つ + ファクトリ関数追加
- [x] T7: Port の `terminationReason` 型拡張
- [x] T8: Adapter の返り値型同期
- [x] T9: agent-runner.ts の確認（変更不要を確認）
- [x] T9a: `normalizeSessionError` が新規 `SpecRunnerError` を正しく伝搬することを確認（変更不要を確認）
- [x] T10: ユニットテスト追加
- [x] T11: `bun run typecheck && bun test` が green
