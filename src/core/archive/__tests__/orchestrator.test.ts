/**
 * Tests for archive orchestrator — side-effect boundaries after archive-on-branch-first.
 *
 * Orchestrator records on the feature branch only; cleanup is post-merge.
 *
 * T-01: drafts/<slug> directory is still removed by orchestrator (pre-commit cleanup)
 * T-02: liveness.json is NOT unlinked by orchestrator (moved to runPostMergeCleanup)
 * T-03: managed marker.json is NOT unlinked by orchestrator (moved to runPostMergeCleanup)
 * T-04: localSidecarDir is NOT removed by orchestrator (moved to runPostMergeCleanup)
 * T-05: branch deletion (branch -D / push --delete) NOT called by orchestrator
 * T-06: draft rm failure does not fail archive (best-effort)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FinishFs } from "../../finish/types.js";
import type { SpawnFn } from "../../../util/spawn.js";
import type { JobState } from "../../../state/schema.js";
import { livenessJsonPath, managedMarkerPath, draftsDir, localSidecarDir } from "../../../util/paths.js";
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

vi.mock("../../../git/transport-auth.js", () => ({
  createTransportAuth: vi.fn().mockReturnValue({
    wrapSpawn: (spawn: SpawnFn) => spawn,
  }),
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

/** FinishFs mock with configurable rm behavior. */
function makeFs(): FinishFs & { unlink: ReturnType<typeof vi.fn>; rm: ReturnType<typeof vi.fn> } {
  return {
    exists: vi.fn().mockResolvedValue(true),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue("{}"),
    unlink: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("archive orchestrator — side-effect boundaries (archive-on-branch-first)", () => {
  beforeEach(() => {
    vi.mocked(JobStateStore.list).mockResolvedValue([makeState()]);
  });

  it("T-01: drafts/<slug> directory is still removed by orchestrator (pre-commit cleanup)", async () => {
    const mockFs = makeFs();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
    });

    expect(result.exitCode).toBe(0);

    // Draft removal stays in orchestrator so the deletion is committed with the archive
    const expectedDraftPath = nodePath.join(FAKE_WORKTREE, draftsDir(), FAKE_SLUG);
    expect(vi.mocked(mockFs.rm)).toHaveBeenCalledWith(
      expectedDraftPath,
      { recursive: true, force: true },
    );
  });

  it("T-02: liveness.json is NOT unlinked by orchestrator (moved to runPostMergeCleanup)", async () => {
    const mockFs = makeFs();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
    });

    expect(result.exitCode).toBe(0);

    const livenessPath = nodePath.join(FAKE_CWD, livenessJsonPath(FAKE_SLUG));
    const unlinkCalls = vi.mocked(mockFs.unlink).mock.calls.map(([p]) => p as string);
    expect(unlinkCalls).not.toContain(livenessPath);
  });

  it("T-03: managed marker.json is NOT unlinked by orchestrator (moved to runPostMergeCleanup)", async () => {
    const mockFs = makeFs();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
    });

    expect(result.exitCode).toBe(0);

    const markerPath = nodePath.join(FAKE_CWD, managedMarkerPath(FAKE_SLUG));
    const unlinkCalls = vi.mocked(mockFs.unlink).mock.calls.map(([p]) => p as string);
    expect(unlinkCalls).not.toContain(markerPath);
  });

  it("T-04: localSidecarDir is NOT removed by orchestrator (moved to runPostMergeCleanup)", async () => {
    const mockFs = makeFs();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
    });

    expect(result.exitCode).toBe(0);

    const sidecarPath = nodePath.join(FAKE_CWD, localSidecarDir(FAKE_SLUG));
    const rmCalls = vi.mocked(mockFs.rm).mock.calls.map(([p]) => p as string);
    expect(rmCalls).not.toContain(sidecarPath);
  });

  it("T-05: branch deletion (branch -D / push --delete) NOT called by orchestrator", async () => {
    const spawnMock = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: spawnMock as unknown as SpawnFn,
      fs: makeFs(),
    });

    expect(result.exitCode).toBe(0);

    const branchDeleteCall = spawnMock.mock.calls.find(
      (c: unknown[]) => c[0] === "git" && (c[1] as string[])[0] === "branch" && (c[1] as string[])[1] === "-D",
    );
    expect(branchDeleteCall).toBeUndefined();

    const remoteDeleteCall = spawnMock.mock.calls.find(
      (c: unknown[]) =>
        c[0] === "git" &&
        (c[1] as string[])[0] === "push" &&
        (c[1] as string[])[1] === "origin" &&
        (c[1] as string[])[2] === "--delete",
    );
    expect(remoteDeleteCall).toBeUndefined();
  });

  it("T-06: draft rm failure does not fail archive (best-effort)", async () => {
    const mockFs: FinishFs & { rm: ReturnType<typeof vi.fn> } = {
      ...makeFs(),
      rm: vi.fn(() => Promise.reject(new Error("EPERM"))),
    };

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
    });

    expect(result.exitCode).toBe(0);
  });

  it("T-07: draft rm EACCES emits a Warning via stderrWrite (best-effort)", async () => {
    vi.mocked(stderrWrite).mockClear();
    const mockFs: FinishFs & { rm: ReturnType<typeof vi.fn> } = {
      ...makeFs(),
      rm: vi.fn(() => Promise.reject(Object.assign(new Error("EACCES"), { code: "EACCES" }))),
    };

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: mockFs,
    });

    expect(result.exitCode).toBe(0);
    const calls = vi.mocked(stderrWrite).mock.calls.map(([msg]) => msg as string);
    expect(calls.some((m) => m.includes("Warning") && m.includes("draft"))).toBe(true);
  });
});
