/**
 * Tests for archive orchestrator Phase 2 marker / sidecar cleanup.
 *
 * T-01: managed marker (marker.json) is deleted after archive
 * T-02: liveness sidecar (liveness.json) is deleted after archive
 * T-03: unlink failure does not fail archive (best-effort)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FinishFs } from "../../finish/types.js";
import type { SpawnFn } from "../../../util/spawn.js";
import type { JobState } from "../../../state/schema.js";
import { livenessJsonPath, managedMarkerPath, draftsDir } from "../../../util/paths.js";
import * as nodePath from "node:path";

// ---------------------------------------------------------------------------
// Module mocks (hoisted — vi.mock calls are hoisted by vitest)
// ---------------------------------------------------------------------------

vi.mock("../../../store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn(),
  },
}));

vi.mock("../../finish/job-state-update.js", () => ({
  assertJobFinishable: vi.fn(),
  markJobArchived: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../finish/derive-usage.js", () => ({
  deriveAndWriteUsage: vi.fn().mockResolvedValue({ skipped: false, message: "usage derived" }),
}));

vi.mock("../../finish/archive-change-folder.js", () => ({
  archiveChangeFolder: vi.fn().mockResolvedValue({ ok: true, skipped: false, message: "archived" }),
}));

vi.mock("../../finish/commit-archive.js", () => ({
  commitArchive: vi.fn().mockResolvedValue({ ok: true, skipped: false, message: "committed" }),
}));

vi.mock("../../../logger/stdout.js", () => ({
  logResult: vi.fn(),
  stderrWrite: vi.fn(),
}));

// Import after mocks are set up
import { runArchiveOrchestrator } from "../orchestrator.js";
import { JobStateStore } from "../../../store/job-state-store.js";
import { stderrWrite } from "../../../logger/stdout.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_CWD = "/repo";
const FAKE_SLUG = "test-job";
const FAKE_JOB_ID = "aaaabbbb-0000-0000-0000-000000000001";
const FAKE_WORKTREE = "/fake/worktree/test-job-aaaabbbb";
const FAKE_BRANCH = "fix/test-job-aaaabbbb";

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: FAKE_JOB_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: `/specrunner/changes/${FAKE_SLUG}/request.md`,
      title: "Test Job",
      type: "bug-fix",
      slug: FAKE_SLUG,
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: FAKE_BRANCH,
    history: [],
    error: null,
    worktreePath: FAKE_WORKTREE,
    ...overrides,
  } as JobState;
}

/** Spawn mock that returns exitCode 0 for all git commands. */
function makeSpawn(): SpawnFn {
  return vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
}

/** FinishFs mock with configurable unlink behavior. */
function makeFs(unlinkImpl?: (path: string) => Promise<void>): FinishFs & { unlink: ReturnType<typeof vi.fn> } {
  return {
    exists: vi.fn().mockResolvedValue(true),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue("{}"),
    unlink: unlinkImpl ? vi.fn(unlinkImpl) : vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  };
}

/** Worktree manager mock (no-op remove/prune). */
function makeWorktreeManager() {
  return {
    create: vi.fn().mockResolvedValue(FAKE_WORKTREE),
    remove: vi.fn().mockResolvedValue(undefined),
    prune: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("archive orchestrator — Phase 2 marker / sidecar cleanup", () => {
  beforeEach(() => {
    vi.mocked(JobStateStore.list).mockResolvedValue([makeState()]);
  });

  it("T-01: managed marker.json is unlinked after successful archive", async () => {
    const mockFs = makeFs();
    const worktreeManager = makeWorktreeManager();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
      worktreeManagerFn: () => worktreeManager,
    });

    expect(result.exitCode).toBe(0);

    const expectedMarkerPath = nodePath.join(FAKE_CWD, managedMarkerPath(FAKE_SLUG));
    const unlinkCalls = vi.mocked(mockFs.unlink).mock.calls.map(([p]) => p as string);
    expect(unlinkCalls).toContain(expectedMarkerPath);
  });

  it("T-02: liveness.json is unlinked after successful archive", async () => {
    const mockFs = makeFs();
    const worktreeManager = makeWorktreeManager();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
      worktreeManagerFn: () => worktreeManager,
    });

    expect(result.exitCode).toBe(0);

    const expectedLivenessPath = nodePath.join(FAKE_CWD, livenessJsonPath(FAKE_SLUG));
    const unlinkCalls = vi.mocked(mockFs.unlink).mock.calls.map(([p]) => p as string);
    expect(unlinkCalls).toContain(expectedLivenessPath);
  });

  it("T-03a: marker.json unlink failure (ENOENT) does not fail archive", async () => {
    // marker.json throws, liveness.json succeeds
    const mockFs = makeFs((p) => {
      if (p.endsWith("marker.json")) return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
      return Promise.resolve();
    });
    const worktreeManager = makeWorktreeManager();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
      worktreeManagerFn: () => worktreeManager,
    });

    expect(result.exitCode).toBe(0);
  });

  it("T-03b: liveness.json unlink failure (ENOENT) does not fail archive", async () => {
    // liveness.json throws, marker.json succeeds
    const mockFs = makeFs((p) => {
      if (p.endsWith("liveness.json")) return Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
      return Promise.resolve();
    });
    const worktreeManager = makeWorktreeManager();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
      worktreeManagerFn: () => worktreeManager,
    });

    expect(result.exitCode).toBe(0);
  });

  it("T-03c: both unlinks fail → archive still exits 0", async () => {
    const mockFs = makeFs(() => Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" })));
    const worktreeManager = makeWorktreeManager();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
      worktreeManagerFn: () => worktreeManager,
    });

    expect(result.exitCode).toBe(0);
  });

  it("T-04: liveness.json unlink failure (EACCES) emits stderrWrite warning", async () => {
    vi.mocked(stderrWrite).mockClear();
    const mockFs = makeFs((p) => {
      if (p.endsWith("liveness.json")) return Promise.reject(Object.assign(new Error("EACCES"), { code: "EACCES" }));
      return Promise.resolve();
    });
    const worktreeManager = makeWorktreeManager();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
      worktreeManagerFn: () => worktreeManager,
    });

    expect(result.exitCode).toBe(0);
    const calls = vi.mocked(stderrWrite).mock.calls.map(([msg]) => msg as string);
    expect(calls.some((m) => m.includes("Warning") && m.includes("liveness"))).toBe(true);
  });

  it("T-05: marker.json unlink failure (EACCES) emits stderrWrite warning", async () => {
    vi.mocked(stderrWrite).mockClear();
    const mockFs = makeFs((p) => {
      if (p.endsWith("marker.json")) return Promise.reject(Object.assign(new Error("EACCES"), { code: "EACCES" }));
      return Promise.resolve();
    });
    const worktreeManager = makeWorktreeManager();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
      worktreeManagerFn: () => worktreeManager,
    });

    expect(result.exitCode).toBe(0);
    const calls = vi.mocked(stderrWrite).mock.calls.map(([msg]) => msg as string);
    expect(calls.some((m) => m.includes("Warning") && m.includes("marker"))).toBe(true);
  });

  it("TC-014: drafts/<slug> directory is removed via fs.rm during archive", async () => {
    const mockFs = makeFs();
    const worktreeManager = makeWorktreeManager();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
      worktreeManagerFn: () => worktreeManager,
    });

    expect(result.exitCode).toBe(0);

    const expectedDraftPath = nodePath.join(FAKE_CWD, draftsDir(), FAKE_SLUG);
    expect(vi.mocked(mockFs.rm)).toHaveBeenCalledWith(
      expectedDraftPath,
      { recursive: true, force: true },
    );
  });
});
