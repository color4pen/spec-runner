/**
 * Unit tests for LocalRuntime.
 *
 * TC-LR-001: setupWorkspace(run) creates worktree + copies request.md + git add
 * TC-LR-002: setupWorkspace(resume/reuse) reuses existing worktree
 * TC-LR-003: setupWorkspace(resume/recreate) creates new worktree when existing is gone
 * TC-LR-004: setupWorkspace(resume/null) creates new worktree when none recorded
 * TC-LR-005: registerCleanup returns CleanupHandle; teardown deregisters signal handlers
 * TC-LR-006: teardown calls cleanupWorktreeOnFailure on non-success status
 * TC-LR-007: buildDeps assembles PipelineDeps correctly
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalRuntime } from "../../../../src/core/runtime/local.js";
import type { QueryFn } from "../../../../src/adapter/claude-code/agent-runner.js";
import { buildInitialJobState } from "../../../../src/store/job-state-store.js";
import { makeStoreFactory } from "../../../helpers/store-factory.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-runtime-test-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.restoreAllMocks();
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

function buildConfig() {
  return {
    version: 1 as const,
    runtime: "local" as const,
    agents: {},
    pipeline: { maxRetries: 2 },
  };
}

function buildRequest() {
  return { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", adr: false };
}

// Helper: build a spawnFn mock for LocalRuntime (covers fetch + rev-list calls in run path)
function buildMockSpawnFn(opts: {
  fetchExitCode?: number;
  fetchStderr?: string;
  behindCount?: number;
  behindExitCode?: number;
  aheadCount?: number;
  aheadExitCode?: number;
  commitExitCode?: number;
  commitStderr?: string;
} = {}) {
  const {
    fetchExitCode = 0,
    fetchStderr = "",
    behindCount = 0,
    behindExitCode = 0,
    aheadCount = 0,
    aheadExitCode = 0,
    commitExitCode = 0,
    commitStderr = "",
  } = opts;

  const calls: Array<{ cmd: string; args: string[] }> = [];

  const fn = vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
    calls.push({ cmd, args: [...args] });
    // git fetch origin
    if (cmd === "git" && args[0] === "fetch") {
      return { exitCode: fetchExitCode, stdout: "", stderr: fetchStderr };
    }
    // git rev-list dispatch: behind = HEAD..<remote>, ahead = <remote>..<local>
    if (cmd === "git" && args[0] === "rev-list") {
      const range = args[1] ?? "";
      if (range.startsWith("HEAD..")) {
        // behind: HEAD..origin/<base>
        return { exitCode: behindExitCode, stdout: `${behindCount}\n`, stderr: "" };
      }
      if (range.startsWith("origin/")) {
        // ahead: origin/<base>..<base>
        return { exitCode: aheadExitCode, stdout: `${aheadCount}\n`, stderr: "" };
      }
      // fallback
      return { exitCode: 0, stdout: "0\n", stderr: "" };
    }
    // git add (request file staging)
    if (cmd === "git" && args[0] === "add") {
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    // git commit
    if (cmd === "git" && args[0] === "commit") {
      return { exitCode: commitExitCode, stdout: "", stderr: commitStderr };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  });

  return { spawnFn: fn as unknown as import("../../../../src/util/spawn.js").SpawnFn, calls };
}

// Helper: create a mock WorktreeManager
function buildMockManager(_opts: {
  worktreeExistsOnCreate?: boolean;
} = {}) {
  const createdPaths: string[] = [];
  const removedPaths: string[] = [];
  const prunedPaths: string[] = [];

  return {
    manager: {
      create: vi.fn().mockImplementation(async (_cwd: string, slug: string, jobId: string) => {
        const p = path.join(tempDir, `worktree-${slug}-${jobId.slice(0, 8)}`);
        await fs.mkdir(p, { recursive: true });
        createdPaths.push(p);
        return p;
      }),
      remove: vi.fn().mockImplementation(async (p: string) => {
        removedPaths.push(p);
      }),
      prune: vi.fn().mockImplementation(async (p: string) => {
        prunedPaths.push(p);
      }),
    },
    createdPaths,
    removedPaths,
    prunedPaths,
  };
}

// Helper: create a minimal job state
async function makeJobState(slug = "test-slug") {
  const state = buildInitialJobState({
    request: {
      path: path.join(tempDir, "request.md"),
      title: "Test",
      type: "new-feature",
      slug,
    },
    repository: { owner: "testowner", name: "testrepo" },
  });
  await makeStoreFactory(tempDir)(state.jobId).persist(state);
  return state;
}

// TC-LR-001: setupWorkspace(run) — new worktree creation (no requestFilePath)
describe("TC-LR-001: setupWorkspace creates worktree for run command", () => {
  it("creates worktree and returns workspace with cwd = worktreePath", async () => {
    const { manager, createdPaths } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();

    // Call setupWorkspace without requestFilePath (no git add needed)
    // The git add behavior is tested in run-worktree-git-staging.test.ts
    const workspace = await runtime.setupWorkspace("test-slug", jobState.jobId, { bootstrapState: jobState });

    expect(createdPaths.length).toBe(1);
    expect(workspace.cwd).toBe(createdPaths[0]);
    expect(workspace.worktreePath).toBe(createdPaths[0]);
  });

  // TC-020: slug state.json must not contain machine-local fields
  it("TC-020: slug state.json does not contain worktreePath, pid, or session fields", async () => {
    const { manager, createdPaths } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn();
    const githubClient = buildMockGitHubClient();
    const slug = "test-slug";
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState(slug);
    await runtime.setupWorkspace(slug, jobState.jobId, {
      bootstrapState: jobState,
    });

    const worktreePath = createdPaths[0]!;
    const { slugStateJsonPath } = await import("../../../../src/util/paths.js");
    const stateFilePath = path.join(worktreePath, slugStateJsonPath(slug));
    const raw = await fs.readFile(stateFilePath, "utf-8");
    const written = JSON.parse(raw) as Record<string, unknown>;

    expect(Object.keys(written)).not.toContain("worktreePath");
    expect(Object.keys(written)).not.toContain("pid");
    expect(Object.keys(written)).not.toContain("session");
  });
});

// TC-LR-008: setupWorkspace(run) — calls fetch + passes origin/main as baseRef
describe("TC-LR-008: setupWorkspace run path calls git fetch origin and uses origin/main as baseRef", () => {
  it("calls git fetch origin before manager.create, and passes origin/main as baseRef", async () => {
    const { manager, createdPaths } = buildMockManager();
    const { spawnFn, calls } = buildMockSpawnFn({ behindCount: 0 });
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, { bootstrapState: jobState });

    // git fetch origin was called
    const fetchCall = calls.find((c) => c.cmd === "git" && c.args[0] === "fetch");
    expect(fetchCall).toBeDefined();
    expect(fetchCall?.args).toContain("origin");

    // manager.create was called with "origin/main" as baseRef
    expect(createdPaths.length).toBe(1);
    const createMock = manager.create as ReturnType<typeof vi.fn>;
    const createCall = createMock.mock.calls[0];
    expect(createCall?.[3]).toBe("origin/main");
  });

  it("throws when git fetch origin fails", async () => {
    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn({ fetchExitCode: 1, fetchStderr: "network unreachable" });
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await expect(
      runtime.setupWorkspace("test-slug", jobState.jobId, { bootstrapState: jobState }),
    ).rejects.toThrow("git fetch origin failed");
  });

  it("emits warning to stderr when local main is behind origin/main", async () => {
    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn({ behindCount: 3 });
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, { bootstrapState: jobState });

    // stderr.write was spied in beforeEach; check it was called with behind warning
    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const warningCalls = stderrMock.mock.calls as [string][];
    const hasWarning = warningCalls.some(([msg]) =>
      typeof msg === "string" && msg.includes("behind origin/main"),
    );
    expect(hasWarning).toBe(true);
  });

  it("does NOT emit warning when local main is up-to-date", async () => {
    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn({ behindCount: 0 });
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, { bootstrapState: jobState });

    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const warningCalls = stderrMock.mock.calls as [string][];
    const hasBehindWarning = warningCalls.some(([msg]) =>
      typeof msg === "string" && msg.includes("behind origin/main"),
    );
    expect(hasBehindWarning).toBe(false);
  });

  it("resume paths (existingWorktreePath=null) do NOT call git fetch origin", async () => {
    const { manager } = buildMockManager();
    const { spawnFn, calls } = buildMockSpawnFn();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, { existingWorktreePath: null, bootstrapState: jobState });

    const fetchCalls = calls.filter((c) => c.cmd === "git" && c.args[0] === "fetch");
    expect(fetchCalls).toHaveLength(0);
  });
});

// TC-LR-002: setupWorkspace(resume/reuse) — reuses existing worktree
describe("TC-LR-002: setupWorkspace reuses existing worktree", () => {
  it("returns existing worktree path when it exists on disk", async () => {
    const { manager, createdPaths } = buildMockManager();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager });

    const jobState = await makeJobState();

    // Create an "existing" worktree directory
    const existingPath = path.join(tempDir, "existing-worktree");
    await fs.mkdir(existingPath, { recursive: true });

    const workspace = await runtime.setupWorkspace("test-slug", jobState.jobId, {
      existingWorktreePath: existingPath,
    });

    // Should reuse — no new worktree created
    expect(createdPaths.length).toBe(0);
    expect(workspace.cwd).toBe(existingPath);
    expect(workspace.worktreePath).toBe(existingPath);
  });

  // TC-019: resume-reuse refreshes sidecar pid to current process
  it("TC-019: refreshes liveness.json pid to process.pid after worktree reuse", async () => {
    const { manager } = buildMockManager();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager });

    const slug = "test-slug";
    const jobState = await makeJobState(slug);

    // Create an existing worktree directory
    const existingPath = path.join(tempDir, "existing-worktree");
    await fs.mkdir(existingPath, { recursive: true });

    // Write a stale liveness sidecar with a different pid
    const sidecarDir = path.join(tempDir, ".specrunner", "local", slug);
    await fs.mkdir(sidecarDir, { recursive: true });
    await fs.writeFile(
      path.join(sidecarDir, "liveness.json"),
      JSON.stringify({ pid: 99999, session: null, worktreePath: existingPath, jobId: jobState.jobId }),
      "utf-8",
    );

    await runtime.setupWorkspace(slug, jobState.jobId, {
      existingWorktreePath: existingPath,
    });

    // Liveness sidecar pid must now equal the current process pid
    const raw = await fs.readFile(path.join(sidecarDir, "liveness.json"), "utf-8");
    const sidecar = JSON.parse(raw) as { pid: number };
    expect(sidecar.pid).toBe(process.pid);
  });
});

// TC-LR-003: setupWorkspace(resume/recreate) — creates new when existing is gone
describe("TC-LR-003: setupWorkspace recreates worktree when existing is missing", () => {
  it("creates new worktree when existingWorktreePath does not exist on disk", async () => {
    const { manager, createdPaths } = buildMockManager();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager });

    const jobState = await makeJobState();

    const workspace = await runtime.setupWorkspace("test-slug", jobState.jobId, {
      existingWorktreePath: "/nonexistent/path",
      bootstrapState: jobState,
    });

    // Should create new worktree
    expect(createdPaths.length).toBe(1);
    expect(workspace.cwd).toBe(createdPaths[0]);
  });
});

// TC-LR-004: setupWorkspace(resume/null) — creates new when no worktree recorded
describe("TC-LR-004: setupWorkspace creates new worktree when existingWorktreePath is null", () => {
  it("creates new worktree when existingWorktreePath is null", async () => {
    const { manager, createdPaths } = buildMockManager();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager });

    const jobState = await makeJobState();

    const workspace = await runtime.setupWorkspace("test-slug", jobState.jobId, {
      existingWorktreePath: null,
      bootstrapState: jobState,
    });

    expect(createdPaths.length).toBe(1);
    expect(workspace.cwd).toBe(createdPaths[0]);
  });
});

// TC-LR-005: registerCleanup / teardown signal handler lifecycle
describe("TC-LR-005: registerCleanup registers and teardown deregisters signal handlers", () => {
  it("signal handler is registered and can be deregistered via teardown", async () => {
    const { manager } = buildMockManager();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager });

    const jobState = await makeJobState();
    const worktreePath = path.join(tempDir, "worktree");
    await fs.mkdir(worktreePath);

    // Set up workspace first so teardown has a handle
    await runtime.setupWorkspace("test-slug", jobState.jobId, { existingWorktreePath: worktreePath });

    const listenersBefore = process.listenerCount("SIGINT");
    const handle = runtime.registerCleanup(jobState.jobId, "design");
    const listenersAfterRegister = process.listenerCount("SIGINT");
    expect(listenersAfterRegister).toBe(listenersBefore + 1);

    await runtime.teardown(handle, "awaiting-archive");
    const listenersAfterTeardown = process.listenerCount("SIGINT");
    expect(listenersAfterTeardown).toBe(listenersBefore);
  });
});

// TC-LR-006: teardown calls cleanup on non-awaiting-merge status
describe("TC-LR-006: teardown calls cleanupWorktreeOnFailure on failure status", () => {
  it("calls manager.remove and prune when status is not awaiting-merge", async () => {
    const { manager, removedPaths, prunedPaths } = buildMockManager();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager });

    const jobState = await makeJobState();

    const worktreePath = path.join(tempDir, "worktree");
    await fs.mkdir(worktreePath);
    await runtime.setupWorkspace("test-slug", jobState.jobId, { existingWorktreePath: worktreePath });

    const handle = runtime.registerCleanup(jobState.jobId, "design");
    await runtime.teardown(handle, "failed");

    // On failure, worktree should be cleaned up
    expect(removedPaths.length).toBe(1);
    expect(prunedPaths.length).toBe(1);
  });

  it("does NOT call cleanup when status is awaiting-merge", async () => {
    const { manager, removedPaths } = buildMockManager();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager });

    const jobState = await makeJobState();

    const worktreePath = path.join(tempDir, "worktree");
    await fs.mkdir(worktreePath);
    await runtime.setupWorkspace("test-slug", jobState.jobId, { existingWorktreePath: worktreePath });

    const handle = runtime.registerCleanup(jobState.jobId, "design");
    await runtime.teardown(handle, "awaiting-archive");

    // Success: worktree kept for finish command
    expect(removedPaths.length).toBe(0);
  });
});

// TC-LR-007: buildDeps assembles PipelineDeps correctly
describe("TC-LR-007: buildDeps returns correct PipelineDeps", () => {
  it("returns PipelineDeps with runner, cwd, and no client", async () => {
    const { manager } = buildMockManager();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager });

    const jobState = await makeJobState();
    const worktreePath = path.join(tempDir, "worktree");
    await fs.mkdir(worktreePath);
    const workspace = await runtime.setupWorkspace("test-slug", jobState.jobId, {
      existingWorktreePath: worktreePath,
    });

    const deps = runtime.buildDeps(buildConfig(), buildRequest(), "test-slug", workspace);

    expect(deps.client).toBeUndefined();
    expect(deps.runner).toBeDefined();
    expect(deps.cwd).toBe(workspace.cwd);
    expect(deps.githubClient).toBe(githubClient);
    expect(deps.slug).toBe("test-slug");
  });
});

// TC-LR-009: setupWorkspace(run) passes branchName to manager.create()
describe("TC-LR-009: setupWorkspace run path passes branchName to manager.create()", () => {
  it("passes branchName to manager.create() when branchName is in opts", async () => {
    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      branchName: "feat/test-slug-abcd1234",
      bootstrapState: jobState,
    });

    const createMock = manager.create as ReturnType<typeof vi.fn>;
    const createCall = createMock.mock.calls[0];
    // branchName is the 5th argument (index 4)
    expect(createCall?.[4]).toBe("feat/test-slug-abcd1234");
  });

  it("passes undefined branchName to manager.create() when branchName is absent (resume path compat)", async () => {
    const { manager } = buildMockManager();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager });

    const jobState = await makeJobState();
    const existingPath = path.join(tempDir, "existing-worktree");
    await fs.mkdir(existingPath, { recursive: true });

    // Resume path — no branchName
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      existingWorktreePath: existingPath,
    });

    // manager.create should NOT have been called in resume path
    const createMock = manager.create as ReturnType<typeof vi.fn>;
    expect(createMock.mock.calls.length).toBe(0);
  });

  it("workspace.branch is set when branchName is provided", async () => {
    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    const workspace = await runtime.setupWorkspace("test-slug", jobState.jobId, {
      branchName: "feat/test-slug-abcd1234",
      bootstrapState: jobState,
    });

    expect(workspace.branch).toBe("feat/test-slug-abcd1234");
  });
});

// TC-LR-011: Named options constructor
describe("TC-LR-011: Named options constructor", () => {
  it("accepts named options object", () => {
    const githubClient = buildMockGitHubClient();
    const { manager } = buildMockManager();
    // Should not throw
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager });
    expect(runtime).toBeDefined();
  });

});

// TC-LR-012: query() method
describe("TC-LR-012: query() yields messages from queryFn", () => {
  it("yields messages from the injected queryFn", async () => {
    const githubClient = buildMockGitHubClient();

    // Build a mock queryFn that yields two messages
    const mockMessages = [
      { type: "text", content: "hello" },
      { type: "result", subtype: "success", result: "# My Request\n\n## Meta\n\n- **type**: new-feature\n- **slug**: my-request\n" },
    ];

    async function* mockQueryFn(_params: unknown) {
      for (const msg of mockMessages) {
        yield msg;
      }
    }

    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient,
      queryFn: mockQueryFn as unknown as import("../../../../src/adapter/claude-code/agent-runner.js").QueryFn,
    });

    const results: unknown[] = [];
    for await (const msg of runtime.query("test prompt")) {
      results.push(msg);
    }

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ type: "text", content: "hello" });
    expect(results[1]).toEqual({ type: "result", subtype: "success", result: expect.any(String) });
  });

  it("passes systemPrompt and model from QueryOptions to queryFn", async () => {
    const githubClient = buildMockGitHubClient();

    let capturedOptions: Record<string, unknown> | undefined;

    async function* mockQueryFn(params: { prompt: string; options?: Record<string, unknown> }) {
      capturedOptions = params.options;
      yield { type: "result", subtype: "success", result: "" };
    }

    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient,
      queryFn: mockQueryFn as unknown as import("../../../../src/adapter/claude-code/agent-runner.js").QueryFn,
    });

    for await (const _msg of runtime.query("test", {
      systemPrompt: "You are helpful",
      model: "sonnet",
      allowedTools: ["Read"],
    })) {
      // consume
    }

    expect(capturedOptions?.["systemPrompt"]).toBe("You are helpful");
    expect(capturedOptions?.["model"]).toBe("sonnet");
    expect(capturedOptions?.["allowedTools"]).toEqual(["Read"]);
    expect(capturedOptions?.["permissionMode"]).toBe("bypassPermissions");
  });
});

// TC-LR-010: setupWorkspace(run) commits request.md when requestFilePath is provided
describe("TC-LR-010: setupWorkspace run path commits request.md", () => {
  it("calls git commit after git add when requestFilePath is provided", async () => {
    const { manager } = buildMockManager();
    const { spawnFn, calls } = buildMockSpawnFn();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    // Use flat-file draft path (not ending with /request.md) to avoid deleting tempDir
    const requestFile = path.join(tempDir, "test-slug.md");
    await fs.writeFile(requestFile, "# Test Request\nslug: test-slug\n");

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      requestFilePath: requestFile,
      branchName: "feat/test-slug-abcd1234",
      bootstrapState: jobState,
    });

    // git add should be called
    const addCall = calls.find((c) => c.cmd === "git" && c.args[0] === "add");
    expect(addCall).toBeDefined();

    // git commit should be called after git add
    const commitCall = calls.find((c) => c.cmd === "git" && c.args[0] === "commit");
    expect(commitCall).toBeDefined();
    expect(commitCall?.args).toContain("-m");
    expect(commitCall?.args.join(" ")).toContain("test-slug");
  });

  it("throws when git commit fails", async () => {
    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn({ commitExitCode: 1, commitStderr: "nothing to commit" });
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    // Use flat-file draft path (not ending with /request.md) to avoid deleting tempDir
    const requestFile = path.join(tempDir, "test-slug.md");
    await fs.writeFile(requestFile, "# Test Request\n");

    const jobState = await makeJobState();
    await expect(
      runtime.setupWorkspace("test-slug", jobState.jobId, {
        requestFilePath: requestFile,
        branchName: "feat/test-slug-abcd1234",
        bootstrapState: jobState,
      }),
    ).rejects.toThrow("Failed to commit request file");
  });

  // TC-06: state.request.path is updated to the permanent change-folder path after setupWorkspace
  it("TC-06: updates state.request.path to <worktreePath>/specrunner/changes/<slug>/request.md", async () => {
    const { manager, createdPaths } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    // Use flat-file draft path (not ending with /request.md) to avoid deleting tempDir
    const requestFile = path.join(tempDir, "test-slug.md");
    await fs.writeFile(requestFile, "# Test Request\nslug: test-slug\n");

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      requestFilePath: requestFile,
      branchName: "feat/test-slug-abcd1234",
      bootstrapState: jobState,
    });

    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    // State is written to the slug store (in worktree), not the jobId store
    const finalState = await new JobStateStore(jobState.jobId, tempDir, {
      slug: "test-slug",
      stateRoot: createdPaths[0]!,
    }).load();
    const expectedPath = path.join(createdPaths[0]!, "specrunner", "changes", "test-slug", "request.md");
    expect(finalState?.request.path).toBe(expectedPath);
  });
});

// TC-LR-014: setupWorkspace(run) writes rules.md to change folder via writeFile (string constant)
describe("TC-LR-014: setupWorkspace writes rules.md to change folder via string constant", () => {
  it("writes RULES_MD_CONTENT to change folder and stages it with git add", async () => {
    const createdPaths: string[] = [];
    const manager = {
      create: vi.fn().mockImplementation(async (_cwd: string, slug: string, jobId: string) => {
        const p = path.join(tempDir, `worktree-${slug}-${jobId.slice(0, 8)}`);
        await fs.mkdir(p, { recursive: true });
        createdPaths.push(p);
        return p;
      }),
      remove: vi.fn(),
      prune: vi.fn(),
    };

    const { spawnFn, calls } = buildMockSpawnFn();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    // Use flat-file draft path (not ending with /request.md) to avoid deleting tempDir
    const requestFile = path.join(tempDir, "test-slug.md");
    await fs.writeFile(requestFile, "# Test Request\nslug: test-slug\n");

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      requestFilePath: requestFile,
      branchName: "feat/test-slug-abcd1234",
      bootstrapState: jobState,
    });

    // Verify rules.md was written to the change folder
    const worktreePath = createdPaths[0]!;
    const destPath = path.join(worktreePath, "specrunner", "changes", "test-slug", "rules.md");
    await fs.access(destPath); // throws ENOENT if writeFile did not happen

    // Verify git add was called with the rules.md path
    const rulesAddCall = calls.find(
      (c) => c.cmd === "git" && c.args[0] === "add" && c.args.some((a) => a.includes("rules.md")),
    );
    expect(rulesAddCall).toBeDefined();
  });
});

// TC-LR-015: signal handler records the in-progress step (not the launch step)
describe("TC-LR-015: signalCleanup records in-progress step in resumePoint", () => {
  it("persists resumePoint.step = current.step (code-review), not startStep (design)", async () => {
    const { manager, createdPaths } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    // Create a job state and bootstrap it into the worktree slug store via setupWorkspace
    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, { bootstrapState: jobState });
    const worktreePath = createdPaths[0]!;

    // Update slug store to reflect in-progress step "code-review"
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    const slugStore = new JobStateStore(jobState.jobId, tempDir, { slug: "test-slug", stateRoot: worktreePath });
    const current = await slugStore.load();
    await slugStore.persist({ ...current, step: "code-review", status: "running" } as import("../../../../src/state/schema.js").JobState);

    // Stub process.exit so it doesn't actually exit
    const originalExit = process.exit;
    (process as { exit: (code?: number) => void }).exit = vi.fn();

    // Capture the SIGINT listener added by registerCleanup
    const listenersBefore = process.listeners("SIGINT");
    runtime.registerCleanup(jobState.jobId, "design");
    const listenersAfter = process.listeners("SIGINT");
    const newListeners = listenersAfter.filter((l) => !listenersBefore.includes(l));
    const listener = newListeners[newListeners.length - 1] as () => Promise<void>;

    try {
      // Invoke the signal handler and wait for it to complete
      await listener();

      // Load from slug store and assert
      const finalState = await slugStore.load();
      expect(finalState?.status).toBe("awaiting-resume");
      expect(finalState?.resumePoint?.step).toBe("code-review");
      expect(finalState?.resumePoint?.step).not.toBe("design");
    } finally {
      // Restore and deregister
      (process as { exit: (code?: number) => void }).exit = originalExit;
      process.off("SIGINT", listener);
    }
  });
});

// TC-LR-016: setupWorkspace(resume/reuse) updates liveness sidecar pid
describe("TC-LR-016: setupWorkspace reuse path updates liveness sidecar pid", () => {
  it("overwrites stale pid in liveness.json with process.pid", async () => {
    const { manager } = buildMockManager();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager });

    const jobState = await makeJobState("test-slug");

    const existingPath = path.join(tempDir, "existing-worktree");
    await fs.mkdir(existingPath, { recursive: true });

    // Write a stale liveness.json with an old pid
    const sidecarDir = path.join(tempDir, ".specrunner", "local", "test-slug");
    await fs.mkdir(sidecarDir, { recursive: true });
    const sidecarPath = path.join(sidecarDir, "liveness.json");
    await fs.writeFile(
      sidecarPath,
      JSON.stringify({ pid: 999999, session: null, worktreePath: existingPath, jobId: jobState.jobId }, null, 2),
      "utf-8",
    );

    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      existingWorktreePath: existingPath,
    });

    const sidecar = JSON.parse(await fs.readFile(sidecarPath, "utf-8"));
    expect(sidecar.pid).toBe(process.pid);
  });

  it("preserves worktreePath and jobId in liveness.json after reuse", async () => {
    const { manager } = buildMockManager();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager });

    const jobState = await makeJobState("test-slug");

    const existingPath = path.join(tempDir, "existing-worktree");
    await fs.mkdir(existingPath, { recursive: true });

    // Write a stale liveness.json
    const sidecarDir = path.join(tempDir, ".specrunner", "local", "test-slug");
    await fs.mkdir(sidecarDir, { recursive: true });
    const sidecarPath = path.join(sidecarDir, "liveness.json");
    await fs.writeFile(
      sidecarPath,
      JSON.stringify({ pid: 999999, session: null, worktreePath: existingPath, jobId: jobState.jobId }, null, 2),
      "utf-8",
    );

    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      existingWorktreePath: existingPath,
    });

    const sidecar = JSON.parse(await fs.readFile(sidecarPath, "utf-8"));
    expect(sidecar.worktreePath).toBe(existingPath);
    expect(sidecar.jobId).toBe(jobState.jobId);
  });

  it("creates liveness.json with process.pid when no prior sidecar exists", async () => {
    const { manager } = buildMockManager();
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager });

    const jobState = await makeJobState("test-slug");

    const existingPath = path.join(tempDir, "existing-worktree");
    await fs.mkdir(existingPath, { recursive: true });

    // No prior sidecar — directory does not exist
    const workspace = await runtime.setupWorkspace("test-slug", jobState.jobId, {
      existingWorktreePath: existingPath,
    });

    // workspace returned without throwing
    expect(workspace.worktreePath).toBe(existingPath);

    const sidecarPath = path.join(tempDir, ".specrunner", "local", "test-slug", "liveness.json");
    const sidecar = JSON.parse(await fs.readFile(sidecarPath, "utf-8"));
    expect(sidecar.pid).toBe(process.pid);
  });
});

// TC-025: workspaceSetup injected → commands plan is passed to manager.create
describe("TC-025: workspaceSetup 注入時に manager.create の末尾引数が commands plan になる", () => {
  it("passes { kind: 'commands' } plan as last arg to manager.create when workspaceSetup is set", async () => {
    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn();
    const githubClient = buildMockGitHubClient();

    // LocalRuntime with workspaceSetup injected
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient,
      manager,
      spawnFn,
      workspaceSetup: [{ run: "uv sync" }],
    });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, { bootstrapState: jobState });

    const createMock = manager.create as ReturnType<typeof vi.fn>;
    const createCall = createMock.mock.calls[0];
    // The 6th argument (index 5) is the plan
    expect(createCall?.[5]).toEqual({ kind: "commands", commands: [{ run: "uv sync" }] });
  });
});

// TC-026: workspaceSetup not injected + JS traces present → detect-install plan
describe("TC-026: workspaceSetup 未注入かつ JS 痕跡ありで detect-install plan が manager.create に渡る", () => {
  it("passes { kind: 'detect-install' } plan when no workspaceSetup and bun.lock exists in cwd", async () => {
    // Create a bun.lock file in tempDir to simulate JS traces
    await fs.writeFile(path.join(tempDir, "bun.lock"), "", "utf-8");

    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn();
    const githubClient = buildMockGitHubClient();

    // LocalRuntime WITHOUT workspaceSetup
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient,
      manager,
      spawnFn,
      // workspaceSetup intentionally not set
    });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, { bootstrapState: jobState });

    const createMock = manager.create as ReturnType<typeof vi.fn>;
    const createCall = createMock.mock.calls[0];
    // The 6th argument (index 5) is the plan
    expect(createCall?.[5]).toEqual({ kind: "detect-install" });
  });
});

// TC-LR-017: setupWorkspace(run) ahead-warning when designLayer enabled
describe("TC-LR-017: setupWorkspace ahead-warning when designLayerEnabled and local is ahead of origin", () => {
  it("emits ahead warning to stderr when designLayerEnabled=true and aheadCount > 0", async () => {
    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn({ aheadCount: 2 });
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      bootstrapState: jobState,
      designLayerEnabled: true,
    });

    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const warningCalls = stderrMock.mock.calls as [string][];
    const hasWarning = warningCalls.some(([msg]) =>
      typeof msg === "string" && msg.includes("ahead of origin/main"),
    );
    expect(hasWarning).toBe(true);
  });

  it("warning includes push instruction when designLayerEnabled=true and aheadCount > 0", async () => {
    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn({ aheadCount: 1 });
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      bootstrapState: jobState,
      designLayerEnabled: true,
    });

    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const warningCalls = stderrMock.mock.calls as [string][];
    const allText = warningCalls.map(([msg]) => (typeof msg === "string" ? msg : "")).join("\n");
    expect(allText).toContain("git push origin main");
  });

  it("does NOT emit ahead warning when designLayerEnabled is not provided (undefined)", async () => {
    const { manager } = buildMockManager();
    const { spawnFn, calls } = buildMockSpawnFn({ aheadCount: 5 });
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, { bootstrapState: jobState });

    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const warningCalls = stderrMock.mock.calls as [string][];
    const hasAheadWarning = warningCalls.some(([msg]) =>
      typeof msg === "string" && msg.includes("ahead of origin/main"),
    );
    expect(hasAheadWarning).toBe(false);

    // ahead rev-list should not have been spawned
    const aheadRevList = calls.filter(
      (c) => c.cmd === "git" && c.args[0] === "rev-list" && (c.args[1] ?? "").startsWith("origin/"),
    );
    expect(aheadRevList).toHaveLength(0);
  });

  it("does NOT emit ahead warning when designLayerEnabled=false", async () => {
    const { manager } = buildMockManager();
    const { spawnFn, calls } = buildMockSpawnFn({ aheadCount: 3 });
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      bootstrapState: jobState,
      designLayerEnabled: false,
    });

    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const warningCalls = stderrMock.mock.calls as [string][];
    const hasAheadWarning = warningCalls.some(([msg]) =>
      typeof msg === "string" && msg.includes("ahead of origin/main"),
    );
    expect(hasAheadWarning).toBe(false);

    // ahead rev-list should not have been spawned
    const aheadRevList = calls.filter(
      (c) => c.cmd === "git" && c.args[0] === "rev-list" && (c.args[1] ?? "").startsWith("origin/"),
    );
    expect(aheadRevList).toHaveLength(0);
  });

  it("does NOT emit ahead warning when designLayerEnabled=true but aheadCount=0", async () => {
    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn({ aheadCount: 0 });
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      bootstrapState: jobState,
      designLayerEnabled: true,
    });

    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const warningCalls = stderrMock.mock.calls as [string][];
    const hasAheadWarning = warningCalls.some(([msg]) =>
      typeof msg === "string" && msg.includes("ahead of origin/main"),
    );
    expect(hasAheadWarning).toBe(false);
  });

  it("does NOT emit ahead warning when designLayerEnabled=true but ahead rev-list exits non-zero", async () => {
    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn({ aheadCount: 5, aheadExitCode: 1 });
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      bootstrapState: jobState,
      designLayerEnabled: true,
    });

    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const warningCalls = stderrMock.mock.calls as [string][];
    const hasAheadWarning = warningCalls.some(([msg]) =>
      typeof msg === "string" && msg.includes("ahead of origin/main"),
    );
    expect(hasAheadWarning).toBe(false);
  });

  it("TC-008: emits BOTH behind-warning and ahead-warning when diverged (behindCount > 0 and aheadCount > 0)", async () => {
    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn({ behindCount: 1, aheadCount: 2 });
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      bootstrapState: jobState,
      designLayerEnabled: true,
    });

    const stderrMock = process.stderr.write as ReturnType<typeof vi.fn>;
    const warningCalls = stderrMock.mock.calls as [string][];
    const allText = warningCalls.map(([msg]) => (typeof msg === "string" ? msg : "")).join("\n");

    // Both warnings must appear independently in the diverged scenario.
    expect(allText).toContain("behind origin/main");
    expect(allText).toContain("ahead of origin/main");
  });
});

// TC-LR-013: query() passthrough of session fields
describe("TC-LR-013: query() passthroughs sessionId/continue/resume/includePartialMessages to SDK", () => {
  it("passes sessionId, continue, resume, includePartialMessages to queryFn options", async () => {
    const githubClient = buildMockGitHubClient();
    let capturedOptions: Record<string, unknown> | undefined;

    async function* mockQueryFn(params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
      capturedOptions = params.options;
      yield { type: "result", subtype: "success", result: "" };
    }

    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient,
      queryFn: mockQueryFn as unknown as QueryFn,
    });

    for await (const _msg of runtime.query("test", {
      sessionId: "test-session-id",
      continue: true,
      resume: "resume-session-id",
      includePartialMessages: true,
    })) {
      // consume
    }

    expect(capturedOptions?.["sessionId"]).toBe("test-session-id");
    expect(capturedOptions?.["continue"]).toBe(true);
    expect(capturedOptions?.["resume"]).toBe("resume-session-id");
    expect(capturedOptions?.["includePartialMessages"]).toBe(true);
  });

  it("does not include undefined session fields in options", async () => {
    const githubClient = buildMockGitHubClient();
    let capturedOptions: Record<string, unknown> | undefined;

    async function* mockQueryFn(params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
      capturedOptions = params.options;
      yield { type: "result", subtype: "success", result: "" };
    }

    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient,
      queryFn: mockQueryFn as unknown as QueryFn,
    });

    for await (const _msg of runtime.query("test")) {
      // consume
    }

    // Session fields must not be present (not even as undefined)
    expect(Object.keys(capturedOptions ?? {})).not.toContain("sessionId");
    expect(Object.keys(capturedOptions ?? {})).not.toContain("continue");
    expect(Object.keys(capturedOptions ?? {})).not.toContain("resume");
    expect(Object.keys(capturedOptions ?? {})).not.toContain("includePartialMessages");
  });
});

// TC-LR-020: commitFinalState uses messageLabel derived from state.status
describe("TC-LR-020: commitFinalState uses messageLabel derived from state.status", () => {
  it("uses 'checkpoint: <slug>' when state.status === 'awaiting-resume'", async () => {
    const { manager } = buildMockManager();
    const githubClient = buildMockGitHubClient();

    const calls: Array<{ cmd: string; args: string[] }> = [];
    const spawnFn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      calls.push({ cmd: _cmd, args: [...args] });
      if (args[0] === "add") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" }; // staged changes present
      if (args[0] === "commit") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "push") return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as import("../../../../src/util/spawn.js").SpawnFn;

    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState("my-slug");
    const deps = { slug: "my-slug", cwd: tempDir } as import("../../../../src/core/types.js").PipelineDeps;
    const state = { ...jobState, status: "awaiting-resume" as const, branch: "feat/my-slug-abc" };

    await runtime.commitFinalState(deps, state);

    const commitCall = calls.find((c) => c.cmd === "git" && c.args[0] === "commit");
    expect(commitCall).toBeDefined();
    expect(commitCall!.args.join(" ")).toContain("checkpoint: my-slug");
    expect(commitCall!.args.join(" ")).not.toContain("finalize:");
  });

  it("uses 'finalize: <slug>' when state.status !== 'awaiting-resume'", async () => {
    const { manager } = buildMockManager();
    const githubClient = buildMockGitHubClient();

    const calls: Array<{ cmd: string; args: string[] }> = [];
    const spawnFn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      calls.push({ cmd: _cmd, args: [...args] });
      if (args[0] === "add") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "diff") return { exitCode: 1, stdout: "", stderr: "" }; // staged changes present
      if (args[0] === "commit") return { exitCode: 0, stdout: "", stderr: "" };
      if (args[0] === "push") return { exitCode: 0, stdout: "", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as import("../../../../src/util/spawn.js").SpawnFn;

    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState("my-slug");
    const deps = { slug: "my-slug", cwd: tempDir } as import("../../../../src/core/types.js").PipelineDeps;
    const state = { ...jobState, status: "awaiting-archive" as const, branch: "feat/my-slug-abc" };

    await runtime.commitFinalState(deps, state);

    const commitCall = calls.find((c) => c.cmd === "git" && c.args[0] === "commit");
    expect(commitCall).toBeDefined();
    expect(commitCall!.args.join(" ")).toContain("finalize: my-slug");
    expect(commitCall!.args.join(" ")).not.toContain("checkpoint:");
  });
});

