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
