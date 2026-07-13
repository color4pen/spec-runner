/**
 * Unit tests for createRuntime factory.
 *
 * TC-RT-001: config.runtime === "local" → returns LocalRuntime
 * TC-RT-002: config.runtime !== "local" → returns ManagedRuntime
 * TC-RT-003: config.runtime === undefined → returns ManagedRuntime (default)
 */
import { describe, it, expect, vi } from "vitest";
import { LocalRuntime } from "../../../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../../../src/core/runtime/managed.js";

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

function buildLocalConfig() {
  return {
    version: 1 as const,
    runtime: "local" as const,
    agents: {},
  };
}

function buildManagedConfig() {
  return {
    version: 1 as const,
    agents: {},
    environment: { id: "env_001", lastSyncedAt: "" },
  };
}

function buildMockGithubClient() {
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

const repo = { owner: "testowner", name: "testrepo" };

// TC-RT-001: local runtime
describe("TC-RT-001: createRuntime returns LocalRuntime when runtime === 'local'", () => {
  it("returns an instance of LocalRuntime", async () => {
    const { createRuntime } = await import("../../../../src/core/runtime/factory.js");
    const githubClient = buildMockGithubClient();
    const runtime = createRuntime(buildLocalConfig(), "/repo", githubClient, repo, undefined, "");
    expect(runtime).toBeInstanceOf(LocalRuntime);
  });
});

// TC-RT-002: managed runtime (explicit)
describe("TC-RT-002: createRuntime returns ManagedRuntime when runtime !== 'local'", () => {
  it("returns an instance of ManagedRuntime for 'managed' runtime", async () => {
    const { createRuntime } = await import("../../../../src/core/runtime/factory.js");
    const githubClient = buildMockGithubClient();
    const config = { ...buildManagedConfig(), runtime: "managed" as const };
    const sessionClient = buildMockSessionClient();
    const runtime = createRuntime(config, "/repo", githubClient, repo, sessionClient, "");
    expect(runtime).toBeInstanceOf(ManagedRuntime);
  });
});

// TC-RT-003: managed runtime (default when runtime is undefined)
describe("TC-RT-003: createRuntime defaults to ManagedRuntime when runtime is undefined", () => {
  it("returns an instance of ManagedRuntime when config.runtime is undefined", async () => {
    const { createRuntime } = await import("../../../../src/core/runtime/factory.js");
    const githubClient = buildMockGithubClient();
    const config = buildManagedConfig(); // no runtime field
    const sessionClient = buildMockSessionClient();
    const runtime = createRuntime(config, "/repo", githubClient, repo, sessionClient, "");
    expect(runtime).toBeInstanceOf(ManagedRuntime);
  });
});

// TC-PA-FACTORY: power assertion is opt-in — the composition root injects the real spawnBackground
describe("TC-PA-FACTORY: createRuntime enables power assertion by injecting the real spawnBackground", () => {
  it("LocalRuntime.spawnBackgroundFn is the real spawnBackground, not the no-op default", async () => {
    const { createRuntime } = await import("../../../../src/core/runtime/factory.js");
    const { spawnBackground, noopSpawnBackground } = await import("../../../../src/util/spawn.js");
    const githubClient = buildMockGithubClient();
    const runtime = createRuntime(buildLocalConfig(), "/repo", githubClient, repo, undefined, "");
    // Access TypeScript-private field at runtime to verify factory wiring
    const injected = (runtime as unknown as { spawnBackgroundFn: unknown }).spawnBackgroundFn;
    expect(injected).toBe(spawnBackground);
    expect(injected).not.toBe(noopSpawnBackground);
  });
});

// TC-028: config.workspace.setup is wired to LocalRuntime.workspaceSetup
describe("TC-028: createRuntime wires config.workspace.setup to LocalRuntime.workspaceSetup", () => {
  it("LocalRuntime.workspaceSetup is set to config.workspace.setup value", async () => {
    const { createRuntime } = await import("../../../../src/core/runtime/factory.js");
    const githubClient = buildMockGithubClient();
    const config = {
      ...buildLocalConfig(),
      workspace: { setup: ["uv sync"] },
    };
    const runtime = createRuntime(config, "/repo", githubClient, repo, undefined, "");
    expect(runtime).toBeInstanceOf(LocalRuntime);
    // Access TypeScript-private field at runtime to verify factory wiring
    expect((runtime as unknown as { workspaceSetup: unknown }).workspaceSetup).toEqual(["uv sync"]);
  });

  it("LocalRuntime.workspaceSetup is undefined when workspace.setup is not configured", async () => {
    const { createRuntime } = await import("../../../../src/core/runtime/factory.js");
    const githubClient = buildMockGithubClient();
    const runtime = createRuntime(buildLocalConfig(), "/repo", githubClient, repo, undefined, "");
    expect(runtime).toBeInstanceOf(LocalRuntime);
    expect((runtime as unknown as { workspaceSetup: unknown }).workspaceSetup).toBeUndefined();
  });
});
