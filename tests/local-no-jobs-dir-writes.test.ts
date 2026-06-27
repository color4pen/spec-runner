/**
 * Integration test: local runtime does NOT write to .specrunner/jobs/
 *
 * TC-NJW-001: bootstrapJob() creates no jobs-dir entry
 * TC-NJW-002: setupWorkspace() (run path) creates no jobs-dir entry
 * TC-NJW-003: cancelSingleJob() for a local job creates no jobs-dir entry
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalRuntime } from "../src/core/runtime/local.js";
import { cancelSingleJob } from "../src/core/cancel/runner.js";
import { createExitGuardHandler } from "../src/core/lifecycle/exit-guard.js";
import { changeFolderPath } from "../src/util/paths.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-no-jobs-writes-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
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
    getPullRequest: vi.fn(),
    mergePullRequest: vi.fn(),
    getCheckStatus: vi.fn(),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
  };
}

function buildMockSpawnFn() {
  return vi.fn().mockResolvedValue({ exitCode: 0, stdout: "0\n", stderr: "" });
}

function buildMockManager(createdPaths: string[]) {
  return {
    create: vi.fn().mockImplementation(async (_cwd: string, slug: string, jobId: string) => {
      const p = path.join(tempDir, ".git", "specrunner-worktrees", `${slug}-${jobId.slice(0, 8)}`);
      await fs.mkdir(p, { recursive: true });
      createdPaths.push(p);
      return p;
    }),
    remove: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Write a minimal slug state.json + events.jsonl to dir.
 */
async function writeSlugState(dir: string, jobId: string, slug: string, status = "awaiting-resume"): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const stateJson = {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: `${dir}/request.md`, title: "Test", type: "new-feature" },
    repository: { owner: "owner", name: "repo" },
    session: null,
    step: "design",
    status,
    branch: `change/${slug}`,
    error: null,
    _journal: { historyCount: 1, stepCounts: {} },
  };
  await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(stateJson));
  await fs.writeFile(path.join(dir, "events.jsonl"), JSON.stringify({ type: "transition", ts: "2026-01-01T00:00:00.000Z", from: null, to: "running", trigger: "init", reason: "job created" }) + "\n");
}

/**
 * Write a liveness sidecar at .specrunner/local/<slug>/liveness.json.
 */
async function writeLiveness(slug: string, jobId: string, worktreePath: string | null): Promise<void> {
  const dir = path.join(tempDir, ".specrunner", "local", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "liveness.json"),
    JSON.stringify({ jobId, worktreePath, pid: 99999 }),
  );
}

/**
 * Return true when the jobs dir for a given jobId does NOT exist.
 */
async function jobsDirAbsent(jobId: string): Promise<boolean> {
  const jobDir = path.join(tempDir, ".specrunner", "jobs", jobId);
  try {
    await fs.access(jobDir);
    return false; // exists
  } catch {
    return true; // ENOENT
  }
}

// TC-NJW-001: bootstrapJob() creates no jobs-dir entry
describe("TC-NJW-001: LocalRuntime.bootstrapJob() does not write to .specrunner/jobs/", () => {
  it("returns in-memory JobState without creating any filesystem entry", async () => {
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
    });

    const state = await runtime.bootstrapJob(tempDir, {
      request: { path: "/tmp/req.md", title: "Test", type: "new-feature", slug: "test-slug" },
      repository: { owner: "owner", name: "repo" },
    });

    expect(state.jobId).toBeDefined();
    expect(state.status).toBe("running");

    // jobs dir must not have been created at all
    await expect(fs.access(path.join(tempDir, ".specrunner", "jobs"))).rejects.toThrow();
    // the per-job dir must not exist
    expect(await jobsDirAbsent(state.jobId)).toBe(true);
  });
});

// TC-NJW-002: setupWorkspace() (run path) writes slug store only — not jobs-dir
describe("TC-NJW-002: LocalRuntime.setupWorkspace() writes slug store, not .specrunner/jobs/", () => {
  it("creates state in worktree slug dir and leaves .specrunner/jobs/ untouched", async () => {
    const createdPaths: string[] = [];
    const manager = buildMockManager(createdPaths);
    const spawnFn = buildMockSpawnFn();
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      manager,
      spawnFn,
    });

    // bootstrapJob: pure, no I/O
    const jobState = await runtime.bootstrapJob(tempDir, {
      request: { path: "/tmp/req.md", title: "Test", type: "new-feature", slug: "run-slug" },
      repository: { owner: "owner", name: "repo" },
    });

    // setupWorkspace (run path): seeds slug store in worktree
    await runtime.setupWorkspace("run-slug", jobState.jobId, {
      branchName: "change/run-slug-test",
      bootstrapState: jobState,
    });

    // Worktree slug store must exist
    const worktreePath = createdPaths[0]!;
    const slugStateFile = path.join(worktreePath, changeFolderPath("run-slug"), "state.json");
    await expect(fs.access(slugStateFile).then(() => undefined)).resolves.toBeUndefined();

    // jobs-dir entry must NOT exist
    expect(await jobsDirAbsent(jobState.jobId)).toBe(true);
    // The jobs-dir root itself should not be created by LocalRuntime
    await expect(fs.access(path.join(tempDir, ".specrunner", "jobs"))).rejects.toThrow();
  });
});

// TC-NJW-003: cancelSingleJob() for local job does not write to .specrunner/jobs/
describe("TC-NJW-003: cancelSingleJob() for local job does not create .specrunner/jobs/ entry", () => {
  it("evacuates to canceled/ dir and leaves .specrunner/jobs/ untouched", async () => {
    const slug = "cancel-test-slug";
    const jobId = "f1234567-abcd-0000-0000-000000000001";

    // Set up state in main-checkout canonical dir (simulates a job in awaiting-resume)
    const canonDir = path.join(tempDir, changeFolderPath(slug));
    await writeSlugState(canonDir, jobId, slug);

    // Set up liveness sidecar with no active worktree
    await writeLiveness(slug, jobId, null);

    const deps = {
      spawn: vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" }),
      worktreeManager: {
        remove: vi.fn().mockResolvedValue(undefined),
        prune: vi.fn().mockResolvedValue(undefined),
        create: vi.fn(),
      },
      sleep: vi.fn().mockResolvedValue(undefined),
      kill: vi.fn(),
      isAlive: vi.fn().mockReturnValue(false),
      repoRoot: tempDir,
    };

    const result = await cancelSingleJob({
      jobId,
      force: false,
      purge: false,
      deps,
    });

    expect(result.exitCode).toBe(0);

    // jobs-dir must NOT have been touched by cancel
    expect(await jobsDirAbsent(jobId)).toBe(true);

    // State is evacuated to canceled/<slug>-<jobId8>/ (move semantics)
    const jobId8 = jobId.slice(0, 8);
    const canceledDirAbs = path.join(tempDir, "specrunner", "changes", "canceled", `${slug}-${jobId8}`);
    const stateRaw = await fs.readFile(path.join(canceledDirAbs, "state.json"), "utf-8");
    const state = JSON.parse(stateRaw) as { status: string };
    expect(state.status).toBe("canceled");

    // Canonical dir should be gone (moved to canceled/)
    await expect(fs.access(path.join(canonDir, "state.json"))).rejects.toThrow();
  });
});

// TC-NJW-004: resume path (setupWorkspace with existingWorktreePath) creates no jobs-dir entry
describe("TC-NJW-004: LocalRuntime.setupWorkspace() resume path does not write to .specrunner/jobs/", () => {
  it("reuses existing worktree and leaves .specrunner/jobs/ untouched", async () => {
    const slug = "resume-slug";
    const jobId = "f2345678-abcd-0000-0000-000000000002";

    // Pre-create an "existing" worktree with slug state (simulates a previously started job)
    const existingWorktreePath = path.join(tempDir, ".git", "specrunner-worktrees", `${slug}-${jobId.slice(0, 8)}`);
    const canonDir = path.join(existingWorktreePath, changeFolderPath(slug));
    await writeSlugState(canonDir, jobId, slug);

    // Pre-create liveness sidecar
    await writeLiveness(slug, jobId, existingWorktreePath);

    const manager = buildMockManager([]);
    const runtime = new LocalRuntime({
      cwd: tempDir,
      githubClient: buildMockGitHubClient(),
      manager,
    });

    // Resume path: pass existingWorktreePath (the reuse branch)
    await runtime.setupWorkspace(slug, jobId, {
      existingWorktreePath,
    });

    // jobs-dir must NOT have been created
    expect(await jobsDirAbsent(jobId)).toBe(true);
    await expect(fs.access(path.join(tempDir, ".specrunner", "jobs"))).rejects.toThrow();
  });
});

// TC-NJW-005: exit-guard global scan path creates no jobs-dir entry
describe("TC-NJW-005: exit-guard global scan does not write to .specrunner/jobs/", () => {
  it("transitions running slug-state to awaiting-resume without touching .specrunner/jobs/", async () => {
    const slug = "exit-guard-slug";
    const jobId = "f3456789-abcd-0000-0000-000000000003";

    // Pre-create slug state in main-checkout changes dir (status=running)
    const canonDir = path.join(tempDir, changeFolderPath(slug));
    await writeSlugState(canonDir, jobId, slug, "running");

    // Pre-create liveness sidecar with no active worktree (canonical dir is the target)
    await writeLiveness(slug, jobId, null);

    // Call exit-guard global scan (no jobId → handleGlobalExit path)
    const handler = createExitGuardHandler(tempDir);
    handler();
    // Wait for the async IIFE inside the handler to complete
    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    // jobs-dir must NOT have been created
    expect(await jobsDirAbsent(jobId)).toBe(true);
    await expect(fs.access(path.join(tempDir, ".specrunner", "jobs"))).rejects.toThrow();

    // The slug canonical state should be updated to "awaiting-resume"
    const stateRaw = await fs.readFile(path.join(canonDir, "state.json"), "utf-8");
    const state = JSON.parse(stateRaw) as { status: string };
    expect(state.status).toBe("awaiting-resume");
  });
});
