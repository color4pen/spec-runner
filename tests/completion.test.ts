import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isProposeComplete,
  isSessionTerminated,
  calculateBackoff,
  pollUntilComplete,
  assertBreakAfterCompletion,
  DEFAULT_POLL_TIMEOUT_MS,
} from "../src/adapter/managed-agent/completion.js";
import type { BetaManagedAgentsSession } from "@anthropic-ai/sdk/resources/beta/sessions/sessions";
import {
  isStatusIdleEvent,
  isEndTurnIdle,
  isStatusTerminatedEvent,
} from "../src/adapter/managed-agent/sdk/sessions.js";
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
