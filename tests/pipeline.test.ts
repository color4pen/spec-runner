import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Setup temp directory for state files
let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-pipeline-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
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

// Helper to create a base job state
async function makeJobState() {
  const { createJobState } = await import("../src/state/store.js");
  return createJobState({
    request: { path: "/test/request.md", title: "Test Request", type: "new-feature" },
    repository: { owner: "testowner", name: "testrepo" },
  });
}

// Helper to build a mock Anthropic client that simulates a successful propose session
function buildMockClient(opts: {
  registerBranch?: string; // if set, emits register_branch call then idle+end_turn
  terminateSession?: boolean; // if set, emits session.status_terminated
  branchApiStatus?: number; // GitHub branch API response status (default 200)
  folderApiStatus?: number; // GitHub change folder API response status (default 200)
}) {
  const { registerBranch, terminateSession } = opts;

  // Build SSE events sequence
  type MockEvent =
    | { type: "agent.custom_tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "session.status_idle"; stop_reason: { type: "end_turn" } | { type: "requires_action"; event_ids: string[] } }
    | { type: "session.status_terminated" };

  const events: MockEvent[] = [];
  if (terminateSession) {
    events.push({ type: "session.status_terminated" });
  } else if (registerBranch) {
    events.push({
      type: "agent.custom_tool_use",
      id: "ctu_test001",
      name: "register_branch",
      input: { branch: registerBranch },
    });
    events.push({
      type: "session.status_idle",
      stop_reason: { type: "end_turn" },
    });
  } else {
    // No register_branch — just idle+end_turn
    events.push({
      type: "session.status_idle",
      stop_reason: { type: "end_turn" },
    });
  }

  async function* makeStream() {
    for (const event of events) {
      yield event;
    }
  }

  return {
    beta: {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: "sess_test001", type: "session" }),
        events: {
          stream: vi.fn().mockReturnValue(makeStream()),
          send: vi.fn().mockResolvedValue({}),
        },
      },
    },
  };
}

// Helper GitHub fetch mock
function buildGithubFetch(branchStatus = 200, folderStatus = 200) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("/branches/")) {
      return Promise.resolve({ status: branchStatus, ok: branchStatus < 400 });
    }
    if (url.includes("/contents/")) {
      return Promise.resolve({ status: folderStatus, ok: folderStatus < 400 });
    }
    return Promise.resolve({ status: 200, ok: true });
  });
}

function buildConfig() {
  return {
    version: 1 as const,
    anthropic: { apiKey: "sk-ant-test" },
    agent: { id: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
    environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    github: { accessToken: "ghp_test", tokenObtainedAt: new Date().toISOString(), scopes: ["repo"] },
  };
}

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

function buildRequest() {
  return { type: "new-feature", title: "Test Request", content: "Please implement this.", enabled: [] };
}

// TC-035: propose パイプライン — 正常完了（状態遷移の全記録）
describe("TC-035: propose pipeline — normal completion with full history", () => {
  it("records all required history steps on success", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runProposePipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const mockClient = buildMockClient({ registerBranch: "feat/2026-04-27-test" });
    const githubFetch = buildGithubFetch(200, 200);

    const result = await runProposePipeline(jobState, {
      client: mockClient as unknown as Parameters<typeof runProposePipeline>[1]["client"],
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "2026-04-27-cli-core-pipeline",
      githubFetch,
    });

    expect(result.status).toBe("success");

    const steps = result.history.map((h) => h.step);
    // Must contain all required steps
    expect(steps).toContain("session-create");
    expect(steps).toContain("events-stream-connected");
    expect(steps).toContain("initial-message-sent");
    expect(steps).toContain("register-branch-received");
    expect(steps).toContain("idle-end-turn-detected");
    expect(steps).toContain("branch-verified");
    expect(steps).toContain("success");
  });
});

// TC-036: propose パイプライン — register_branch 未呼び出しで完了
describe("TC-036: propose pipeline — BRANCH_NOT_REGISTERED when no register_branch call", () => {
  it("fails with BRANCH_NOT_REGISTERED when agent completes without calling register_branch", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runProposePipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    // No registerBranch — agent just sends idle+end_turn
    const mockClient = buildMockClient({ registerBranch: undefined });
    const githubFetch = buildGithubFetch();

    await expect(
      runProposePipeline(jobState, {
        client: mockClient as unknown as Parameters<typeof runProposePipeline>[1]["client"],
        config: buildConfig(),
        repo: buildRepo(),
        request: buildRequest(),
        slug: "2026-04-27-cli-core-pipeline",
        githubFetch,
      }),
    ).rejects.toMatchObject({ code: "BRANCH_NOT_REGISTERED" });

    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    const combined = stderrCalls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(combined).toContain("Branch was not registered by the agent.");
  });
});

// TC-037: propose パイプライン — SSE 接続は初回メッセージ送信の前に確立される
describe("TC-037: propose pipeline — SSE stream connected before initial message send", () => {
  it("stream() is called before events.send()", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runProposePipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const callOrder: string[] = [];

    async function* makeStream() {
      yield {
        type: "agent.custom_tool_use",
        id: "ctu_001",
        name: "register_branch",
        input: { branch: "feat/test" },
      };
      yield { type: "session.status_idle", stop_reason: { type: "end_turn" } };
    }

    const mockClient = {
      beta: {
        sessions: {
          create: vi.fn().mockResolvedValue({ id: "sess_001", type: "session" }),
          events: {
            stream: vi.fn().mockImplementation(() => {
              callOrder.push("stream");
              return makeStream();
            }),
            send: vi.fn().mockImplementation(() => {
              callOrder.push("send");
              return Promise.resolve({});
            }),
          },
        },
      },
    };

    await runProposePipeline(jobState, {
      client: mockClient as unknown as Parameters<typeof runProposePipeline>[1]["client"],
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "2026-04-27-test",
      githubFetch: buildGithubFetch(),
    });

    // stream must come before first send
    const streamIdx = callOrder.indexOf("stream");
    const sendIdx = callOrder.indexOf("send");
    expect(streamIdx).toBeLessThan(sendIdx);
  });
});

// TC-038: propose パイプライン — 初回メッセージに user-request タグが含まれる
describe("TC-038: propose pipeline — initial message contains user-request tag", () => {
  it("events.send receives a message with <user-request> tags", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runProposePipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    let capturedSendPayload: unknown = null;

    async function* makeStream() {
      yield {
        type: "agent.custom_tool_use",
        id: "ctu_001",
        name: "register_branch",
        input: { branch: "feat/test" },
      };
      yield { type: "session.status_idle", stop_reason: { type: "end_turn" } };
    }

    const mockClient = {
      beta: {
        sessions: {
          create: vi.fn().mockResolvedValue({ id: "sess_001", type: "session" }),
          events: {
            stream: vi.fn().mockReturnValue(makeStream()),
            send: vi.fn().mockImplementation((sessionId: string, payload: unknown) => {
              if (!capturedSendPayload) {
                capturedSendPayload = payload;
              }
              return Promise.resolve({});
            }),
          },
        },
      },
    };

    await runProposePipeline(jobState, {
      client: mockClient as unknown as Parameters<typeof runProposePipeline>[1]["client"],
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "2026-04-27-test",
      githubFetch: buildGithubFetch(),
    });

    const payload = capturedSendPayload as { events: Array<{ type: string; content: Array<{ type: string; text: string }> }> };
    expect(payload).toBeDefined();
    const firstEvent = payload.events[0]!;
    expect(firstEvent.type).toBe("user.message");
    const text = firstEvent.content[0]!.text;
    expect(text).toContain("<user-request>");
    expect(text).toContain("</user-request>");
  });
});

// TC-039: propose パイプライン — CHANGE_FOLDER_NOT_FOUND で失敗
describe("TC-039: propose pipeline — CHANGE_FOLDER_NOT_FOUND", () => {
  it("fails with CHANGE_FOLDER_NOT_FOUND when change folder API returns 404", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runProposePipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const mockClient = buildMockClient({ registerBranch: "feat/test" });
    // branch OK, but change folder 404
    const githubFetch = buildGithubFetch(200, 404);

    await expect(
      runProposePipeline(jobState, {
        client: mockClient as unknown as Parameters<typeof runProposePipeline>[1]["client"],
        config: buildConfig(),
        repo: buildRepo(),
        request: buildRequest(),
        slug: "2026-04-27-test",
        githubFetch,
      }),
    ).rejects.toMatchObject({ code: "CHANGE_FOLDER_NOT_FOUND" });
  });
});

// TC-040: propose パイプライン — branch が GitHub に存在しない（warning のみ）
describe("TC-040: propose pipeline — branch not found on GitHub is warning only", () => {
  it("succeeds with warning when branch API returns 404 but folder API returns 200", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runProposePipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const mockClient = buildMockClient({ registerBranch: "feat/test" });
    // branch 404 (warning), folder 200 (OK)
    const githubFetch = buildGithubFetch(404, 200);

    const result = await runProposePipeline(jobState, {
      client: mockClient as unknown as Parameters<typeof runProposePipeline>[1]["client"],
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "2026-04-27-test",
      githubFetch,
    });

    expect(result.status).toBe("success");
    const branchEntry = result.history.find((h) => h.step === "branch-verified");
    expect(branchEntry?.status).toBe("warning");
  });
});

// TC-041: propose パイプライン — GitHub API 401 で GITHUB_TOKEN_EXPIRED
describe("TC-041: propose pipeline — GITHUB_TOKEN_EXPIRED on 401", () => {
  it("fails with GITHUB_TOKEN_EXPIRED when GitHub API returns 401", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runProposePipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const mockClient = buildMockClient({ registerBranch: "feat/test" });
    // 401 from GitHub
    const githubFetch = buildGithubFetch(401, 401);

    await expect(
      runProposePipeline(jobState, {
        client: mockClient as unknown as Parameters<typeof runProposePipeline>[1]["client"],
        config: buildConfig(),
        repo: buildRepo(),
        request: buildRequest(),
        slug: "2026-04-27-test",
        githubFetch,
      }),
    ).rejects.toMatchObject({ code: "GITHUB_TOKEN_EXPIRED" });

    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    const combined = stderrCalls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(combined).toContain("GitHub token expired. Run 'specrunner login' again.");
  });
});

// TC-042: セッション作成パラメータの検証
describe("TC-042: session creation parameters", () => {
  it("sessions.create is called with agent, environment_id, and github_repository resource", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runProposePipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const mockClient = buildMockClient({ registerBranch: "feat/test" });

    await runProposePipeline(jobState, {
      client: mockClient as unknown as Parameters<typeof runProposePipeline>[1]["client"],
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "2026-04-27-test",
      githubFetch: buildGithubFetch(),
    });

    const calls = (mockClient.beta.sessions.create as ReturnType<typeof vi.fn>).mock.calls;
    const createCall = calls[0]![0] as {
      agent: unknown;
      environment_id: string;
      resources: Array<{ type: string; url?: string; authorization_token?: string }>;
    };
    expect(createCall.agent).toBeDefined();
    expect(createCall.environment_id).toBe("env_001");
    expect(createCall.resources).toBeDefined();
    const ghResource = createCall.resources.find((r) => r.type === "github_repository");
    expect(ghResource).toBeDefined();
    expect(ghResource!.url).toContain("github.com/testowner/testrepo");
    expect(ghResource!.authorization_token).toBe("ghp_test");
  });
});
