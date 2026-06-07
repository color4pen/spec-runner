/**
 * Integration tests for src/core/archive/orchestrator.ts
 *
 * TC-003: change folder が存在する場合のアーカイブ（正常系）
 * TC-005: worktree が存在する job を archive する
 * TC-006: awaiting-archive → archived 遷移
 * TC-013: terminal status の job は archive で no-op exit 0
 * TC-AO-NOTFOUND: slug に対応する job が存在しない場合は exit 2
 * TC-AO-ORDER: Phase 1 順序 (mv → markJobArchived → git add → commit → push)
 * TC-AO-IDEMPOTENT: folder 移動済み・awaiting-archive の冪等再実行
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import type { FinishFs } from "../../../../src/core/finish/types.js";
import type { WorktreeManager } from "../../../../src/core/worktree/manager.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../../../src/store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn(),
    // Instance constructor mock (called as `new JobStateStore(jobId, cwd)`)
    default: vi.fn().mockImplementation(() => ({
      load: vi.fn().mockResolvedValue({ worktreePath: "/some/worktree", status: "awaiting-archive" }),
      persist: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

vi.mock("../../../../src/core/finish/job-state-update.js", () => ({
  assertJobFinishable: vi.fn(),
  markJobArchived: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../src/core/finish/derive-usage.js", () => ({
  deriveAndWriteUsage: vi.fn().mockResolvedValue({ ok: true, skipped: true, message: "skipped" }),
}));

vi.mock("../../../../src/core/finish/archive-change-folder.js", () => ({
  archiveChangeFolder: vi.fn().mockResolvedValue({ ok: true, skipped: false, message: "archived" }),
}));

vi.mock("../../../../src/core/finish/commit-archive.js", () => ({
  commitArchive: vi.fn().mockResolvedValue({ ok: true, skipped: false, message: "committed" }),
}));

vi.mock("../../../../src/core/worktree/manager.js", () => ({
  createWorktreeManager: vi.fn(),
  buildWorktreePath: vi.fn().mockReturnValue("/convention/worktree/path"),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpawn(exitCode = 0): SpawnFn {
  return vi.fn().mockResolvedValue({ exitCode, stdout: "", stderr: "" });
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
  };
}

function makeWorktreeManager(): WorktreeManager {
  return {
    create: vi.fn().mockResolvedValue("/fake"),
    remove: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  };
}

function makeJobState(overrides: Partial<{
  jobId: string;
  status: string;
  worktreePath: string | null;
  branch: string | null;
  slug: string;
  updatedAt: string;
}> = {}) {
  return {
    jobId: overrides.jobId ?? "test-job-id",
    status: overrides.status ?? "awaiting-archive",
    worktreePath: overrides.worktreePath ?? null,
    branch: overrides.branch ?? "change/my-slug-abc12345",
    request: { path: "/repo/specrunner/changes/my-slug/request.md", title: "Test", type: "spec-change", slug: overrides.slug ?? "my-slug" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    history: [],
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

const CWD = "/tmp/repo";
const SLUG = "my-slug";

let _stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  _stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-013: terminal status → no-op exit 0
// ---------------------------------------------------------------------------

describe("TC-013: terminal status の job は archive で no-op exit 0", () => {
  it("status=archived → exit 0, no git commands executed", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ status: "archived" }),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");

    const spawn = makeSpawn();
    const result = await runArchiveOrchestrator({ slug: SLUG, cwd: CWD, spawn, fs: makeFs() });

    expect(result).toEqual({ exitCode: 0 });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("status=canceled → exit 0, no git commands executed", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ status: "canceled" }),
    ]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");

    const spawn = makeSpawn();
    const result = await runArchiveOrchestrator({ slug: SLUG, cwd: CWD, spawn, fs: makeFs() });

    expect(result).toEqual({ exitCode: 0 });
    expect(spawn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-AO-NOTFOUND: slug に対応する job が存在しない → exit 2
// ---------------------------------------------------------------------------

describe("TC-AO-NOTFOUND: slug に対応する job が存在しない場合は exit 2", () => {
  it("no matching job → exitCode 2 with descriptive message", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");

    const result = await runArchiveOrchestrator({ slug: "nonexistent", cwd: CWD, spawn: makeSpawn(), fs: makeFs() });

    expect(result.exitCode).toBe(2);
    if (result.exitCode === 2) {
      expect(result.message).toContain("nonexistent");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-003: change folder あり正常系
// ---------------------------------------------------------------------------

describe("TC-003: change folder が存在する場合のアーカイブ（正常系）", () => {
  it("git checkout, pull, push が呼ばれ exitCode 0 を返す", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ status: "awaiting-archive" }),
    ]);

    const { assertJobFinishable, markJobArchived } = await import("../../../../src/core/finish/job-state-update.js");
    (assertJobFinishable as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    (markJobArchived as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { archiveChangeFolder } = await import("../../../../src/core/finish/archive-change-folder.js");
    (archiveChangeFolder as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, skipped: false, message: "archived" });

    const { commitArchive } = await import("../../../../src/core/finish/commit-archive.js");
    (commitArchive as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, skipped: false, message: "committed" });

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");

    const spawn = makeSpawn(0);
    const result = await runArchiveOrchestrator({ slug: SLUG, cwd: CWD, spawn, fs: makeFs() });

    expect(result).toEqual({ exitCode: 0 });

    // git checkout main called
    const spawnMock = spawn as ReturnType<typeof vi.fn>;
    const checkoutCall = spawnMock.mock.calls.find(
      (c: unknown[]) => c[0] === "git" && Array.isArray(c[1]) && (c[1] as string[])[0] === "checkout",
    );
    expect(checkoutCall).toBeDefined();

    // git push origin main called
    const pushCall = spawnMock.mock.calls.find(
      (c: unknown[]) => c[0] === "git" && Array.isArray(c[1]) && (c[1] as string[])[0] === "push",
    );
    expect(pushCall).toBeDefined();

    // markJobArchived called with (slug, cwd) — D1/D2/D3
    expect(markJobArchived).toHaveBeenCalledWith(SLUG, CWD);
  });
});

// ---------------------------------------------------------------------------
// TC-005: worktree が存在する job を archive する
// ---------------------------------------------------------------------------

describe("TC-005: worktree が存在する job を archive する", () => {
  it("WorktreeManager の remove と prune が呼ばれる", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ status: "awaiting-archive", worktreePath: "/tmp/worktrees/my-slug" }),
    ]);

    const { assertJobFinishable, markJobArchived } = await import("../../../../src/core/finish/job-state-update.js");
    (assertJobFinishable as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    (markJobArchived as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { archiveChangeFolder } = await import("../../../../src/core/finish/archive-change-folder.js");
    (archiveChangeFolder as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, skipped: false, message: "archived" });

    const { commitArchive } = await import("../../../../src/core/finish/commit-archive.js");
    (commitArchive as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, skipped: false, message: "committed" });

    const manager = makeWorktreeManager();
    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");

    const result = await runArchiveOrchestrator({
      slug: SLUG,
      cwd: CWD,
      spawn: makeSpawn(0),
      fs: makeFs(),
      worktreeManagerFn: () => manager,
    });

    expect(result).toEqual({ exitCode: 0 });
    expect(manager.remove).toHaveBeenCalledWith("/tmp/worktrees/my-slug", CWD);
    expect(manager.prune).toHaveBeenCalledWith(CWD);
  });
});

// ---------------------------------------------------------------------------
// TC-032: Phase 2 deletes liveness.json sidecar (best-effort unlink)
// ---------------------------------------------------------------------------

describe("TC-032: archive Phase 2 deletes liveness.json sidecar via unlink", () => {
  it("fs.unlink called with liveness.json path after worktree removal", async () => {
    const jobId = "test-job-id-032";
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ jobId, status: "awaiting-archive", worktreePath: "/tmp/worktrees/my-slug" }),
    ]);

    const { assertJobFinishable, markJobArchived } = await import("../../../../src/core/finish/job-state-update.js");
    (assertJobFinishable as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    (markJobArchived as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { archiveChangeFolder } = await import("../../../../src/core/finish/archive-change-folder.js");
    (archiveChangeFolder as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, skipped: false, message: "archived" });

    const { commitArchive } = await import("../../../../src/core/finish/commit-archive.js");
    (commitArchive as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, skipped: false, message: "committed" });

    const mockFs = makeFs();
    const manager = makeWorktreeManager();
    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");

    const result = await runArchiveOrchestrator({
      slug: SLUG,
      cwd: CWD,
      spawn: makeSpawn(0),
      fs: mockFs,
      worktreeManagerFn: () => manager,
    });

    expect(result).toEqual({ exitCode: 0 });

    // Phase 2 must unlink liveness.json sidecar
    const unlinkMock = mockFs.unlink as ReturnType<typeof vi.fn>;
    const expectedLivenessPath = `${CWD}/.specrunner/local/${SLUG}/liveness.json`;
    const livenessUnlinkCall = unlinkMock.mock.calls.find(
      (c: unknown[]) => c[0] === expectedLivenessPath,
    );
    expect(livenessUnlinkCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-034: Phase 2 does not access .specrunner/jobs/ — D5 invariant
// ---------------------------------------------------------------------------

describe("TC-034: Phase 2 does not access .specrunner/jobs/ paths (D5 invariant)", () => {
  it("no fs.readFile or fs.writeFile calls on .specrunner/jobs/ and JobStateStore.list invoked once", async () => {
    const jobId = "test-job-id-034";
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ jobId, status: "awaiting-archive", worktreePath: "/tmp/worktrees/my-slug" }),
    ]);

    const { assertJobFinishable, markJobArchived } = await import("../../../../src/core/finish/job-state-update.js");
    (assertJobFinishable as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    (markJobArchived as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { archiveChangeFolder } = await import("../../../../src/core/finish/archive-change-folder.js");
    (archiveChangeFolder as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, skipped: false, message: "archived" });

    const { commitArchive } = await import("../../../../src/core/finish/commit-archive.js");
    (commitArchive as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, skipped: false, message: "committed" });

    const sidecarContent = JSON.stringify({ jobId, worktreePath: "/tmp/worktrees/my-slug", pid: 1 });
    const mockFs = makeFs();
    (mockFs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(sidecarContent);

    const manager = makeWorktreeManager();
    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");

    const result = await runArchiveOrchestrator({
      slug: SLUG,
      cwd: CWD,
      spawn: makeSpawn(0),
      fs: mockFs,
      worktreeManagerFn: () => manager,
    });

    expect(result).toEqual({ exitCode: 0 });

    // D5: injected fs must never target .specrunner/jobs/
    const writeFileMock = mockFs.writeFile as ReturnType<typeof vi.fn>;
    const readFileMock = mockFs.readFile as ReturnType<typeof vi.fn>;

    for (const call of writeFileMock.mock.calls) {
      expect((call[0] as string).includes(".specrunner/jobs/")).toBe(false);
    }
    for (const call of readFileMock.mock.calls) {
      expect((call[0] as string).includes(".specrunner/jobs/")).toBe(false);
    }

    // JobStateStore.list invoked exactly once (Phase 0 only; Phase 2 must not re-invoke it)
    expect(JobStateStore.list).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TC-006: awaiting-archive → archived 遷移
// ---------------------------------------------------------------------------

describe("TC-006: awaiting-archive の job を archive する", () => {
  it("markJobArchived が (slug, cwd) で呼ばれる（D1/D2/D3）", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    const jobId = "job-awaiting-archive-001";
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ jobId, status: "awaiting-archive" }),
    ]);

    const { assertJobFinishable, markJobArchived } = await import("../../../../src/core/finish/job-state-update.js");
    (assertJobFinishable as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    (markJobArchived as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { archiveChangeFolder } = await import("../../../../src/core/finish/archive-change-folder.js");
    (archiveChangeFolder as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, skipped: false, message: "archived" });

    const { commitArchive } = await import("../../../../src/core/finish/commit-archive.js");
    (commitArchive as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, skipped: false, message: "committed" });

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");

    const result = await runArchiveOrchestrator({ slug: SLUG, cwd: CWD, spawn: makeSpawn(0), fs: makeFs() });

    expect(result).toEqual({ exitCode: 0 });
    // D1/D2/D3: called with (slug, cwd) not (jobId, cwd)
    expect(markJobArchived).toHaveBeenCalledWith(SLUG, CWD);
  });
});

// ---------------------------------------------------------------------------
// TC-AO-ORDER: Phase 1 順序 — mv → markJobArchived → git add → commit → push
// ---------------------------------------------------------------------------

describe("TC-AO-ORDER: Phase 1 実行順序の検証", () => {
  it("archiveChangeFolder → markJobArchived → git add specrunner/changes/ → commitArchive → push", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ status: "awaiting-archive" }),
    ]);

    const { assertJobFinishable, markJobArchived } = await import("../../../../src/core/finish/job-state-update.js");
    (assertJobFinishable as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const { archiveChangeFolder } = await import("../../../../src/core/finish/archive-change-folder.js");
    const { commitArchive } = await import("../../../../src/core/finish/commit-archive.js");

    const callOrder: string[] = [];

    (archiveChangeFolder as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push("archiveChangeFolder");
      return { ok: true, skipped: false, message: "archived" };
    });
    (markJobArchived as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push("markJobArchived");
    });
    (commitArchive as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push("commitArchive");
      return { ok: true, skipped: false, message: "committed" };
    });

    const spawn = vi.fn().mockImplementation(async (_cmd: string, args: string[]) => {
      if (args[0] === "add") callOrder.push("git-add");
      else if (args[0] === "push" && args[2] !== "--delete") callOrder.push("git-push");
      return { exitCode: 0, stdout: "", stderr: "" };
    }) as unknown as SpawnFn;

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    const result = await runArchiveOrchestrator({ slug: SLUG, cwd: CWD, spawn, fs: makeFs() });

    expect(result).toEqual({ exitCode: 0 });

    // Verify ordering: archiveChangeFolder → markJobArchived → git-add → commitArchive → git-push
    const archiveIdx = callOrder.indexOf("archiveChangeFolder");
    const markIdx = callOrder.indexOf("markJobArchived");
    const addIdx = callOrder.indexOf("git-add");
    const commitIdx = callOrder.indexOf("commitArchive");
    const pushIdx = callOrder.lastIndexOf("git-push");

    expect(archiveIdx).toBeGreaterThanOrEqual(0);
    expect(markIdx).toBeGreaterThan(archiveIdx);
    expect(addIdx).toBeGreaterThan(markIdx);
    expect(commitIdx).toBeGreaterThan(addIdx);
    expect(pushIdx).toBeGreaterThan(commitIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-AO-IDEMPOTENT: folder 移動済み・awaiting-archive の冪等再実行
// ---------------------------------------------------------------------------

describe("TC-AO-IDEMPOTENT: folder 移動済みで awaiting-archive の冪等再実行", () => {
  it("archiveChangeFolder skip → markJobArchived → stage → commit → push", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeJobState({ status: "awaiting-archive" }),
    ]);

    const { assertJobFinishable, markJobArchived } = await import("../../../../src/core/finish/job-state-update.js");
    (assertJobFinishable as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    (markJobArchived as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { archiveChangeFolder } = await import("../../../../src/core/finish/archive-change-folder.js");
    // Simulate already-moved: skipped
    (archiveChangeFolder as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      skipped: true,
      message: "skipping — folder already moved",
    });

    const { commitArchive } = await import("../../../../src/core/finish/commit-archive.js");
    (commitArchive as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, skipped: false, message: "committed" });

    const spawn = makeSpawn(0);
    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");
    const result = await runArchiveOrchestrator({ slug: SLUG, cwd: CWD, spawn, fs: makeFs() });

    expect(result).toEqual({ exitCode: 0 });
    // markJobArchived still called to transition status in archive location
    expect(markJobArchived).toHaveBeenCalledWith(SLUG, CWD);
    // git add called to stage state.json changes
    const spawnMock = spawn as ReturnType<typeof vi.fn>;
    const addCall = spawnMock.mock.calls.find(
      (c: unknown[]) => c[0] === "git" && Array.isArray(c[1]) && (c[1] as string[])[0] === "add",
    );
    expect(addCall).toBeDefined();
  });
});
