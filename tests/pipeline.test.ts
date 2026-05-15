import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { SessionClient } from "../src/core/port/session-client.js";
import type { GitHubClient } from "../src/core/port/github-client.js";
import { createManagedAgentRunner } from "../src/adapter/managed-agent/agent-runner.js";

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

/**
 * Build a mock SessionClient that simulates the propose step SSE flow.
 *
 * The SessionClient port is what StepExecutor uses in runProposeStyleStep.
 * streamEvents() is the atomic "connect SSE + send initial message + process events" call.
 *
 * Note: register_branch tool removed (D4). Branch is pre-set by CLI before agent runs.
 */
function buildMockSessionClient(opts: {
  /** @deprecated kept for backward compat — no longer triggers onBranchRegistered */
  registerBranch?: string;
  terminateSession?: boolean; // if set, streamEvents resolves with terminated=true
  sessionId?: string;
}): {
  client: SessionClient;
  createSessionMock: ReturnType<typeof vi.fn>;
  streamEventsMock: ReturnType<typeof vi.fn>;
} {
  const sessionId = opts.sessionId ?? "sess_test001";

  const createSessionMock = vi.fn().mockResolvedValue({ sessionId });

  let streamEventsMock: ReturnType<typeof vi.fn>;

  if (opts.terminateSession) {
    streamEventsMock = vi.fn().mockResolvedValue({
      sseDisconnected: false,
      idleEndTurnDetected: false,
      terminated: true,
      terminationReason: "terminated",
    });
  } else {
    // Normal end_turn — branch is pre-set by CLI (no register_branch call needed)
    streamEventsMock = vi.fn().mockImplementation(
      (_sessionId: string, streamOpts: { requestContent?: string }) => {
        void streamOpts; // capture for tests that inspect it
        return Promise.resolve({
          sseDisconnected: false,
          idleEndTurnDetected: true,
          terminated: false,
          terminationReason: "end_turn" as const,
        });
      },
    );
  }

  const client: SessionClient = {
    createSession: createSessionMock,
    sendUserMessage: vi.fn().mockResolvedValue(undefined),
    pollUntilComplete: vi.fn().mockResolvedValue({ status: "idle" }),
    streamEvents: streamEventsMock as SessionClient["streamEvents"],
  };

  return { client, createSessionMock, streamEventsMock };
}

/**
 * Build a mock GitHubClient (port interface) for propose-step tests.
 *
 * - branchFound=true → verifyBranch resolves true (200)
 * - branchFound=false → verifyBranch resolves false (404 — warning only)
 * - tokenExpired=true → verifyBranch throws GITHUB_TOKEN_EXPIRED
 * - folderFound=true → getRawFile resolves non-null (folder exists)
 * - folderFound=false → getRawFile resolves null (404 → CHANGE_FOLDER_NOT_FOUND)
 */
function buildMockGithubClient(opts: {
  branchFound?: boolean;
  folderFound?: boolean;
  tokenExpired?: boolean;
} = {}): GitHubClient {
  const { branchFound = true, folderFound = true, tokenExpired = false } = opts;

  return {
    verifyBranch: vi.fn().mockImplementation(async () => {
      if (tokenExpired) {
        throw Object.assign(new Error("GitHub token expired."), { code: "GITHUB_TOKEN_EXPIRED" });
      }
      return branchFound;
    }),
    verifyPath: vi.fn().mockImplementation(async () => {
      if (tokenExpired) {
        throw Object.assign(new Error("GitHub token expired."), { code: "GITHUB_TOKEN_EXPIRED" });
      }
      return folderFound;
    }),
    getRawFile: vi.fn().mockResolvedValue(null),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
  };
}

function buildConfig() {
  return {
    version: 1 as const,
    agents: {
      design: { agentId: "agent_001", definitionHash: "sha256:abc", lastSyncedAt: new Date().toISOString() },
      "spec-review": { agentId: "agent_spec_review", definitionHash: "sha256:ghi", lastSyncedAt: new Date().toISOString() },
      "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: "sha256:def", lastSyncedAt: new Date().toISOString() },
    },
    environment: { id: "env_001", lastSyncedAt: new Date().toISOString() },
    github: { accessToken: "ghp_test", tokenObtainedAt: new Date().toISOString(), scopes: ["repo"] },
  };
}

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

function buildRequest() {
  return { type: "new-feature", title: "Test Request", slug: "test-request", baseBranch: "main", content: "Please implement this.", enabled: [] };
}

/**
 * Build a ManagedAgentRunner from client + githubClient for injection into PipelineDeps.runner.
 * Required after Task 2.1: PipelineDeps.runner replaces runtime branching in pipeline/run.ts.
 */
function buildRunner(client: SessionClient, githubClient: GitHubClient) {
  return createManagedAgentRunner({ sessionClient: client, githubClient, repo: buildRepo() });
}

// TC-035: propose パイプライン — 正常完了（状態遷移の全記録）
describe("TC-035: propose pipeline — normal completion with full history", () => {
  it("records all required history steps on success", async () => {

    const { runDesignPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();
    // Pre-set branch as CLI would (D3: branch set before pipeline runs)
    jobState.branch = "feat/2026-04-27-test";

    const { client } = buildMockSessionClient({ registerBranch: "feat/2026-04-27-test" });
    const githubClient = buildMockGithubClient({ branchFound: true, folderFound: true });

    const result = await runDesignPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "2026-04-27-cli-core-pipeline",
      githubClient,
      runner: buildRunner(client, githubClient),
    });

    expect(result.status).toBe("awaiting-merge");

    const steps = result.history.map((h) => h.step);
    // Executor adds step-start and step-complete entries (design D3 mitigation)
    expect(steps).toContain("design-started");
    expect(steps).toContain("design-verdict");
    // branch is pre-set by CLI before propose runs (D3)
    expect(result.branch).toBe("feat/2026-04-27-test");
  });
});

// TC-036: propose パイプライン — pre-set branch used (register_branch removed in D4)
describe("TC-036: propose pipeline — pre-set branch from CLI is used (D4)", () => {
  it("uses state.branch pre-set by CLI even when streamEvents returns end_turn without tool call", async () => {

    const { runDesignPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();
    // Pre-set branch as CLI would (D4: branch is always set by CLI before propose)
    jobState.branch = "feat/test-cli-branch-d4";

    const { client } = buildMockSessionClient({});
    const githubClient = buildMockGithubClient({ branchFound: true, folderFound: true });

    const result = await runDesignPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "test-cli-branch-d4",
      githubClient,
      runner: buildRunner(client, githubClient),
    });

    // With branch pre-set, propose should succeed
    expect(result.branch).toBe("feat/test-cli-branch-d4");
    expect(result.status).toBe("awaiting-merge");
  });
});

// TC-037: propose パイプライン — SSE 接続は初回メッセージ送信の前に確立される
describe("TC-037: propose pipeline — SSE stream connected before initial message send", () => {
  it("streamEvents() is called (which internally ensures stream-before-send ordering)", async () => {

    const { runDesignPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();
    jobState.branch = "feat/test"; // pre-set by CLI (D3)

    const { client, streamEventsMock } = buildMockSessionClient({ registerBranch: "feat/test" });
    const githubClient = buildMockGithubClient();

    await runDesignPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "2026-04-27-test",
      githubClient,
      runner: buildRunner(client, githubClient),
    });

    // streamEvents() was called — the SessionClient port guarantees SSE is connected
    // before the initial message is sent (ordering is encapsulated in the adapter)
    expect(streamEventsMock).toHaveBeenCalledTimes(1);
  });
});

// TC-038: propose パイプライン — 初回メッセージに user-request タグが含まれる
describe("TC-038: propose pipeline — initial message contains user-request tag", () => {
  it("streamEvents receives requestContent containing the user request text", async () => {

    const { runDesignPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();
    jobState.branch = "feat/test"; // pre-set by CLI (D3)

    let capturedRequestContent: string | undefined;

    const { client } = buildMockSessionClient({ registerBranch: "feat/test" });
    // Override streamEvents to capture requestContent
    (client.streamEvents as ReturnType<typeof vi.fn>).mockImplementation(
      (_sessionId: string, streamOpts: { requestContent?: string }) => {
        capturedRequestContent = streamOpts.requestContent;
        return Promise.resolve({
          sseDisconnected: false,
          idleEndTurnDetected: true,
          terminated: false,
          terminationReason: "end_turn" as const,
        });
      },
    );

    const githubClient = buildMockGithubClient();
    await runDesignPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "2026-04-27-test",
      githubClient,
      runner: buildRunner(client, githubClient),
      // Use tempDir as cwd: no specrunner/project.md exists there, so
      // projectContext is undefined and requestContent equals the raw request text.
      cwd: tempDir,
    });

    // With cwd set to tempDir (no specrunner/project.md), requestContent is the raw
    // request content without any <project-context> append.
    expect(capturedRequestContent).toBe("Please implement this.");
  });
});

// TC-039: propose パイプライン — CHANGE_FOLDER_NOT_FOUND で失敗
describe("TC-039: propose pipeline — CHANGE_FOLDER_NOT_FOUND", () => {
  it("fails with CHANGE_FOLDER_NOT_FOUND when change folder API returns 404", async () => {

    const { runDesignPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();
    jobState.branch = "feat/test"; // pre-set by CLI (D3)

    const { client } = buildMockSessionClient({ registerBranch: "feat/test" });
    // branch OK, but change folder 404 (folderFound=false)
    const githubClient = buildMockGithubClient({ branchFound: true, folderFound: false });

    // Pipeline returns failed state rather than throwing; check state.error.code
    const result = await runDesignPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "2026-04-27-test",
      githubClient,
      runner: buildRunner(client, githubClient),
    });

    expect(result.status).toBe("awaiting-resume");
    expect(result.error?.code).toBe("CHANGE_FOLDER_NOT_FOUND");
  });
});

// TC-040: propose パイプライン — branch が GitHub に存在しない（warning のみ）
describe("TC-040: propose pipeline — branch not found on GitHub is warning only", () => {
  it("succeeds with warning when branch API returns 404 but folder API returns 200", async () => {

    const { runDesignPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();
    jobState.branch = "feat/test"; // pre-set by CLI (D3)

    const { client } = buildMockSessionClient({ registerBranch: "feat/test" });
    // branch not found (warning), folder found (OK)
    const githubClient = buildMockGithubClient({ branchFound: false, folderFound: true });

    const result = await runDesignPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "2026-04-27-test",
      githubClient,
      runner: buildRunner(client, githubClient),
    });

    expect(result.status).toBe("awaiting-merge");
    // Branch verification warning is logged to stderr (no longer a history entry)
    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    const combined = stderrCalls.map((c: unknown[]) => String(c[0])).join("\n");
    // The warning message uses the effectiveBranch from ctx.branch or state.branch
    const hasWarning = combined.includes("not found on GitHub yet.");
    expect(hasWarning).toBe(true);
  });
});

// TC-041: propose パイプライン — GitHub API 401 で GITHUB_TOKEN_EXPIRED
describe("TC-041: propose pipeline — GITHUB_TOKEN_EXPIRED on 401", () => {
  it("fails with GITHUB_TOKEN_EXPIRED when GitHub API returns 401", async () => {

    const { runDesignPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();
    jobState.branch = "feat/test"; // pre-set by CLI (D3)

    const { client } = buildMockSessionClient({ registerBranch: "feat/test" });
    // 401 from GitHub — token expired
    const githubClient = buildMockGithubClient({ tokenExpired: true });

    // Pipeline returns failed state rather than throwing; check state.error.code
    const result = await runDesignPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "2026-04-27-test",
      githubClient,
      runner: buildRunner(client, githubClient),
    });

    expect(result.status).toBe("awaiting-resume");
    expect(result.error?.code).toBe("GITHUB_TOKEN_EXPIRED");

    const stderrCalls = (process.stderr.write as ReturnType<typeof vi.fn>).mock.calls;
    const combined = stderrCalls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(combined).toContain("GitHub token expired. Run 'specrunner login' again.");
  });
});

// TC-042: セッション作成パラメータの検証
describe("TC-042: session creation parameters", () => {
  it("createSession is called with agentId, environmentId, repoUrl, and githubToken", async () => {

    const { runDesignPipeline } = await import("../src/core/pipeline/index.js");
    const jobState = await makeJobState();

    jobState.branch = "feat/test"; // pre-set by CLI (D3)
    const { client, createSessionMock } = buildMockSessionClient({ registerBranch: "feat/test" });
    const githubClient = buildMockGithubClient();

    await runDesignPipeline(jobState, {
      client,
      config: buildConfig(),
      repo: buildRepo(),
      request: buildRequest(),
      slug: "2026-04-27-test",
      githubClient,
      runner: buildRunner(client, githubClient),
    });

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    const createCall = createSessionMock.mock.calls[0]![0] as {
      agentId: string;
      environmentId: string;
      repoUrl: string;
      githubToken: string;
    };
    expect(createCall.agentId).toBeDefined();
    expect(createCall.environmentId).toBe("env_001");
    expect(createCall.repoUrl).toContain("github.com/testowner/testrepo");
    expect(createCall.githubToken).toBe("ghp_test");
  });
});
