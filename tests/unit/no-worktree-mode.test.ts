/**
 * Tests for --no-worktree mode implementation.
 *
 * TC-NW-001: state schema — noWorktree field is preserved in validateJobState
 * TC-NW-002: state schema — missing noWorktree passes validateJobState as undefined
 * TC-NW-003: errors — worktreeDirtyError returns correct code and hint
 * TC-NW-004: LocalRuntime.setupWorkspace no-worktree run — no worktree create, git checkout -b
 * TC-NW-005: LocalRuntime.setupWorkspace no-worktree resume — no worktree create, no branch op
 * TC-NW-006: LocalRuntime.setupWorkspace no-worktree — dirty working tree throws WORKTREE_DIRTY
 * TC-NW-007: LocalRuntime.setupWorkspace no-worktree — sidecar has worktreePath: null
 * TC-NW-008: LocalRuntime.buildDeps — storeFactory uses cwd when worktreePath absent
 * TC-NW-010: exit-guard no-worktree — transitions running job via cwd-based store
 * TC-NW-011: exit-guard no-worktree — non-running job not affected
 * TC-NW-012: ResumeCommand.prepare() no-worktree — sidecar absent, running transition written to cwd
 * TC-NW-013: exit-guard → awaiting-resume → ResumeCommand.prepare() resolves resumePoint
 * TC-NW-014: CLI flag parse — --no-worktree accepted
 * TC-NW-016: stateToStateJson slug-mode — noWorktree preserved, machine-local fields stripped
 */

// loadConfig mock must be defined before any imports that transitively reach config/store.
vi.mock("../../src/config/store.js", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    version: 1,
    runtime: "local",
    pipeline: { maxRetries: 2 },
    agents: {},
  }),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// TC-NW-001, TC-NW-002: state schema
// ---------------------------------------------------------------------------

import { validateJobState } from "../../src/state/schema.js";
import type { JobState } from "../../src/state/schema.js";

function makeMinimalRawState(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "init",
    status: "running",
    branch: null,
    history: [],
    error: null,
    ...extra,
  };
}

describe("TC-NW-001: noWorktree field preserved in validateJobState", () => {
  it("noWorktree: true passes validation and is preserved", () => {
    const raw = makeMinimalRawState({ noWorktree: true });
    const state = validateJobState(raw) as JobState;
    expect(state.noWorktree).toBe(true);
  });

  it("noWorktree: false passes validation and is preserved", () => {
    const raw = makeMinimalRawState({ noWorktree: false });
    const state = validateJobState(raw) as JobState;
    expect(state.noWorktree).toBe(false);
  });
});

describe("TC-NW-002: noWorktree field absent — backward compat", () => {
  it("noWorktree absent → passes validateJobState and is undefined", () => {
    const raw = makeMinimalRawState();
    const state = validateJobState(raw) as JobState;
    expect(state.noWorktree).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-NW-003: worktreeDirtyError
// ---------------------------------------------------------------------------

import { worktreeDirtyError, ERROR_CODES } from "../../src/errors.js";

describe("TC-NW-003: worktreeDirtyError factory", () => {
  it("returns SpecRunnerError with code WORKTREE_DIRTY", () => {
    const err = worktreeDirtyError("M src/foo.ts");
    expect(err.code).toBe(ERROR_CODES.WORKTREE_DIRTY);
    expect(err.code).toBe("WORKTREE_DIRTY");
    expect(err.message).toContain("M src/foo.ts");
    expect(err.hint).toContain("--no-worktree");
    expect(err.hint).toContain("Commit or stash");
  });
});

// ---------------------------------------------------------------------------
// TC-NW-004 to TC-NW-008: LocalRuntime.setupWorkspace no-worktree
// ---------------------------------------------------------------------------

import { LocalRuntime } from "../../src/core/runtime/local.js";
import { buildInitialJobState, JobStateStore } from "../../src/store/job-state-store.js";
import type { SpawnFn } from "../../src/util/spawn.js";
import { livenessJsonPath } from "../../src/util/paths.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "no-worktree-test-"));
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
  };
}

function buildMockManager() {
  return {
    create: vi.fn().mockResolvedValue("/fake/worktree"),
    remove: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Build a spawnFn stub for no-worktree mode.
 */
function buildNoWorktreeSpawnFn(opts: { dirty?: boolean; checkoutExitCode?: number } = {}): SpawnFn {
  const dirty = opts.dirty ?? false;
  const checkoutExitCode = opts.checkoutExitCode ?? 0;
  return vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
    if (cmd === "git" && args[0] === "status" && args[1] === "--porcelain") {
      return { exitCode: 0, stdout: dirty ? " M src/foo.ts\n" : "", stderr: "" };
    }
    if (cmd === "git" && args[0] === "checkout" && args[1] === "-b") {
      return { exitCode: checkoutExitCode, stdout: "", stderr: checkoutExitCode !== 0 ? "already exists" : "" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  }) as unknown as SpawnFn;
}

async function makeJobState(slug = "test-slug"): Promise<JobState> {
  const state = buildInitialJobState({
    request: { path: path.join(tempDir, "request.md"), title: "Test", type: "new-feature", slug },
    repository: { owner: "testowner", name: "testrepo" },
  });
  await fs.mkdir(path.join(tempDir, "specrunner", "changes", slug), { recursive: true });
  const store = new JobStateStore(state.jobId, tempDir, { slug, stateRoot: tempDir });
  await store.persist(state);
  return state;
}

describe("TC-NW-004: setupWorkspace no-worktree run path", () => {
  it("does NOT call manager.create; calls git checkout -b; returns cwd as workspace", async () => {
    const manager = buildMockManager();
    const spawnFn = buildNoWorktreeSpawnFn();
    const githubClient = buildMockGitHubClient();

    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const slug = "my-feature";
    const branchName = "change/my-feature-abc12345";
    const jobState = await makeJobState(slug);

    const workspace = await runtime.setupWorkspace(slug, jobState.jobId, {
      noWorktree: true,
      branchName,
      bootstrapState: jobState,
    });

    // Worktree manager.create must NOT be called
    expect(manager.create).not.toHaveBeenCalled();

    // workspace.cwd must equal tempDir (not a worktree path)
    expect(workspace.cwd).toBe(tempDir);
    expect(workspace.worktreePath).toBeUndefined();
    expect(workspace.noWorktree).toBe(true);
    expect(workspace.branch).toBe(branchName);

    // git checkout -b must have been called
    const checkoutCall = (spawnFn as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "git" && (c[1] as string[])[0] === "checkout",
    );
    expect(checkoutCall).toBeDefined();
    expect((checkoutCall![1] as string[])[1]).toBe("-b");
    expect((checkoutCall![1] as string[])[2]).toBe(branchName);
  });
});

describe("TC-NW-005: setupWorkspace no-worktree resume path", () => {
  it("does NOT call manager.create; does NOT call git checkout -b", async () => {
    const manager = buildMockManager();
    const spawnFn = buildNoWorktreeSpawnFn();
    const githubClient = buildMockGitHubClient();

    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const slug = "my-feature";
    const jobState = await makeJobState(slug);

    const workspace = await runtime.setupWorkspace(slug, jobState.jobId, {
      noWorktree: true,
      existingWorktreePath: "/some/existing/worktree", // resume path
      bootstrapState: jobState,
    });

    expect(manager.create).not.toHaveBeenCalled();
    expect(workspace.cwd).toBe(tempDir);
    expect(workspace.noWorktree).toBe(true);

    // git checkout -b must NOT have been called in resume path
    const checkoutCall = (spawnFn as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "git" && (c[1] as string[])[0] === "checkout",
    );
    expect(checkoutCall).toBeUndefined();
  });
});

describe("TC-NW-006: setupWorkspace no-worktree — dirty working tree throws WORKTREE_DIRTY", () => {
  it("throws SpecRunnerError with WORKTREE_DIRTY when working tree is dirty", async () => {
    const manager = buildMockManager();
    const spawnFn = buildNoWorktreeSpawnFn({ dirty: true });
    const githubClient = buildMockGitHubClient();

    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const slug = "my-feature";
    const jobState = await makeJobState(slug);

    const { SpecRunnerError } = await import("../../src/errors.js");

    let caughtError: InstanceType<typeof SpecRunnerError> | null = null;
    try {
      await runtime.setupWorkspace(slug, jobState.jobId, {
        noWorktree: true,
        branchName: "change/my-feature-abc12345",
        bootstrapState: jobState,
      });
    } catch (err) {
      if (err instanceof SpecRunnerError) {
        caughtError = err;
      } else {
        throw err;
      }
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError!.code).toBe("WORKTREE_DIRTY");
  });
});

describe("TC-NW-007: setupWorkspace no-worktree — sidecar has worktreePath: null", () => {
  it("writes liveness sidecar with worktreePath: null", async () => {
    const manager = buildMockManager();
    const spawnFn = buildNoWorktreeSpawnFn();
    const githubClient = buildMockGitHubClient();

    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const slug = "sidecar-test";
    const jobState = await makeJobState(slug);

    await runtime.setupWorkspace(slug, jobState.jobId, {
      noWorktree: true,
      branchName: "change/sidecar-test-abc12345",
      bootstrapState: jobState,
    });

    // Read and verify sidecar
    const sidecarPath = path.join(tempDir, livenessJsonPath(slug));
    const raw = await fs.readFile(sidecarPath, "utf-8");
    const sidecar = JSON.parse(raw) as Record<string, unknown>;

    expect(sidecar["worktreePath"]).toBeNull();
    expect(sidecar["jobId"]).toBe(jobState.jobId);
    expect(typeof sidecar["pid"]).toBe("number");
  });
});

describe("TC-NW-008: buildDeps storeFactory uses cwd fallback when worktreePath absent", () => {
  it("storeFactory does not throw when worktreePath is undefined", async () => {
    const manager = buildMockManager();
    const spawnFn = buildNoWorktreeSpawnFn();
    const githubClient = buildMockGitHubClient();

    const runtime = new LocalRuntime({ cwd: tempDir, githubClient, manager, spawnFn });

    const slug = "build-deps-test";
    const jobState = await makeJobState(slug);

    const workspace = await runtime.setupWorkspace(slug, jobState.jobId, {
      noWorktree: true,
      bootstrapState: jobState,
    });

    // workspace.worktreePath is undefined — storeFactory must use workspace.cwd
    expect(workspace.worktreePath).toBeUndefined();

    const config = {
      version: 1 as const,
      runtime: "local" as const,
      agents: {},
      pipeline: { maxRetries: 2 },
    };
    const request = { type: "new-feature", title: "Test", slug, baseBranch: "main", content: "content", adr: false };
    const deps = runtime.buildDeps(config, request, slug, workspace) as { storeFactory: (id: string) => unknown };

    // Should not throw when worktreePath is absent
    expect(() => deps.storeFactory(jobState.jobId)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-NW-010, TC-NW-011: exit-guard no-worktree path
// ---------------------------------------------------------------------------

import { createExitGuardHandler } from "../../src/core/lifecycle/exit-guard.js";

async function writeSlugStateForExitGuard(
  repoRoot: string,
  slug: string,
  jobId: string,
  status = "running",
): Promise<void> {
  const changeDir = path.join(repoRoot, "specrunner", "changes", slug);
  await fs.mkdir(changeDir, { recursive: true });
  const stateJson = {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    step: "design",
    status,
    branch: `change/${slug}-${jobId.slice(0, 8)}`,
    error: null,
    _journal: { historyCount: 0, stepCounts: {} },
  };
  await fs.writeFile(path.join(changeDir, "state.json"), JSON.stringify(stateJson, null, 2), "utf-8");
  await fs.writeFile(path.join(changeDir, "events.jsonl"), "", "utf-8");
}

function waitForHandler(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 150));
}

describe("TC-NW-010: exit-guard no-worktree — transitions running job to awaiting-resume via cwd", () => {
  it("transitions running job to awaiting-resume without scanning worktrees dir", async () => {
    const slug = "nw-feature";
    const jobId = "aabbccdd-0000-0000-0000-000000000001";

    // Write state.json in cwd (repo root), not in a worktree
    await writeSlugStateForExitGuard(tempDir, slug, jobId, "running");

    // Ensure .git/specrunner-worktrees does NOT exist
    const worktreesDir = path.join(tempDir, ".git", "specrunner-worktrees");
    await fs.rm(worktreesDir, { recursive: true, force: true });

    const handler = createExitGuardHandler(tempDir, jobId, { noWorktree: true, slug });
    handler();
    await waitForHandler();

    // Load state from cwd-based store
    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir });
    const state = await store.load();
    expect(state.status).toBe("awaiting-resume");
  });
});

describe("TC-NW-011: exit-guard no-worktree — non-running job not changed", () => {
  it("does not transition awaiting-archive job", async () => {
    const slug = "finished-nw";
    const jobId = "aabbccdd-0000-0000-0000-000000000002";

    await writeSlugStateForExitGuard(tempDir, slug, jobId, "awaiting-archive");

    const handler = createExitGuardHandler(tempDir, jobId, { noWorktree: true, slug });
    handler();
    await waitForHandler();

    const store = new JobStateStore(jobId, tempDir, { slug, stateRoot: tempDir });
    const state = await store.load();
    expect(state.status).toBe("awaiting-archive");
  });
});

// ---------------------------------------------------------------------------
// TC-NW-014: CLI flag parse
// ---------------------------------------------------------------------------

import { parseFlags } from "../../src/cli/flag-parser.js";

describe("TC-NW-014: CLI flag parse — --no-worktree accepted", () => {
  it("run command: --no-worktree parses as boolean true", () => {
    const flags = { verbose: { type: "boolean" as const }, "no-worktree": { type: "boolean" as const } };
    const result = parseFlags(["--no-worktree"], flags);
    expect(result.flags["no-worktree"]).toBe(true);
  });

  it("run command: no flag → no-worktree is falsy", () => {
    const flags = { verbose: { type: "boolean" as const }, "no-worktree": { type: "boolean" as const } };
    const result = parseFlags(["--verbose"], flags);
    expect(result.flags["no-worktree"]).toBeFalsy();
  });

  it("resume command: --no-worktree parses as boolean true", () => {
    const flags = {
      from: { type: "string" as const },
      "no-worktree": { type: "boolean" as const },
    };
    const result = parseFlags(["--no-worktree"], flags);
    expect(result.flags["no-worktree"]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-NW-016: stateToStateJson slug-mode — noWorktree preserved, machine-local stripped
// ---------------------------------------------------------------------------

describe("TC-NW-016: stateToStateJson slug-mode — noWorktree preserved, machine-local fields stripped", () => {
  it("noWorktree: true is present in state.json after slug-mode persist; worktreePath/pid/session absent", async () => {
    const slug = "nw-persist-test";
    const jobState = await makeJobState(slug);

    const state: JobState = {
      ...jobState,
      noWorktree: true,
      worktreePath: "/some/worktree/path",
      pid: 99999,
      session: { id: "sess-1", agentId: "agent-1", environmentId: "env-1" },
    };

    const store = new JobStateStore(state.jobId, tempDir, { slug, stateRoot: tempDir });
    await store.persist(state);

    const stateJsonPath = path.join(tempDir, "specrunner", "changes", slug, "state.json");
    const raw = JSON.parse(await fs.readFile(stateJsonPath, "utf-8")) as Record<string, unknown>;

    // noWorktree must be preserved (not stripped in slug mode)
    expect(raw["noWorktree"]).toBe(true);
    // Machine-local fields must be absent
    expect("worktreePath" in raw).toBe(false);
    expect("pid" in raw).toBe(false);
    expect("session" in raw).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-NW-012, TC-NW-013: ResumeCommand.prepare() no-worktree scenarios
// ---------------------------------------------------------------------------

import { ResumeCommand } from "../../src/core/command/resume.js";
import { EventBus } from "../../src/core/event/event-bus.js";

/** Write a minimal valid request.md to the slug change folder. */
async function writeRequestMd(repoRoot: string, slug: string): Promise<void> {
  const content = `# No-Worktree Test

## Meta

- **type**: new-feature
- **slug**: ${slug}
- **base-branch**: main
- **adr**: false
`;
  await fs.writeFile(
    path.join(repoRoot, "specrunner", "changes", slug, "request.md"),
    content,
    "utf-8",
  );
}

describe("TC-NW-012: ResumeCommand.prepare() no-worktree — sidecar absent, running transition written to cwd", () => {
  it("transitions to running and persists to cwd state.json without sidecar", async () => {
    const slug = "ci-resume-test";
    const jobState = await makeJobState(slug);
    await writeRequestMd(tempDir, slug);

    // Persist state as awaiting-resume with noWorktree: true and a resumePoint
    const awaitingResumeState: JobState = {
      ...jobState,
      status: "awaiting-resume",
      step: "design",
      noWorktree: true,
      resumePoint: { step: "design", reason: "signal", iterationsExhausted: 0 },
    };
    const store = new JobStateStore(awaitingResumeState.jobId, tempDir, { slug, stateRoot: tempDir });
    await store.persist(awaitingResumeState);

    // No sidecar file exists — CI scenario

    const events = new EventBus();
    // runtime is not invoked by prepare(), pass a stub
    const cmd = new ResumeCommand(
      {} as never,
      events,
      slug,
      { noWorktree: true, cwd: tempDir },
    );

    await (cmd as unknown as { prepare(): Promise<unknown> }).prepare();

    // cwd state.json must now show status: "running"
    const loaded = await store.load();
    expect(loaded.status).toBe("running");
    expect(loaded.noWorktree).toBe(true);
  });
});

describe("TC-NW-013: exit-guard → awaiting-resume → ResumeCommand.prepare() resolves resumePoint", () => {
  it("prepare() resolves resumePoint materialized from journal interruption after exit-guard", async () => {
    const slug = "exit-resume-flow";
    const jobState = await makeJobState(slug);
    await writeRequestMd(tempDir, slug);

    // Persist state as running with noWorktree: true
    const runningState: JobState = {
      ...jobState,
      status: "running",
      step: "design",
      noWorktree: true,
      branch: `change/${slug}-${jobState.jobId.slice(0, 8)}`,
    };
    const store = new JobStateStore(runningState.jobId, tempDir, { slug, stateRoot: tempDir });
    await store.persist(runningState);

    // Run exit-guard — transitions running → awaiting-resume and appends interruption to journal
    const handler = createExitGuardHandler(tempDir, runningState.jobId, { noWorktree: true, slug });
    handler();
    await waitForHandler();

    // Verify state is awaiting-resume with resumePoint materialized from the journal
    const afterExit = await store.load();
    expect(afterExit.status).toBe("awaiting-resume");
    expect(afterExit.resumePoint).toBeDefined();
    expect(afterExit.resumePoint!.step).toBe("design");

    // Now ResumeCommand.prepare() with noWorktree: true must resolve that resumePoint
    const events = new EventBus();
    const cmd = new ResumeCommand(
      {} as never,
      events,
      slug,
      { noWorktree: true, cwd: tempDir },
    );

    const result = await (cmd as unknown as { prepare(): Promise<{ startStep: string }> }).prepare();

    expect(result.startStep).toBe("design");

    // Running transition must be written back to cwd
    const afterPrepare = await store.load();
    expect(afterPrepare.status).toBe("running");
  });
});
