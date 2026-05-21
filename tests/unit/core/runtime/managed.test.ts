/**
 * Unit tests for ManagedRuntime.
 *
 * TC-MR-001: setupWorkspace returns { cwd } unchanged (no worktree creation)
 * TC-MR-002: createAgentRunner returns a ManagedAgentRunner
 * TC-MR-003: registerCleanup returns handle; teardown is no-op
 * TC-MR-004: buildDeps includes client and runner
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { ManagedRuntime } from "../../../../src/core/runtime/managed.js";
import { ManagedAgentRunner } from "../../../../src/adapter/managed-agent/agent-runner.js";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "managed-runtime-test-"));
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
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function buildMockSessionClient() {
  return {
    createSession: vi.fn(),
    sendUserMessage: vi.fn(),
    pollUntilComplete: vi.fn(),
    streamEvents: vi.fn(),
  };
}

function buildMockGitHubClient() {
  return {
    verifyBranch: vi.fn(),
    verifyPath: vi.fn(),
    getRawFile: vi.fn(),
    verifyTokenScopes: vi.fn(),
    getRefSha: vi.fn(),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
  };
}

function buildConfig() {
  return {
    version: 1 as const,
    agents: {},
    environment: { id: "env_001", lastSyncedAt: "" },
  };
}

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

function buildRequest() {
  return { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [], adr: false };
}

// TC-MR-001: setupWorkspace is a no-op
describe("TC-MR-001: setupWorkspace returns cwd unchanged", () => {
  it("returns { cwd } without creating worktree", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const runtime = new ManagedRuntime("/repo", sessionClient, githubClient, buildRepo(), undefined, "");

    const workspace = await runtime.setupWorkspace("test-slug", "job-123");

    expect(workspace.cwd).toBe("/repo");
    expect(workspace.worktreePath).toBeUndefined();
  });
});

// TC-MR-002: createAgentRunner returns ManagedAgentRunner
describe("TC-MR-002: createAgentRunner returns ManagedAgentRunner", () => {
  it("returns an instance of ManagedAgentRunner", () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const runtime = new ManagedRuntime("/repo", sessionClient, githubClient, buildRepo(), undefined, "");

    const runner = runtime.createAgentRunner();

    expect(runner).toBeInstanceOf(ManagedAgentRunner);
  });
});

// TC-MR-003: registerCleanup adds signal handlers; teardown removes them
describe("TC-MR-003: registerCleanup adds signal handlers and teardown removes them", () => {
  it("registerCleanup increases SIGINT listener count; teardown restores it", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const runtime = new ManagedRuntime("/repo", sessionClient, githubClient, buildRepo(), undefined, "");

    const listenersBefore = process.listenerCount("SIGINT");
    const handle = runtime.registerCleanup("job-123", "design");
    const listenersAfterRegister = process.listenerCount("SIGINT");

    // Signal handler was added
    expect(listenersAfterRegister).toBe(listenersBefore + 1);

    // teardown removes signal handlers — no throws, count restored
    await expect(runtime.teardown(handle, "failed")).resolves.toBeUndefined();
    expect(process.listenerCount("SIGINT")).toBe(listenersBefore);
  });

  it("registerCleanup increases SIGTERM listener count; teardown restores it", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const runtime = new ManagedRuntime("/repo", sessionClient, githubClient, buildRepo(), undefined, "");

    const listenersBefore = process.listenerCount("SIGTERM");
    const handle = runtime.registerCleanup("job-123", "design");

    expect(process.listenerCount("SIGTERM")).toBe(listenersBefore + 1);

    await runtime.teardown(handle, "awaiting-resume");
    expect(process.listenerCount("SIGTERM")).toBe(listenersBefore);
  });
});

// TC-MR-004: buildDeps includes client and runner
describe("TC-MR-004: buildDeps includes sessionClient and ManagedAgentRunner", () => {
  it("returns PipelineDeps with client set and runner as ManagedAgentRunner", () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const runtime = new ManagedRuntime("/repo", sessionClient, githubClient, buildRepo(), undefined, "");

    const workspace = { cwd: "/repo" };
    const deps = runtime.buildDeps(buildConfig(), buildRequest(), "test-slug", workspace);

    expect(deps.client).toBe(sessionClient);
    expect(deps.runner).toBeInstanceOf(ManagedAgentRunner);
    expect(deps.cwd).toBe("/repo");
    expect(deps.githubClient).toBe(githubClient);
  });
});

// Helper: build a spawnFn mock for ManagedRuntime setupWorkspace with requestFilePath
function buildManagedMockSpawnFn() {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const fn = vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
    calls.push({ cmd, args: [...args] });
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  return { spawnFn: fn as unknown as import("../../../../src/util/spawn.js").SpawnFn, calls };
}

// Helper: create a minimal job state in tempDir (requires XDG_DATA_HOME = tempDir)
async function makeJobStateForManaged(slug = "test-slug") {
  const { createJobState } = await import("../../../../src/state/store.js");
  return createJobState({
    request: {
      path: path.join(tempDir, "request.md"),
      title: "Test",
      type: "new-feature",
      slug,
    },
    repository: { owner: "testowner", name: "testrepo" },
  });
}

// TC-MR-005: setupWorkspace writes rules.md to change folder via writeFile (string constant)
describe("TC-MR-005: setupWorkspace writes rules.md to change folder via string constant", () => {
  it("writes RULES_MD_CONTENT to change folder and stages it with git add", async () => {
    // Arrange: create request.md in tempDir (no specrunner/rules.md needed)
    await fs.writeFile(path.join(tempDir, "request.md"), "# Test Request\n");

    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const { spawnFn, calls } = buildManagedMockSpawnFn();
    const runtime = new ManagedRuntime(tempDir, sessionClient, githubClient, buildRepo(), spawnFn, "");

    const jobState = await makeJobStateForManaged();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      requestFilePath: path.join(tempDir, "request.md"),
      branchName: "feat/test-slug-abcd1234",
    });

    // Verify rules.md was written to the change folder
    const destPath = path.join(tempDir, "specrunner", "changes", "test-slug", "rules.md");
    await fs.access(destPath); // throws ENOENT if writeFile did not happen

    // Verify git add was called with the rules.md path
    const rulesAddCall = calls.find(
      (c) => c.cmd === "git" && c.args[0] === "add" && c.args.some((a) => a.includes("rules.md")),
    );
    expect(rulesAddCall).toBeDefined();
  });
});
