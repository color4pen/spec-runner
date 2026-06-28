/**
 * Archive orchestrator tests for --no-worktree mode.
 *
 * TC-NW-012: state.noWorktree=true → worktree remove/prune NOT called; branch delete NOT called
 *            (cleanup moved to runPostMergeCleanup; orchestrator only records on feature branch)
 * TC-NW-013: normal worktree job → remove/prune also NOT called in orchestrator (moved to cleanup)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SpawnFn } from "../../src/util/spawn.js";
import type { FinishFs } from "../../src/core/finish/types.js";

// ---------------------------------------------------------------------------
// Module mocks (hoisted)
// ---------------------------------------------------------------------------

vi.mock("../../src/store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn(),
  },
}));

vi.mock("../../src/core/finish/job-state-update.js", () => ({
  assertJobFinishable: vi.fn(),
  markJobArchived: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/core/finish/derive-usage.js", () => ({
  deriveAndWriteUsage: vi.fn().mockResolvedValue({ ok: true, skipped: true, message: "skipped" }),
}));

vi.mock("../../src/core/finish/archive-change-folder.js", () => ({
  archiveChangeFolder: vi.fn().mockResolvedValue({ ok: true, skipped: false, message: "archived" }),
}));

vi.mock("../../src/core/finish/commit-archive.js", () => ({
  commitArchive: vi.fn().mockResolvedValue({ ok: true, skipped: false, message: "committed" }),
}));

vi.mock("../../src/core/worktree/manager.js", () => ({
  createWorktreeManager: vi.fn(),
  buildWorktreePath: vi.fn().mockReturnValue("/convention/path"),
}));

vi.mock("../../src/git/transport-auth.js", () => ({
  createTransportAuth: vi.fn().mockReturnValue({
    wrapSpawn: (spawn: SpawnFn) => spawn,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpawn(exitCode = 0): SpawnFn {
  return vi.fn().mockResolvedValue({ exitCode, stdout: "", stderr: "" }) as unknown as SpawnFn;
}

function makeFs(): FinishFs {
  return {
    exists: vi.fn().mockResolvedValue(true),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(""),
    rm: vi.fn().mockResolvedValue(undefined),
  };
}

function makeJobState(overrides: Record<string, unknown> = {}) {
  return {
    jobId: "archive-job-id",
    status: "awaiting-archive",
    worktreePath: null as string | null,
    branch: "change/my-slug-abc12345",
    request: {
      path: "/repo/specrunner/changes/my-slug/request.md",
      title: "Test",
      type: "spec-change",
      slug: "my-slug",
    },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    history: [],
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const CWD = "/tmp/repo";
const SLUG = "my-slug";
const BRANCH = "change/my-slug-abc12345";

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-NW-012: no-worktree job — orchestrator only records on feature branch
// ---------------------------------------------------------------------------

describe("TC-NW-012: archive — noWorktree=true records on feature branch only", () => {
  it("worktreeManager.remove and .prune are NOT called for no-worktree job", async () => {
    const { JobStateStore } = await import("../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ worktreePath: null, noWorktree: true }),
    ]);

    const { createWorktreeManager } = await import("../../src/core/worktree/manager.js");
    const mockManager = {
      create: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(undefined),
    };
    (createWorktreeManager as ReturnType<typeof vi.fn>).mockReturnValue(mockManager);

    const { runArchiveOrchestrator } = await import("../../src/core/archive/orchestrator.js");

    const result = await runArchiveOrchestrator({
      slug: SLUG,
      cwd: CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
    });

    expect(result.exitCode).toBe(0);
    expect(mockManager.remove).not.toHaveBeenCalled();
    expect(mockManager.prune).not.toHaveBeenCalled();
  });

  it("git checkout <feature-branch> is called (not base branch) for no-worktree job", async () => {
    const { JobStateStore } = await import("../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ worktreePath: null, noWorktree: true }),
    ]);

    const { runArchiveOrchestrator } = await import("../../src/core/archive/orchestrator.js");

    const spawnMock = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const spawn = spawnMock as unknown as SpawnFn;

    const result = await runArchiveOrchestrator({ slug: SLUG, cwd: CWD, spawn, fs: makeFs() });

    expect(result.exitCode).toBe(0);

    // git checkout <feature-branch> must have been called (to switch to feature branch)
    const checkoutFeatureBranchCall = spawnMock.mock.calls.find(
      (c: unknown[]) =>
        c[0] === "git" &&
        (c[1] as string[])[0] === "checkout" &&
        (c[1] as string[])[1] === BRANCH,
    );
    expect(checkoutFeatureBranchCall).toBeDefined();
  });

  it("git branch -D is NOT called in orchestrator for no-worktree job (moved to cleanup)", async () => {
    const { JobStateStore } = await import("../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ worktreePath: null, noWorktree: true }),
    ]);

    const { runArchiveOrchestrator } = await import("../../src/core/archive/orchestrator.js");

    const spawnMock = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const spawn = spawnMock as unknown as SpawnFn;

    await runArchiveOrchestrator({ slug: SLUG, cwd: CWD, spawn, fs: makeFs() });

    // git branch -D must NOT be called — branch deletion is post-merge cleanup
    const deleteBranchCall = spawnMock.mock.calls.find(
      (c: unknown[]) =>
        c[0] === "git" &&
        (c[1] as string[])[0] === "branch" &&
        (c[1] as string[])[1] === "-D",
    );
    expect(deleteBranchCall).toBeUndefined();
  });

  it("git push goes to feature branch, NOT base branch", async () => {
    const { JobStateStore } = await import("../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ worktreePath: null, noWorktree: true }),
    ]);

    const { runArchiveOrchestrator } = await import("../../src/core/archive/orchestrator.js");

    const spawnMock = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const spawn = spawnMock as unknown as SpawnFn;

    await runArchiveOrchestrator({ slug: SLUG, cwd: CWD, spawn, fs: makeFs() });

    const pushCalls = spawnMock.mock.calls.filter(
      (c: unknown[]) => c[0] === "git" && (c[1] as string[])[0] === "push",
    );

    // push to feature branch must happen
    const pushFeature = pushCalls.find(
      (c: unknown[]) => (c[1] as string[])[2] === BRANCH,
    );
    expect(pushFeature).toBeDefined();

    // push to main/base must NOT happen
    const pushMain = pushCalls.find(
      (c: unknown[]) => (c[1] as string[])[2] === "main",
    );
    expect(pushMain).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-NW-013: worktree job — remove/prune NOT called in orchestrator (moved to cleanup)
// ---------------------------------------------------------------------------

describe("TC-NW-013: archive — worktree job: remove/prune NOT called in orchestrator", () => {
  it("worktreeManager.remove and .prune are NOT called — cleanup is post-merge only", async () => {
    const { JobStateStore } = await import("../../src/store/job-state-store.js");
    // noWorktree is absent (undefined) — normal worktree job
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ worktreePath: "/some/worktree" }),
    ]);

    const { createWorktreeManager } = await import("../../src/core/worktree/manager.js");
    const mockManager = {
      create: vi.fn(),
      remove: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(undefined),
    };
    (createWorktreeManager as ReturnType<typeof vi.fn>).mockReturnValue(mockManager);

    const { runArchiveOrchestrator } = await import("../../src/core/archive/orchestrator.js");

    const result = await runArchiveOrchestrator({
      slug: SLUG,
      cwd: CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
    });

    expect(result.exitCode).toBe(0);
    // Cleanup (remove + prune) moved to runPostMergeCleanup — NOT called by orchestrator
    expect(mockManager.remove).not.toHaveBeenCalled();
    expect(mockManager.prune).not.toHaveBeenCalled();
  });

  it("git push goes to feature branch for worktree job", async () => {
    const { JobStateStore } = await import("../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ worktreePath: "/some/worktree" }),
    ]);

    const { runArchiveOrchestrator } = await import("../../src/core/archive/orchestrator.js");

    const spawnMock = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const spawn = spawnMock as unknown as SpawnFn;

    await runArchiveOrchestrator({ slug: SLUG, cwd: CWD, spawn, fs: makeFs() });

    const pushCalls = spawnMock.mock.calls.filter(
      (c: unknown[]) => c[0] === "git" && (c[1] as string[])[0] === "push",
    );

    const pushFeature = pushCalls.find(
      (c: unknown[]) => (c[1] as string[])[2] === BRANCH,
    );
    expect(pushFeature).toBeDefined();
  });
});
