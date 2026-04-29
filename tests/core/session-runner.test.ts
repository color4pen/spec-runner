/**
 * Unit tests for src/core/session-runner.ts
 * TC-051: runManagedAgentSession — session create → events.send → poll → idle (should)
 * TC-052: runManagedAgentSession — terminated → error.code=SESSION_TERMINATED (should)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runManagedAgentSession } from "../../src/core/session-runner.js";
import type { PipelineDeps } from "../../src/core/types.js";

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

function buildDeps(sessionStatus: "idle" | "terminated" = "idle"): PipelineDeps {
  const sessionId = "sess_managed_001";
  return {
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
    } as unknown as PipelineDeps["client"],
    config: {
      version: 1,
      anthropic: { apiKey: "sk-test" },
      agent: { id: "agent_001", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test", content: "content", enabled: [] },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
  };
}

// TC-051: runManagedAgentSession — session create → events.send → poll → idle
describe("TC-051: runManagedAgentSession — idle completion returns {sessionId, status: 'idle'}", () => {
  it("calls sessions.create, events.send, and returns idle status", async () => {
    const deps = buildDeps("idle");

    const result = await runManagedAgentSession(deps, {
      agentId: "agent_001",
      environmentId: "env_001",
      repo: { owner: "testowner", name: "testrepo" },
      githubToken: "ghp_test",
      initialMessage: "Do the spec review.",
      timeoutMs: 60000,
      stepName: "spec-review",
    });

    expect(result.sessionId).toBe("sess_managed_001");
    expect(result.status).toBe("idle");
    expect(result.error).toBeUndefined();

    // Verify events.send was called once
    const sendSpy = deps.client.beta.sessions.events?.send as ReturnType<typeof vi.fn>;
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});

// TC-052: runManagedAgentSession — terminated → error.code=SESSION_TERMINATED
describe("TC-052: runManagedAgentSession — terminated session returns SESSION_TERMINATED error", () => {
  it("returns {status: 'terminated', error: {code: 'SESSION_TERMINATED'}} when session is terminated", async () => {
    const deps = buildDeps("terminated");

    const result = await runManagedAgentSession(deps, {
      agentId: "agent_001",
      environmentId: "env_001",
      repo: { owner: "testowner", name: "testrepo" },
      githubToken: "ghp_test",
      initialMessage: "Do the spec review.",
      timeoutMs: 60000,
      stepName: "spec-review",
    });

    expect(result.status).toBe("terminated");
    expect(result.error?.code).toBe("SESSION_TERMINATED");
  });
});
