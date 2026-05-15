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

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-runtime-test-"));
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

function buildRepo() {
  return { owner: "testowner", name: "testrepo" };
}

function buildRequest() {
  return { type: "new-feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [] };
}

// Helper: build a spawnFn mock for LocalRuntime (covers fetch + rev-list calls in run path)
function buildMockSpawnFn(opts: {
  fetchExitCode?: number;
  fetchStderr?: string;
  behindCount?: number;
  behindExitCode?: number;
  commitExitCode?: number;
  commitStderr?: string;
} = {}) {
  const {
    fetchExitCode = 0,
    fetchStderr = "",
    behindCount = 0,
    behindExitCode = 0,
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
    // git rev-list HEAD..origin/main --count
    if (cmd === "git" && args[0] === "rev-list") {
      return { exitCode: behindExitCode, stdout: `${behindCount}\n`, stderr: "" };
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
function buildMockManager(opts: {
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
    const workspace = await runtime.setupWorkspace("test-slug", jobState.jobId, {});

    expect(createdPaths.length).toBe(1);
    expect(workspace.cwd).toBe(createdPaths[0]);
    expect(workspace.worktreePath).toBe(createdPaths[0]);
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
    await runtime.setupWorkspace("test-slug", jobState.jobId, {});

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
      runtime.setupWorkspace("test-slug", jobState.jobId, {}),
    ).rejects.toThrow("git fetch origin failed");
  });

  it("emits warning to stderr when local main is behind origin/main", async () => {
    const { manager } = buildMockManager();
    const { spawnFn } = buildMockSpawnFn({ behindCount: 3 });
    const githubClient = buildMockGitHubClient();
    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {});

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
    await runtime.setupWorkspace("test-slug", jobState.jobId, {});

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
    await runtime.setupWorkspace("test-slug", jobState.jobId, { existingWorktreePath: null });

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

    await runtime.teardown(handle, "awaiting-merge");
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
    await runtime.teardown(handle, "awaiting-merge");

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

    const deps = runtime.buildDeps(buildConfig(), buildRepo(), buildRequest(), "test-slug", workspace);

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

    // Create a real request.md file in tempDir
    const requestFile = path.join(tempDir, "request.md");
    await fs.writeFile(requestFile, "# Test Request\nslug: test-slug\n");

    const jobState = await makeJobState();
    await runtime.setupWorkspace("test-slug", jobState.jobId, {
      requestFilePath: requestFile,
      branchName: "feat/test-slug-abcd1234",
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

    const requestFile = path.join(tempDir, "request.md");
    await fs.writeFile(requestFile, "# Test Request\n");

    const jobState = await makeJobState();
    await expect(
      runtime.setupWorkspace("test-slug", jobState.jobId, {
        requestFilePath: requestFile,
        branchName: "feat/test-slug-abcd1234",
      }),
    ).rejects.toThrow("Failed to commit request file");
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

