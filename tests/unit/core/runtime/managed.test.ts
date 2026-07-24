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

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "managed-runtime-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
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
    getSessionUsage: vi.fn().mockResolvedValue(undefined),
    listEvents: vi.fn().mockResolvedValue([]),
    sendEvents: vi.fn().mockResolvedValue(undefined),
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
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
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
  return { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", adr: false };
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

// Helper: create a minimal job state in memory (no I/O — D3 bootstrap is I/O-less)
async function makeJobStateForManaged(slug = "test-slug") {
  const { buildInitialJobState } = await import("../../../../src/store/job-state-store.js");
  return buildInitialJobState({
    request: {
      path: path.join(tempDir, "request.md"),
      title: "Test",
      type: "new-feature",
      slug,
    },
    repository: { owner: "testowner", name: "testrepo" },
  });
}

// Helper: read marker.json if it exists, else null
async function readMarker(slug: string): Promise<Record<string, unknown> | null> {
  const markerPath = path.join(tempDir, ".specrunner", "local", slug, "marker.json");
  try {
    const raw = await fs.readFile(markerPath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// TC-036: managed marker.json が D7 スキーマ・write/clear タイミングに準拠する
describe("TC-036: managed marker write/clear タイミングと D7 スキーマ準拠", () => {
  it("setupWorkspace (resume path, no branchName) が marker.json を書き込む", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const jobState = await makeJobStateForManaged("marker-test");
    const runtime = new ManagedRuntime(tempDir, sessionClient, githubClient, buildRepo(), undefined, "");

    // No branchName → resume path
    await runtime.setupWorkspace("marker-test", jobState.jobId);

    const marker = await readMarker("marker-test");
    expect(marker).not.toBeNull();
    expect(marker!["slug"]).toBe("marker-test");
    expect(marker!["jobId"]).toBe(jobState.jobId);
    // D5: marker is pure index — no status field
    expect(marker!["status"]).toBeUndefined();
    expect(typeof marker!["createdAt"]).toBe("string");
  });

  it("setupWorkspace (run path, with branchName) が marker.json を書き込む", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const { spawnFn } = buildManagedMockSpawnFn();
    const jobState = await makeJobStateForManaged("marker-run-test");
    const runtime = new ManagedRuntime(tempDir, sessionClient, githubClient, buildRepo(), spawnFn, "");

    await runtime.setupWorkspace("marker-run-test", jobState.jobId, {
      branchName: "feat/marker-run-test-abcd1234",
      bootstrapState: jobState, // D3: seed local/slug before updateJobState
    });

    const marker = await readMarker("marker-run-test");
    expect(marker).not.toBeNull();
    expect(marker!["slug"]).toBe("marker-run-test");
    expect(marker!["jobId"]).toBe(jobState.jobId);
    // D5: marker is pure index — no status field
    expect(marker!["status"]).toBeUndefined();
    expect(typeof marker!["createdAt"]).toBe("string");
  });

  it("teardown が終端ステータス(archived)で marker.json を削除する", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const jobState = await makeJobStateForManaged("teardown-clear-test");
    const runtime = new ManagedRuntime(tempDir, sessionClient, githubClient, buildRepo(), undefined, "");

    // Write marker first
    await runtime.setupWorkspace("teardown-clear-test", jobState.jobId);
    expect(await readMarker("teardown-clear-test")).not.toBeNull();

    // Register cleanup (stores slug in handle)
    const handle = runtime.registerCleanup(jobState.jobId, "design");

    // teardown with terminal status → clears marker
    await runtime.teardown(handle, "archived");
    expect(await readMarker("teardown-clear-test")).toBeNull();
  });

  it("teardown が終端ステータス(canceled)で marker.json を削除する", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const jobState = await makeJobStateForManaged("teardown-cancel-test");
    const runtime = new ManagedRuntime(tempDir, sessionClient, githubClient, buildRepo(), undefined, "");

    await runtime.setupWorkspace("teardown-cancel-test", jobState.jobId);
    const handle = runtime.registerCleanup(jobState.jobId, "design");

    await runtime.teardown(handle, "canceled");
    expect(await readMarker("teardown-cancel-test")).toBeNull();
  });

  it("teardown が非終端ステータス(awaiting-resume)では marker.json を保持する", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const jobState = await makeJobStateForManaged("teardown-keep-test");
    const runtime = new ManagedRuntime(tempDir, sessionClient, githubClient, buildRepo(), undefined, "");

    await runtime.setupWorkspace("teardown-keep-test", jobState.jobId);
    const handle = runtime.registerCleanup(jobState.jobId, "design");

    // Non-terminal status → marker is preserved
    await runtime.teardown(handle, "awaiting-resume");
    expect(await readMarker("teardown-keep-test")).not.toBeNull();
  });

  it("teardown が非終端ステータス(awaiting-archive)では marker.json を保持する", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const jobState = await makeJobStateForManaged("teardown-keep2-test");
    const runtime = new ManagedRuntime(tempDir, sessionClient, githubClient, buildRepo(), undefined, "");

    await runtime.setupWorkspace("teardown-keep2-test", jobState.jobId);
    const handle = runtime.registerCleanup(jobState.jobId, "design");

    await runtime.teardown(handle, "awaiting-archive");
    expect(await readMarker("teardown-keep2-test")).not.toBeNull();
  });
});

// TC-MR-006: ManagedRuntime.readRevisionContent
describe("TC-MR-006: ManagedRuntime.readRevisionContent", () => {
  it("branch=null → current is null, prior is null, no exception", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const runtime = new ManagedRuntime("/repo", sessionClient, githubClient, buildRepo(), undefined, "");

    const result = await runtime.readRevisionContent("src/foo.ts", "abc123", "/repo", null);

    expect(result.current).toBeNull();
    expect(result.prior).toBeNull();
    expect(githubClient.getRawFile).not.toHaveBeenCalled();
  });

  it("branch set + getRawFile succeeds → current=content, prior=null", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    githubClient.getRawFile.mockResolvedValue("file content\n");
    const runtime = new ManagedRuntime("/repo", sessionClient, githubClient, buildRepo(), undefined, "");

    const result = await runtime.readRevisionContent(
      "src/bar.ts",
      "def456",
      "/repo",
      "change/some-branch",
    );

    expect(result.current).toBe("file content\n");
    expect(result.prior).toBeNull();
    expect(githubClient.getRawFile).toHaveBeenCalledWith(
      "testowner",
      "testrepo",
      "change/some-branch",
      "src/bar.ts",
    );
  });

  it("branch set + getRawFile returns undefined → current=null", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    githubClient.getRawFile.mockResolvedValue(undefined);
    const runtime = new ManagedRuntime("/repo", sessionClient, githubClient, buildRepo(), undefined, "");

    const result = await runtime.readRevisionContent("src/baz.ts", "abc000", "/repo", "main");

    expect(result.current).toBeNull();
    expect(result.prior).toBeNull();
  });

  it("branch set + getRawFile throws → current=null, prior=null, no exception", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    githubClient.getRawFile.mockRejectedValue(new Error("network error"));
    const runtime = new ManagedRuntime("/repo", sessionClient, githubClient, buildRepo(), undefined, "");

    let result: { current: string | null; prior: string | null } | undefined;
    let threw = false;
    try {
      result = await runtime.readRevisionContent("src/qux.ts", "xyz999", "/repo", "feature-branch");
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result?.current).toBeNull();
    expect(result?.prior).toBeNull();
  });
});

// TC-MR-005: setupWorkspace writes rules.md to change folder via writeFile (string constant)
describe("TC-MR-005: setupWorkspace writes rules.md to change folder via string constant", () => {
  it("writes RULES_MD_CONTENT to change folder and stages it with git add", async () => {
    // Use flat-file draft path (not ending with /request.md) to avoid deleting tempDir
    await fs.writeFile(path.join(tempDir, "test-slug.md"), "# Test Request\n");

    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const { spawnFn, calls } = buildManagedMockSpawnFn();
    const runtime = new ManagedRuntime(tempDir, sessionClient, githubClient, buildRepo(), spawnFn, "");

    const jobState = await makeJobStateForManaged();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      requestFilePath: path.join(tempDir, "test-slug.md"),
      branchName: "feat/test-slug-abcd1234",
      bootstrapState: jobState, // D3: seed local/slug before updateJobState
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

  // TC-07: state.request.path is updated to the permanent change-folder path after setupWorkspace
  it("TC-07: updates state.request.path to <cwd>/specrunner/changes/<slug>/request.md", async () => {
    // Use flat-file draft path (not ending with /request.md) to avoid deleting tempDir
    await fs.writeFile(path.join(tempDir, "test-slug.md"), "# Test Request\n");

    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const { spawnFn } = buildManagedMockSpawnFn();
    const runtime = new ManagedRuntime(tempDir, sessionClient, githubClient, buildRepo(), spawnFn, "");

    const jobState = await makeJobStateForManaged();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      requestFilePath: path.join(tempDir, "test-slug.md"),
      branchName: "feat/test-slug-abcd1234",
      bootstrapState: jobState, // D3: seed local/slug before updateJobState
    });

    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    // Load from .specrunner/local/<slug>/ (managed machine-local store, D1)
    const finalState = await new JobStateStore(jobState.jobId, tempDir, {
      changeDir: path.join(tempDir, ".specrunner", "local", "test-slug"),
    }).load();
    const expectedPath = path.join(tempDir, "specrunner", "changes", "test-slug", "request.md");
    expect(finalState?.request.path).toBe(expectedPath);
  });
});
