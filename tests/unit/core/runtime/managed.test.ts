/**
 * Unit tests for ManagedRuntime.
 *
 * TC-MR-001: setupWorkspace returns { cwd } unchanged (no worktree creation)
 * TC-MR-002: createAgentRunner returns a ManagedAgentRunner
 * TC-MR-003: registerCleanup returns handle; teardown is no-op
 * TC-MR-004: buildDeps includes client and runner
 */
import { describe, it, expect, vi } from "vitest";
import { ManagedRuntime } from "../../../../src/core/runtime/managed.js";
import { ManagedAgentRunner } from "../../../../src/adapter/managed-agent/agent-runner.js";

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
