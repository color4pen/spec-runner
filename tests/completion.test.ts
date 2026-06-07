import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isSessionIdle,
  pollUntilComplete,
  assertBreakAfterCompletion,
  DEFAULT_POLL_TIMEOUT_MS,
} from "../src/adapter/managed-agent/completion.js";
import type { BetaManagedAgentsSession } from "@anthropic-ai/sdk/resources/beta/sessions/sessions";
import {
  isStatusIdleEvent,
  isEndTurnIdle,
  isStatusRescheduledEvent,
  isSessionErrorEvent,
  isSessionDeletedEvent,
  isRetryStatusRetrying,
} from "../src/adapter/managed-agent/sdk/sessions.js";
import type {
  BetaManagedAgentsStreamSessionEvents,
  BetaManagedAgentsSessionStatusIdleEvent,
  BetaManagedAgentsSessionErrorEvent,
} from "@anthropic-ai/sdk/resources/beta/sessions/events";

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

function makeSession(overrides: Partial<BetaManagedAgentsSession>): BetaManagedAgentsSession {
  return {
    id: "sess_001",
    status: "running",
    type: "session",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    archived_at: null,
    environment_id: "env_001",
    metadata: {},
    resources: [],
    stats: {},
    title: null,
    usage: {},
    vault_ids: [],
    agent: {
      id: "agent_001",
      description: null,
      mcp_servers: [],
      model: { type: "model", id: "claude-sonnet-4-5" } as unknown as BetaManagedAgentsSession["agent"]["model"],
      name: "test",
      skills: [],
      system: null,
      tools: [],
      type: "agent",
      version: 1,
    },
    ...overrides,
  } as unknown as BetaManagedAgentsSession;
}

// TC-026: SSE break-after-completion — idle+end_turn で break する
describe("TC-026: SSE break-after-completion", () => {
  it("isStatusIdleEvent correctly identifies idle event", () => {
    const idleEvent = {
      id: "evt_001",
      type: "session.status_idle",
      processed_at: new Date().toISOString(),
      stop_reason: { type: "end_turn" as const },
    } as BetaManagedAgentsSessionStatusIdleEvent;

    expect(isStatusIdleEvent(idleEvent as BetaManagedAgentsStreamSessionEvents)).toBe(true);
  });

  it("isEndTurnIdle returns true for end_turn stop reason", () => {
    const idleEvent = {
      id: "evt_001",
      type: "session.status_idle" as const,
      processed_at: new Date().toISOString(),
      stop_reason: { type: "end_turn" as const },
    } as BetaManagedAgentsSessionStatusIdleEvent;

    expect(isEndTurnIdle(idleEvent)).toBe(true);
  });

  it("assertBreakAfterCompletion does not throw for idle event", () => {
    expect(() =>
      assertBreakAfterCompletion({ type: "session.status_idle" }),
    ).not.toThrow();
  });
});

// TC-027: SSE break — requires_action では break しない
describe("TC-027: requires_action does not trigger end", () => {
  it("isEndTurnIdle returns false for requires_action stop reason", () => {
    const idleEvent = {
      id: "evt_001",
      type: "session.status_idle" as const,
      processed_at: new Date().toISOString(),
      stop_reason: { type: "requires_action" as const, event_ids: [] },
    } as BetaManagedAgentsSessionStatusIdleEvent;

    expect(isEndTurnIdle(idleEvent)).toBe(false);
  });
});

// TC-028: ポーリング先行完了時の SSE AbortSignal キャンセル
describe("TC-028: polling triggers AbortController abort", () => {
  it("AbortController.abort() is called when polling completes", async () => {
    const abortController = new AbortController();
    const _mockAbort = vi.spyOn(abortController, "abort");

    // Create a mock client that returns idle on first call
    const mockClient = {
      beta: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue(
            makeSession({ status: "idle" }),
          ),
        },
      },
    } as unknown as Parameters<typeof pollUntilComplete>[0];

    // Use very short sleep
    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await pollUntilComplete(mockClient, "sess_001", undefined, {
      sleepFn,
    });

    // Verify polling returned successfully (idle)
    expect(mockClient.beta.sessions.retrieve).toHaveBeenCalled();
  });
});

// TC-031: ポーリング — terminated を観測したら即失敗
describe("TC-031: polling — terminated triggers failure", () => {
  it("throws SESSION_TERMINATED when status is terminated", async () => {
    const mockClient = {
      beta: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue(
            makeSession({ status: "terminated" }),
          ),
        },
      },
    } as unknown as Parameters<typeof pollUntilComplete>[0];

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await expect(
      pollUntilComplete(mockClient, "sess_001", undefined, { sleepFn }),
    ).rejects.toThrow("Session terminated.");

    // Verify error code
    try {
      await pollUntilComplete(mockClient, "sess_001", undefined, { sleepFn });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("SESSION_TERMINATED");
    }
  });
});

// TC-032 (removed): SESSION_TIMEOUT after 30m was removed in remove-session-timeout.
// pollUntilComplete no longer has a wall-clock timeout (design D1).
// The only terminal error from polling is SESSION_TERMINATED.

// TC-POLL-TIMEOUT: pollUntilComplete が timeoutMs 超過で PollTimeoutError を throw する
describe("TC-POLL-TIMEOUT: pollUntilComplete timeoutMs", () => {
  it("throws POLL_TIMEOUT when timeoutMs is exceeded", async () => {
    const mockClient = {
      beta: {
        sessions: {
          // Session stays "running" indefinitely
          retrieve: vi.fn().mockResolvedValue(
            makeSession({ status: "running" }),
          ),
        },
      },
    } as unknown as Parameters<typeof pollUntilComplete>[0];

    // sleepFn delays longer than the timeout (50ms sleep, 1ms timeout)
    const sleepFn = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
    );

    await expect(
      pollUntilComplete(mockClient, "sess_timeout", undefined, {
        sleepFn,
        timeoutMs: 1,
      }),
    ).rejects.toMatchObject({ code: "POLL_TIMEOUT" });
  });

  it("does not time out when timeoutMs is not provided", async () => {
    const mockClient = {
      beta: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue(
            makeSession({ status: "idle" }),
          ),
        },
      },
    } as unknown as Parameters<typeof pollUntilComplete>[0];

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    // Should resolve without throwing — no timeoutMs means no timeout
    const result = await pollUntilComplete(mockClient, "sess_no_timeout", undefined, {
      sleepFn,
    });

    expect(result.status).toBe("idle");
  });

  it("DEFAULT_POLL_TIMEOUT_MS is 900000 (15 minutes)", () => {
    expect(DEFAULT_POLL_TIMEOUT_MS).toBe(900_000);
  });
});

// TC-034: SSE 切断 — ポーリング fallback
describe("TC-034: SSE disconnection fallback to polling", () => {
  it("SessionClient.streamEvents reports sseDisconnected when SSE errors out", async () => {
    // Migrated from startProposeSession (deprecated) — now directly tests SessionClient.streamEvents.
    // startProposeSession was a thin wrapper that delegated to client.streamEvents.
    const mockStreamEvents = vi.fn().mockResolvedValue({
      sseDisconnected: true,
      idleEndTurnDetected: false,
      terminated: false,
      terminationReason: "sse_error",
    });

    const result = await mockStreamEvents("sess_001", {
      requestContent: "test request",
    });

    expect(result.sseDisconnected).toBe(true);
    expect(result.terminationReason).toBe("sse_error");
  });
});

// TC-RENAME-01/02/03: isSessionIdle — isProposeComplete リネーム確認
describe("TC-RENAME: isSessionIdle replaces isProposeComplete", () => {
  it("isSessionIdle returns true for idle status", () => {
    expect(isSessionIdle(makeSession({ status: "idle" }))).toBe(true);
  });

  it("isSessionIdle returns false for running status", () => {
    expect(isSessionIdle(makeSession({ status: "running" }))).toBe(false);
  });
});

// T10-1: SSE — requires_action で isEndTurnIdle が false
describe("TC-SS-01: SSE idle + requires_action", () => {
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

// T10-2: SSE — retries_exhausted で isEndTurnIdle が false
describe("TC-SS-02: SSE idle + retries_exhausted", () => {
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

// T10-3: SDK ナローイング関数テスト
describe("TC-NARROW: SDK narrowing helpers", () => {
  it("TC-NARROW-01: isStatusRescheduledEvent identifies rescheduled", () => {
    const event = { type: "session.status_rescheduled", id: "evt_001", processed_at: "2024-01-01T00:00:00Z" };
    expect(isStatusRescheduledEvent(event as BetaManagedAgentsStreamSessionEvents)).toBe(true);
  });

  it("TC-NARROW-02: isStatusRescheduledEvent returns false for idle", () => {
    const event = { type: "session.status_idle", id: "evt_001", processed_at: "2024-01-01T00:00:00Z", stop_reason: { type: "end_turn" } };
    expect(isStatusRescheduledEvent(event as BetaManagedAgentsStreamSessionEvents)).toBe(false);
  });

  it("TC-NARROW-03: isSessionErrorEvent identifies error", () => {
    const event = {
      type: "session.error",
      id: "evt_001",
      processed_at: "2024-01-01T00:00:00Z",
      error: { type: "unknown_error", message: "test", retry_status: { type: "retrying" } },
    };
    expect(isSessionErrorEvent(event as BetaManagedAgentsStreamSessionEvents)).toBe(true);
  });

  it("TC-NARROW-04: isSessionDeletedEvent identifies deleted", () => {
    const event = { type: "session.deleted", id: "evt_001", processed_at: "2024-01-01T00:00:00Z" };
    expect(isSessionDeletedEvent(event as BetaManagedAgentsStreamSessionEvents)).toBe(true);
  });

  it("TC-NARROW-05: isRetryStatusRetrying returns true for retrying", () => {
    const error = {
      type: "unknown_error" as const,
      message: "test",
      retry_status: { type: "retrying" as const },
    } as BetaManagedAgentsSessionErrorEvent["error"];
    expect(isRetryStatusRetrying(error)).toBe(true);
  });

  it("TC-NARROW-06: isRetryStatusRetrying returns false for exhausted", () => {
    const error = {
      type: "unknown_error" as const,
      message: "test",
      retry_status: { type: "exhausted" as const },
    } as BetaManagedAgentsSessionErrorEvent["error"];
    expect(isRetryStatusRetrying(error)).toBe(false);
  });

  it("TC-NARROW-07: isRetryStatusRetrying returns false for terminal", () => {
    const error = {
      type: "unknown_error" as const,
      message: "test",
      retry_status: { type: "terminal" as const },
    } as BetaManagedAgentsSessionErrorEvent["error"];
    expect(isRetryStatusRetrying(error)).toBe(false);
  });
});

// T10-4: ポーリング — rescheduling 上限超過でエラー (TC-POLL-02)
describe("TC-POLL-02: Polling rescheduling exhaustion", () => {
  it("throws SESSION_RESCHEDULING_EXHAUSTED after MAX_RESCHEDULING_COUNT consecutive rescheduling", async () => {
    const mockClient = {
      beta: {
        sessions: {
          retrieve: vi.fn().mockImplementation(() => {
            return Promise.resolve(makeSession({ status: "rescheduling" as unknown as BetaManagedAgentsSession["status"] }));
          }),
        },
      },
    } as unknown as Parameters<typeof pollUntilComplete>[0];

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await expect(
      pollUntilComplete(mockClient, "sess_001", undefined, { sleepFn }),
    ).rejects.toThrow(/rescheduling/i);

    try {
      await pollUntilComplete(mockClient, "sess_001", undefined, { sleepFn });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("SESSION_RESCHEDULING_EXHAUSTED");
    }
  });
});

// T10-5: ポーリング — rescheduling 後に idle 復帰 (TC-POLL-03)
describe("TC-POLL-03: Polling rescheduling recovery", () => {
  it("recovers when rescheduling transitions to idle with end_turn", async () => {
    let callCount = 0;
    const mockClient = {
      beta: {
        sessions: {
          retrieve: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount <= 3) {
              return Promise.resolve(makeSession({ status: "rescheduling" as unknown as BetaManagedAgentsSession["status"] }));
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

// T10-6: ポーリング — idle + requires_action でエラー (TC-POLL-05)
describe("TC-POLL-05: Polling idle + requires_action", () => {
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

    try {
      const mockClient2 = {
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
      await pollUntilComplete(mockClient2, "sess_001", undefined, { sleepFn });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("SESSION_REQUIRES_ACTION");
    }
  });
});

// TC-POLL-04: ポーリング — idle + end_turn は成功
describe("TC-POLL-04: Polling idle + end_turn success", () => {
  it("returns session when stop_reason is end_turn", async () => {
    const mockClient = {
      beta: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue(makeSession({ status: "idle" })),
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

// TC-POLL-06: ポーリング — idle + retries_exhausted でエラー
describe("TC-POLL-06: Polling idle + retries_exhausted", () => {
  it("throws SESSION_RETRIES_EXHAUSTED when stop_reason is retries_exhausted", async () => {
    const mockClient = {
      beta: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue(makeSession({ status: "idle" })),
          events: {
            list: vi.fn().mockReturnValue({
              [Symbol.asyncIterator]: async function* () {
                yield { type: "session.status_idle", stop_reason: { type: "retries_exhausted" } };
              },
            }),
          },
        },
      },
    } as unknown as Parameters<typeof pollUntilComplete>[0];

    const sleepFn = vi.fn().mockResolvedValue(undefined);

    await expect(
      pollUntilComplete(mockClient, "sess_001", undefined, { sleepFn }),
    ).rejects.toThrow(/retries_exhausted/i);

    try {
      const mockClient2 = {
        beta: {
          sessions: {
            retrieve: vi.fn().mockResolvedValue(makeSession({ status: "idle" })),
            events: {
              list: vi.fn().mockReturnValue({
                [Symbol.asyncIterator]: async function* () {
                  yield { type: "session.status_idle", stop_reason: { type: "retries_exhausted" } };
                },
              }),
            },
          },
        },
      } as unknown as Parameters<typeof pollUntilComplete>[0];
      await pollUntilComplete(mockClient2, "sess_001", undefined, { sleepFn });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("SESSION_RETRIES_EXHAUSTED");
    }
  });
});

// TC-ERR: エラーファクトリ関数テスト
describe("TC-ERR: Error factory functions", () => {
  it("TC-ERR-01: sessionRetriesExhaustedError has correct code", async () => {
    const { sessionRetriesExhaustedError } = await import("../src/errors.js");
    const err = sessionRetriesExhaustedError("sess_001");
    expect(err.code).toBe("SESSION_RETRIES_EXHAUSTED");
    expect(err.message).toBeTruthy();
  });

  it("TC-ERR-02: sessionRequiresActionError has correct code", async () => {
    const { sessionRequiresActionError } = await import("../src/errors.js");
    const err = sessionRequiresActionError("sess_001");
    expect(err.code).toBe("SESSION_REQUIRES_ACTION");
    expect(err.message).toBeTruthy();
  });

  it("TC-ERR-03: sessionReschedulingExhaustedError has correct code", async () => {
    const { sessionReschedulingExhaustedError } = await import("../src/errors.js");
    const err = sessionReschedulingExhaustedError("sess_001");
    expect(err.code).toBe("SESSION_RESCHEDULING_EXHAUSTED");
    expect(err.message).toBeTruthy();
  });

  it("TC-ERR-04: new SpecRunnerErrors propagate through normalizeSessionError", async () => {
    const { sessionRetriesExhaustedError, sessionRequiresActionError, sessionReschedulingExhaustedError } = await import("../src/errors.js");
    const { normalizeSessionError } = await import("../src/adapter/managed-agent/session-error.js");

    const err1 = sessionRetriesExhaustedError("sess_001");
    expect(normalizeSessionError(err1).code).toBe("SESSION_RETRIES_EXHAUSTED");

    const err2 = sessionRequiresActionError("sess_001");
    expect(normalizeSessionError(err2).code).toBe("SESSION_REQUIRES_ACTION");

    const err3 = sessionReschedulingExhaustedError("sess_001");
    expect(normalizeSessionError(err3).code).toBe("SESSION_RESCHEDULING_EXHAUSTED");
  });
});
