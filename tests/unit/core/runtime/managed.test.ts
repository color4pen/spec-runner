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
  };
}

function buildConfig() {
  return {
    version: 1 as const,
    anthropic: { apiKey: "sk-ant-test" },
    agents: {},
    github: { accessToken: "ghp_test", tokenObtainedAt: "", scopes: ["repo"] },
    environment: { id: "env_001", lastSyncedAt: "" },
  };
}

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

function buildRequest() {
  return { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [] };
}

// TC-MR-001: setupWorkspace is a no-op
describe("TC-MR-001: setupWorkspace returns cwd unchanged", () => {
  it("returns { cwd } without creating worktree", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const runtime = new ManagedRuntime("/repo", sessionClient, githubClient, buildRepo());

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
    const runtime = new ManagedRuntime("/repo", sessionClient, githubClient, buildRepo());

    const runner = runtime.createAgentRunner();

    expect(runner).toBeInstanceOf(ManagedAgentRunner);
  });
});

// TC-MR-003: registerCleanup / teardown are no-ops
describe("TC-MR-003: registerCleanup and teardown are no-ops", () => {
  it("registerCleanup returns a handle and teardown does nothing", async () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const runtime = new ManagedRuntime("/repo", sessionClient, githubClient, buildRepo());

    const listenersBefore = process.listenerCount("SIGINT");
    const handle = runtime.registerCleanup("job-123", "propose");
    const listenersAfterRegister = process.listenerCount("SIGINT");

    // No signal handlers added
    expect(listenersAfterRegister).toBe(listenersBefore);

    // teardown is a no-op — no throws
    await expect(runtime.teardown(handle, "failed")).resolves.toBeUndefined();
  });
});

// TC-MR-004: buildDeps includes client and runner
describe("TC-MR-004: buildDeps includes sessionClient and ManagedAgentRunner", () => {
  it("returns PipelineDeps with client set and runner as ManagedAgentRunner", () => {
    const sessionClient = buildMockSessionClient();
    const githubClient = buildMockGitHubClient();
    const runtime = new ManagedRuntime("/repo", sessionClient, githubClient, buildRepo());

    const workspace = { cwd: "/repo" };
    const deps = runtime.buildDeps(buildConfig(), buildRepo(), buildRequest(), "test-slug", workspace);

    expect(deps.client).toBe(sessionClient);
    expect(deps.runner).toBeInstanceOf(ManagedAgentRunner);
    expect(deps.cwd).toBe("/repo");
    expect(deps.githubClient).toBe(githubClient);
  });
});
