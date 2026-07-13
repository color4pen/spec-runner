/**
 * Lifecycle-binding tests: power assertion acquire/release across LocalRuntime
 * registerCleanup, teardown (success/error), and signalCleanup paths.
 *
 * TC-LPA-01: acquire — spawnBackgroundFn called once with caffeinate + correct args.
 * TC-LPA-02: release on success — teardown("awaiting-archive") calls handle.kill().
 * TC-LPA-03: release on error — teardown("failed") calls handle.kill().
 * TC-LPA-04: release on signal — signalCleanup() calls handle.kill().
 * TC-LPA-05: fail-open linux — registerCleanup + teardown complete without spawn/throw.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalRuntime } from "../../../../src/core/runtime/local.js";
import { JobStateStore, buildInitialJobState } from "../../../../src/store/job-state-store.js";
import type { SpawnBackgroundFn, BackgroundProcessHandle } from "../../../../src/util/spawn.js";
import {
  resetSignalHandlerFiredForTest,
} from "../../../../src/core/lifecycle/signal-state.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-pa-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  resetSignalHandlerFiredForTest();
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
  resetSignalHandlerFiredForTest();
});

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

function buildMockManager(tempDir: string) {
  return {
    create: vi.fn().mockImplementation(async (_cwd: string, slug: string, jobId: string) => {
      const p = path.join(tempDir, `worktree-${slug}-${jobId.slice(0, 8)}`);
      await fs.mkdir(p, { recursive: true });
      return p;
    }),
    remove: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Build an injectable spawnBackgroundFn that records calls and returns a fake
 * handle with a kill spy.
 */
function buildSpawnBackgroundFn() {
  const killSpy = vi.fn();
  const calls: Array<{ cmd: string; args: string[]; cwd: string }> = [];

  const fakeHandle: BackgroundProcessHandle = {
    pid: 42000,
    kill: killSpy,
  };

  const spawnBackgroundFn: SpawnBackgroundFn = (cmd, args, opts) => {
    calls.push({ cmd, args: [...args], cwd: opts.cwd });
    return fakeHandle;
  };

  return { spawnBackgroundFn, calls, killSpy, fakeHandle };
}

async function makeJobState(slug = "pa-test-slug") {
  const state = buildInitialJobState({
    request: {
      path: path.join(tempDir, "request.md"),
      title: "Power Assertion Test",
      type: "new-feature",
      slug,
    },
    repository: { owner: "testowner", name: "testrepo" },
  });
  // Persist to slug store via a helper
  const slugDir = path.join(tempDir, `worktree-${slug}-${state.jobId.slice(0, 8)}`);
  await fs.mkdir(slugDir, { recursive: true });
  await new JobStateStore(state.jobId, tempDir, { slug, stateRoot: slugDir }).persist(state);
  return { state, slugDir };
}

// ─── TC-LPA-01: acquire ───────────────────────────────────────────────────────

describe("TC-LPA-01: registerCleanup acquires power assertion (darwin)", () => {
  it("spawnBackgroundFn called once with caffeinate, ['-i', '-w', String(process.pid)]", async () => {
    const { spawnBackgroundFn, calls } = buildSpawnBackgroundFn();
    const manager = buildMockManager(tempDir);
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      manager,
      platform: "darwin",
      spawnBackgroundFn,
    });

    const { state, slugDir } = await makeJobState();

    // Set up workspace via the existing worktree path
    await runtime.setupWorkspace("pa-test-slug", state.jobId, {
      existingWorktreePath: slugDir,
    });

    runtime.registerCleanup(state.jobId, "implementer");

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.cmd).toBe("caffeinate");
    expect(call.args).toEqual(["-i", "-w", String(process.pid)]);
  });
});

// ─── TC-LPA-02: release on success ───────────────────────────────────────────

describe("TC-LPA-02: teardown('awaiting-archive') releases power assertion", () => {
  it("handle.kill() is called after teardown on success path", async () => {
    const { spawnBackgroundFn, killSpy } = buildSpawnBackgroundFn();
    const manager = buildMockManager(tempDir);
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      manager,
      platform: "darwin",
      spawnBackgroundFn,
    });

    const { state, slugDir } = await makeJobState();
    await runtime.setupWorkspace("pa-test-slug", state.jobId, {
      existingWorktreePath: slugDir,
    });

    const handle = runtime.registerCleanup(state.jobId, "implementer");
    await runtime.teardown(handle, "awaiting-archive");

    expect(killSpy).toHaveBeenCalledOnce();
  });
});

// ─── TC-LPA-03: release on error ─────────────────────────────────────────────

describe("TC-LPA-03: teardown('failed') releases power assertion", () => {
  it("handle.kill() is called after teardown on failure path", async () => {
    const { spawnBackgroundFn, killSpy } = buildSpawnBackgroundFn();
    const manager = buildMockManager(tempDir);
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      manager,
      platform: "darwin",
      spawnBackgroundFn,
    });

    const { state, slugDir } = await makeJobState();
    await runtime.setupWorkspace("pa-test-slug", state.jobId, {
      existingWorktreePath: slugDir,
    });

    const handle = runtime.registerCleanup(state.jobId, "implementer");

    // Stub the job state load so cleanupWorktreeOnFailure doesn't throw
    vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue({
      version: 2,
      jobId: state.jobId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      request: { path: "/req.md", type: "new-feature", title: "test", slug: "pa-test-slug" },
      repository: { owner: "test", name: "test" },
      session: null,
      step: "implementer",
      status: "failed",
      pid: null,
      branch: null,
      history: [],
      error: null,
      steps: {},
    } as unknown as import("../../../../src/store/job-state-store.js").NormalizedJobState);

    vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);

    await runtime.teardown(handle, "failed");

    expect(killSpy).toHaveBeenCalledOnce();
  });
});

// ─── TC-LPA-04: release on signal ────────────────────────────────────────────

describe("TC-LPA-04: signalCleanup() releases power assertion", () => {
  it("handle.kill() is called when signalCleanup is invoked", async () => {
    const { spawnBackgroundFn, killSpy } = buildSpawnBackgroundFn();
    const manager = buildMockManager(tempDir);
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      manager,
      platform: "darwin",
      spawnBackgroundFn,
    });

    const { state, slugDir } = await makeJobState();
    await runtime.setupWorkspace("pa-test-slug", state.jobId, {
      existingWorktreePath: slugDir,
    });

    const handle = runtime.registerCleanup(state.jobId, "implementer");

    // Extract signalCleanup from handle internals
    const internals = handle as unknown as {
      signalCleanup: () => Promise<void>;
    };

    // Stub store operations to prevent real I/O
    vi.spyOn(JobStateStore.prototype, "load").mockResolvedValue({
      version: 2,
      jobId: state.jobId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      request: { path: "/req.md", type: "new-feature", title: "test", slug: "pa-test-slug" },
      repository: { owner: "test", name: "test" },
      session: null,
      step: "implementer",
      status: "running",
      pid: null,
      branch: null,
      history: [],
      error: null,
      steps: {},
    } as unknown as import("../../../../src/store/job-state-store.js").NormalizedJobState);

    vi.spyOn(JobStateStore.prototype, "appendInterruption").mockResolvedValue(undefined);
    vi.spyOn(JobStateStore.prototype, "persist").mockResolvedValue(undefined);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await internals.signalCleanup();

    expect(killSpy).toHaveBeenCalledOnce();

    // Clean up
    process.off("SIGINT", internals.signalCleanup);
    process.off("SIGTERM", internals.signalCleanup);
  });
});

// ─── TC-LPA-05: fail-open linux ──────────────────────────────────────────────

describe("TC-LPA-05: platform=linux — no spawn, no throw (fail-open)", () => {
  it("registerCleanup and teardown complete without spawning on non-darwin", async () => {
    const spawnBackgroundFn = vi.fn() as unknown as SpawnBackgroundFn;
    const manager = buildMockManager(tempDir);
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      manager,
      platform: "linux",
      spawnBackgroundFn,
    });

    const { state, slugDir } = await makeJobState("pa-linux-slug");
    await runtime.setupWorkspace("pa-linux-slug", state.jobId, {
      existingWorktreePath: slugDir,
    });

    const handle = runtime.registerCleanup(state.jobId, "implementer");

    // Must not have spawned anything
    expect(spawnBackgroundFn).not.toHaveBeenCalled();

    // teardown must not throw
    await expect(runtime.teardown(handle, "awaiting-archive")).resolves.toBeUndefined();
  });
});
