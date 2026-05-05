/**
 * Unit tests for src/adapter/managed-agent/session-runner.ts
 * TC-051: runManagedAgentSession — session create → events.send → poll → idle (should)
 * TC-052: runManagedAgentSession — terminated → error.code=SESSION_TERMINATED (should)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runManagedAgentSession } from "../../src/adapter/managed-agent/session-runner.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "session-runner-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Build a mock Anthropic client for session-runner tests.
 * Adapter takes (client: Anthropic, input) directly.
 */
function buildMockClient(sessionStatus: "idle" | "terminated" = "idle") {
  const sessionId = "sess_managed_001";
  return {
    sessionId,
    client: {
      beta: {
        sessions: {
          create: vi.fn().mockResolvedValue({ id: sessionId, type: "session" }),
          retrieve: vi.fn().mockResolvedValue({ id: sessionId, status: sessionStatus }),
          events: {
            send: vi.fn().mockResolvedValue({}),
            stream: vi.fn(),
          },
        },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    sleepFn: vi.fn().mockResolvedValue(undefined),
  };
}

// TC-051: runManagedAgentSession — session create → events.send → poll → idle
describe("TC-051: runManagedAgentSession — idle completion returns {sessionId, status: 'idle'}", () => {
  it("calls sessions.create, events.send, and returns idle status", async () => {
    const { client, sessionId, sleepFn } = buildMockClient("idle");

    const result = await runManagedAgentSession(client, {
      agentId: "agent_001",
      environmentId: "env_001",
      repo: { owner: "testowner", name: "testrepo" },
      githubToken: "ghp_test",
      initialMessage: "Do the spec review.",
      stepName: "spec-review",
      sleepFn,
    });

    expect(result.sessionId).toBe(sessionId);
    expect(result.status).toBe("idle");
    expect(result.error).toBeUndefined();

    // Verify events.send was called once
    const sendSpy = client.beta.sessions.events?.send as ReturnType<typeof vi.fn>;
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});

// TC-052: runManagedAgentSession — terminated → error.code=SESSION_TERMINATED
describe("TC-052: runManagedAgentSession — terminated session returns SESSION_TERMINATED error", () => {
  it("returns {status: 'terminated', error: {code: 'SESSION_TERMINATED'}} when session is terminated", async () => {
    const { client, sleepFn } = buildMockClient("terminated");

    const result = await runManagedAgentSession(client, {
      agentId: "agent_001",
      environmentId: "env_001",
      repo: { owner: "testowner", name: "testrepo" },
      githubToken: "ghp_test",
      initialMessage: "Do the spec review.",
      stepName: "spec-review",
      sleepFn,
    });

    expect(result.status).toBe("terminated");
    expect(result.error?.code).toBe("SESSION_TERMINATED");
  });
});
