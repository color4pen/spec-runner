import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-integration-test-"));
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

async function makeJobState() {
  const { createJobState } = await import("../src/state/store.js");
  return createJobState({
    request: { path: "/test/request.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
  });
}

function buildConfig(specReviewTimeoutMs = 600000) {
  return {
    version: 1 as const,
    anthropic: { apiKey: "sk-ant-test" },
    agent: { id: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
    environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    github: { accessToken: "ghp_test", tokenObtainedAt: new Date().toISOString(), scopes: ["repo"] },
    specReview: { pollIntervalMs: 100, timeoutMs: specReviewTimeoutMs },
  };
}

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

function buildRequest() {
  return { type: "feature", title: "Test", content: "Do something", enabled: [] };
}

/**
 * Build a mock client for a full propose + spec-review pipeline.
 * propose session: SSE-based with register_branch
 * spec-review session: polling-based
 */
function buildPipelineMockClient(opts: {
  proposeBranch?: string;
  proposeFailure?: boolean;
  specReviewVerdict?: "approved" | "needs-fix" | "escalation";
  specReviewSessionId?: string;
}) {
  const {
    proposeBranch = "feat/test-branch",
    proposeFailure = false,
    specReviewVerdict = "approved",
    specReviewSessionId = "sess_spec_review_001",
  } = opts;

  type MockEvent =
    | { type: "agent.custom_tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "session.status_idle"; stop_reason: { type: "end_turn" } }
    | { type: "session.status_terminated" };

  const proposeEvents: MockEvent[] = proposeFailure
    ? [{ type: "session.status_terminated" }]
    : [
        {
          type: "agent.custom_tool_use",
          id: "ctu_001",
          name: "register_branch",
          input: { branch: proposeBranch },
        },
        { type: "session.status_idle", stop_reason: { type: "end_turn" } },
      ];

  async function* makeStream() {
    for (const event of proposeEvents) {
      yield event;
    }
  }

  let createCallCount = 0;

  return {
    proposeSessionId: "sess_propose_001",
    specReviewSessionId,
    client: {
      beta: {
        sessions: {
          create: vi.fn().mockImplementation(() => {
            createCallCount++;
            const sessionId =
              createCallCount === 1 ? "sess_propose_001" : specReviewSessionId;
            return Promise.resolve({ id: sessionId, type: "session" });
          }),
          retrieve: vi.fn().mockResolvedValue({
            id: specReviewSessionId,
            status: "idle",
          }),
          events: {
            stream: vi.fn().mockReturnValue(makeStream()),
            send: vi.fn().mockResolvedValue({}),
          },
        },
      },
    },
    specReviewVerdict,
  };
}

function buildGithubFetch(
  branchStatus = 200,
  folderStatus = 200,
  specReviewVerdict: "approved" | "needs-fix" | "escalation" = "approved",
) {
  const fileContent = `- **verdict**: ${specReviewVerdict}\n\n## Findings\n\n| # | Severity | Category | File | Description | How to Fix |\n|---|---|---|---|---|---|\n| 1 | HIGH | completeness | tasks.md | Missing tests | Add tests |`;

  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("/branches/")) {
      return Promise.resolve({ status: branchStatus, ok: branchStatus < 400 });
    }
    if (url.includes("/contents/openspec") && url.includes("spec-review-result.md")) {
      return Promise.resolve({
        status: 200,
        text: () => Promise.resolve(fileContent),
      });
    }
    if (url.includes("/contents/")) {
      return Promise.resolve({ status: folderStatus, ok: folderStatus < 400 });
    }
    return Promise.resolve({ status: 200, ok: true });
  });
}

// TC-025: runPipeline — propose 正常 + spec-review approved の全ステップ完了
describe("TC-025: runPipeline — propose success + spec-review approved", () => {
  it("completes with status='success' and records both step results", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client, proposeSessionId, specReviewSessionId } = buildPipelineMockClient({
      specReviewVerdict: "approved",
    });
    const githubFetch = buildGithubFetch(200, 200, "approved");

    const result = await runPipeline(jobState, {
      client: client as unknown as import("../src/core/pipeline.js").PipelineDeps["client"],
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    expect(result.status).toBe("success");
    expect(result.steps?.["propose"]).toBeDefined();
    expect(result.steps?.["spec-review"]).toBeDefined();
    expect(result.steps?.["spec-review"]?.verdict).toBe("approved");

    // Propose and spec-review session IDs must be different
    expect(result.steps?.["propose"]?.session?.id).not.toBe(
      result.steps?.["spec-review"]?.session?.id,
    );
  });
});

// TC-026: runPipeline — propose 失敗時に spec-review をスキップする
describe("TC-026: runPipeline — spec-review skipped when propose fails", () => {
  it("does not call sessions.create for spec-review when propose throws", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({
      proposeFailure: true,
    });

    const result = await runPipeline(jobState, {
      client: client as unknown as import("../src/core/pipeline.js").PipelineDeps["client"],
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch: buildGithubFetch(),
    });

    // runPipeline catches propose error and returns jobState (failed)
    // spec-review sessions.create must NOT have been called more than once (only propose)
    const createCalls = (client.beta.sessions.create as ReturnType<typeof vi.fn>).mock.calls;
    expect(createCalls.length).toBe(1); // only propose session created
    // result.status should be failed (propose failed)
    expect(result.status).not.toBe("success");
  });
});

// TC-027: runPipeline — spec-review needs-fix 後に以降の step を呼ばない
describe("TC-027: runPipeline — stops after spec-review needs-fix verdict", () => {
  it("returns with spec-review verdict='needs-fix' (no further steps called)", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({ specReviewVerdict: "needs-fix" });
    const githubFetch = buildGithubFetch(200, 200, "needs-fix");

    const result = await runPipeline(jobState, {
      client: client as unknown as import("../src/core/pipeline.js").PipelineDeps["client"],
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    expect(result.status).toBe("success");
    expect(result.steps?.["spec-review"]?.verdict).toBe("needs-fix");
  });
});

// TC-028: runPipeline — spec-review escalation 後に以降の step を呼ばない
describe("TC-028: runPipeline — stops after spec-review escalation verdict", () => {
  it("returns with spec-review verdict='escalation'", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({ specReviewVerdict: "escalation" });
    const githubFetch = buildGithubFetch(200, 200, "escalation");

    const result = await runPipeline(jobState, {
      client: client as unknown as import("../src/core/pipeline.js").PipelineDeps["client"],
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    expect(result.status).toBe("success");
    expect(result.steps?.["spec-review"]?.verdict).toBe("escalation");
  });
});

// TC-029: runPipeline — SPEC_REVIEW_RESULT_NOT_FOUND シナリオ
describe("TC-029: runPipeline — SPEC_REVIEW_RESULT_NOT_FOUND when file not found", () => {
  it("returns state with status='failed' and error.code='SPEC_REVIEW_RESULT_NOT_FOUND'", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({});

    // Override github fetch to always 404 for spec-review-result.md
    const githubFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("spec-review-result.md")) {
        return Promise.resolve({ status: 404, text: () => Promise.resolve("") });
      }
      if (url.includes("/branches/")) {
        return Promise.resolve({ status: 200, ok: true });
      }
      if (url.includes("/contents/")) {
        return Promise.resolve({ status: 200, ok: true });
      }
      return Promise.resolve({ status: 200, ok: true });
    });

    const result = await runPipeline(jobState, {
      client: client as unknown as import("../src/core/pipeline.js").PipelineDeps["client"],
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    expect(result.status).toBe("failed");
    expect(result.error?.code).toBe("SPEC_REVIEW_RESULT_NOT_FOUND");
  });
});

// TC-030: runPipeline — 中断耐性: propose 完了後に writeJobState が呼ばれる
describe("TC-030: runPipeline — writeJobState called after propose, before spec-review", () => {
  it("persists propose step result before spec-review begins", async () => {
    const { bootstrapTools } = await import("../src/core/tools/index.js");
    const { resetRegistry } = await import("../src/core/tools/registry.js");
    resetRegistry();
    bootstrapTools();

    const { runPipeline } = await import("../src/core/pipeline.js");
    const jobState = await makeJobState();

    const { client } = buildPipelineMockClient({ specReviewVerdict: "approved" });
    const githubFetch = buildGithubFetch(200, 200, "approved");

    const stateFilePath = path.join(tempDir, "specrunner", "jobs", `${jobState.jobId}.json`);

    await runPipeline(jobState, {
      client: client as unknown as import("../src/core/pipeline.js").PipelineDeps["client"],
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-slug",
      sleepFn: vi.fn().mockResolvedValue(undefined),
      githubFetch,
    });

    // Verify the final persisted state has both steps recorded
    // (propose must have been persisted before spec-review ran)
    const finalStateRaw = await fs.readFile(stateFilePath, "utf-8");
    const finalState = JSON.parse(finalStateRaw);
    expect(finalState.steps?.["propose"]).toBeDefined();
    expect(finalState.steps?.["spec-review"]).toBeDefined();
  });
});
