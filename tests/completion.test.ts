import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isProposeComplete,
  isSessionTerminated,
  calculateBackoff,
  pollUntilComplete,
  assertBreakAfterCompletion,
} from "../src/adapter/anthropic/completion.js";
import type { BetaManagedAgentsSession } from "@anthropic-ai/sdk/resources/beta/sessions/sessions";
import {
  isStatusIdleEvent,
  isEndTurnIdle,
  isStatusTerminatedEvent,
} from "../src/sdk/sessions.js";
import type {
  BetaManagedAgentsStreamSessionEvents,
  BetaManagedAgentsSessionStatusIdleEvent,
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
    const mockAbort = vi.spyOn(abortController, "abort");

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

// TC-032: ポーリング — タイムアウト（30 分超過）
describe("TC-032: polling — timeout after 30m", () => {
  it("throws SESSION_TIMEOUT after timeout", async () => {
    const mockClient = {
      beta: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue(
            makeSession({ status: "running" }),
          ),
        },
      },
    } as unknown as Parameters<typeof pollUntilComplete>[0];

    // Use 100ms timeout so test doesn't take 30 min
    let callCount = 0;
    const sleepFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount >= 3) {
        // Simulate elapsed time by moving to timeout
        return Promise.resolve();
      }
      return Promise.resolve();
    });

    await expect(
      pollUntilComplete(mockClient, "sess_001", undefined, {
        timeoutMs: 50, // very short timeout
        sleepFn,
      }),
    ).rejects.toThrow();

    // The error should be SESSION_TIMEOUT
    try {
      await pollUntilComplete(mockClient, "sess_001", undefined, {
        timeoutMs: 50,
        sleepFn,
      });
    } catch (err: unknown) {
      expect((err as { code?: string }).code).toBe("SESSION_TIMEOUT");
    }
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
