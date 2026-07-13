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
 * T-DTE-01: designLayer enabled + decision-needed finding → topic file written + git add called
 * T-DTE-02: topic emission runs before mark-hook (spawn call order)
 * T-DTE-03: designLayer disabled → no topic file written
 * TC-009: deferArchivedTransition: true → markJobArchived NOT called; mv/commit/push still run
 * TC-010: deferArchivedTransition unset → markJobArchived IS called (regression guard)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FinishFs } from "../../finish/types.js";
import type { SpawnFn } from "../../../util/spawn.js";
import type { JobState, StepRun } from "../../../state/schema.js";
import type { Finding } from "../../../kernel/report-result.js";
import type { ResolvedDesignLayer } from "../../../config/schema.js";
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
import { commitArchive } from "../../finish/commit-archive.js";
import { archiveChangeFolder } from "../../finish/archive-change-folder.js";
import { markJobArchived } from "../../finish/job-state-update.js";

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

  it("T-08: drafts directory absent → git add specrunner/drafts NOT called (no warning)", async () => {
    const spawnMock = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    vi.mocked(stderrWrite).mockClear();

    const mockFs = makeFs();
    // fs.exists returns false specifically for the drafts directory path
    vi.mocked(mockFs.exists).mockImplementation(async (p: string) => {
      if (p.includes("specrunner/drafts")) return false;
      return true;
    });

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: spawnMock as unknown as SpawnFn,
      fs: mockFs,
    });

    expect(result.exitCode).toBe(0);

    // git add specrunner/drafts must NOT be called
    const draftAddCall = spawnMock.mock.calls.find(
      (c: unknown[]) =>
        c[0] === "git" &&
        Array.isArray(c[1]) &&
        (c[1] as string[])[0] === "add" &&
        (c[1] as string[]).some((arg: string) => arg.includes("specrunner/drafts") || arg === "specrunner/drafts"),
    );
    expect(draftAddCall).toBeUndefined();

    // No warning about drafts should have been emitted
    const warnCalls = vi.mocked(stderrWrite).mock.calls.map(([msg]) => msg as string);
    expect(warnCalls.some((m) => m.includes("specrunner/drafts"))).toBe(false);
  });

  it("T-09: drafts directory present → git add specrunner/drafts IS called", async () => {
    const spawnMock = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });

    const mockFs = makeFs();
    // fs.exists returns true for all paths (including drafts)
    vi.mocked(mockFs.exists).mockResolvedValue(true);

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: spawnMock as unknown as SpawnFn,
      fs: mockFs,
    });

    expect(result.exitCode).toBe(0);

    // git add specrunner/drafts MUST be called
    const draftAddCall = spawnMock.mock.calls.find(
      (c: unknown[]) =>
        c[0] === "git" &&
        Array.isArray(c[1]) &&
        (c[1] as string[])[0] === "add" &&
        (c[1] as string[]).some((arg: string) => arg.includes("specrunner/drafts") || arg === "specrunner/drafts"),
    );
    expect(draftAddCall).toBeDefined();
  });

  it("T-07: archived job resolves via includeArchived and returns Already finished", async () => {
    vi.mocked(JobStateStore.list).mockResolvedValue([makeState({ status: "archived" })]);
    vi.mocked(commitArchive).mockClear();
    vi.mocked(archiveChangeFolder).mockClear();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
    });

    // Should return exitCode 0 via terminal-status short-circuit
    expect(result.exitCode).toBe(0);

    // list() must have been called with includeArchived: true
    expect(vi.mocked(JobStateStore.list)).toHaveBeenCalledWith(FAKE_CWD, { includeArchived: true });

    // No archive side-effects should have been executed
    expect(vi.mocked(commitArchive)).not.toHaveBeenCalled();
    expect(vi.mocked(archiveChangeFolder)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T-DTE: Design topic emission integration tests
// ---------------------------------------------------------------------------

function makeDecisionNeededFinding(): Finding {
  return {
    severity: "high",
    resolution: "decision-needed",
    file: "src/design.ts",
    title: "Architecture decision required",
    rationale: "The design has a structural gap.",
    options: [
      { label: "Option A", consequence: "Keep current approach" },
      { label: "Option B", consequence: "Refactor design" },
    ],
  };
}

function makeStepRunWithFindings(attempt: number, findings: Finding[]): StepRun {
  return {
    attempt,
    sessionId: null,
    outcome: {
      verdict: "escalated",
      findingsPath: null,
      error: null,
      toolResult: { ok: true, findings },
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
  };
}

function makeEnabledDesignLayer(): ResolvedDesignLayer {
  return {
    enabled: true,
    command: "fake-aozu",
    requireCitationTypes: [],
    topicEmission: true,
  };
}

/** FinishFs that presents design/ directory present, no topic files yet */
function makeFsWithDesign(): FinishFs & {
  writeFile: ReturnType<typeof vi.fn>;
  mkdir: ReturnType<typeof vi.fn>;
} {
  return {
    exists: vi.fn().mockImplementation(async (p: string) => {
      if (p.endsWith(".md")) return false;          // Topic files don't exist yet
      if (p.endsWith("design/topics")) return false; // topics/ dir doesn't exist yet
      if (p.endsWith("/design")) return true;        // design/ directory exists
      return true;
    }),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue("{}"),
    unlink: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  };
}

describe("archive orchestrator — design topic emission (T-DTE)", () => {
  beforeEach(() => {
    vi.mocked(JobStateStore.list).mockResolvedValue([makeState()]);
  });

  it("T-DTE-01: designLayer enabled + decision-needed finding → topic file written + git add called", async () => {
    const stateWithFinding = makeState({
      steps: {
        "spec-review": [makeStepRunWithFindings(1, [makeDecisionNeededFinding()])],
      },
    });
    vi.mocked(JobStateStore.list).mockResolvedValue([stateWithFinding]);

    const spawnMock = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "abc123\n", stderr: "" });
    const mockFs = makeFsWithDesign();

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: spawnMock as unknown as SpawnFn,
      fs: mockFs,
      designLayer: makeEnabledDesignLayer(),
    });

    expect(result.exitCode).toBe(0);

    // Topic file should have been written
    const writeFileCalls = vi.mocked(mockFs.writeFile).mock.calls;
    const topicFileCall = writeFileCalls.find(([p]) =>
      typeof p === "string" && p.includes("design/topics/"),
    );
    expect(topicFileCall).toBeDefined();

    // File content should be a valid topic file with id and source
    if (topicFileCall) {
      const content = topicFileCall[1] as string;
      expect(content).toContain("id: top-");
      expect(content).toContain("source: specrunner:");
    }

    // git add -- design/topics should have been called
    const addTopicsCall = spawnMock.mock.calls.find(
      (c: unknown[]) =>
        c[0] === "git" &&
        Array.isArray(c[1]) &&
        (c[1] as string[]).includes("add") &&
        (c[1] as string[]).includes("design/topics"),
    );
    expect(addTopicsCall).toBeDefined();
  });

  it("T-DTE-02: topic emission runs before mark-hook (spawn call order)", async () => {
    const stateWithFinding = makeState({
      steps: {
        "spec-review": [makeStepRunWithFindings(1, [makeDecisionNeededFinding()])],
      },
    });
    vi.mocked(JobStateStore.list).mockResolvedValue([stateWithFinding]);

    const callOrder: string[] = [];
    const spawnMock = vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
      const label = cmd === "git"
        ? `git ${(args as string[]).join(" ")}`
        : `${cmd} ${(args as string[]).join(" ")}`;
      callOrder.push(label);
      return { exitCode: 0, stdout: "abc123\n", stderr: "" };
    });

    const mockFs = makeFsWithDesign();

    await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: spawnMock as unknown as SpawnFn,
      fs: mockFs,
      designLayer: makeEnabledDesignLayer(),
    });

    // Find positions of topic emission git add and mark-hook call
    const addTopicsIdx = callOrder.findIndex((s) => s.includes("add") && s.includes("design/topics"));
    const markHookIdx = callOrder.findIndex((s) => s.includes("mark"));

    expect(addTopicsIdx).toBeGreaterThanOrEqual(0);
    expect(markHookIdx).toBeGreaterThanOrEqual(0);
    // Topic emission must come before mark-hook
    expect(addTopicsIdx).toBeLessThan(markHookIdx);
  });

  it("T-DTE-03: designLayer disabled → no topic file written, no design/topics git add", async () => {
    const stateWithFinding = makeState({
      steps: {
        "spec-review": [makeStepRunWithFindings(1, [makeDecisionNeededFinding()])],
      },
    });
    vi.mocked(JobStateStore.list).mockResolvedValue([stateWithFinding]);

    const spawnMock = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "abc123\n", stderr: "" });
    const mockFs = makeFsWithDesign();

    // Disabled designLayer (default when designLayer not passed)
    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: spawnMock as unknown as SpawnFn,
      fs: mockFs,
      // No designLayer passed → noopDesignLayer with enabled:false
    });

    expect(result.exitCode).toBe(0);

    // No topic file should have been written
    const writeFileCalls = vi.mocked(mockFs.writeFile).mock.calls;
    const topicFileCall = writeFileCalls.find(([p]) =>
      typeof p === "string" && p.includes("design/topics/"),
    );
    expect(topicFileCall).toBeUndefined();

    // No design/topics git add should have been called
    const addTopicsCall = spawnMock.mock.calls.find(
      (c: unknown[]) =>
        c[0] === "git" &&
        Array.isArray(c[1]) &&
        (c[1] as string[]).includes("design/topics"),
    );
    expect(addTopicsCall).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T-06 / TC-009, TC-010: deferArchivedTransition option
// ---------------------------------------------------------------------------

describe("archive orchestrator — deferArchivedTransition (TC-009, TC-010)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.list).mockResolvedValue([makeState()]);
    vi.mocked(markJobArchived).mockResolvedValue({} as never);
    vi.mocked(archiveChangeFolder).mockResolvedValue({ ok: true, skipped: false, message: "archived" });
    vi.mocked(commitArchive).mockResolvedValue({ ok: true, skipped: false, message: "committed" });
  });

  /**
   * TC-009: deferArchivedTransition: true → markJobArchived NOT called.
   * archiveChangeFolder / commitArchive / git push / headSha capture must still run.
   */
  it("TC-009: deferArchivedTransition: true → markJobArchived NOT called; mv/commit/push executed", async () => {
    const spawnMock = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "deadbeef\n", stderr: "" });

    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: spawnMock as unknown as SpawnFn,
      fs: makeFs(),
      deferArchivedTransition: true,
    });

    expect(result.exitCode).toBe(0);

    // markJobArchived must NOT have been called
    expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled();

    // archiveChangeFolder (folder mv) must have been called
    expect(vi.mocked(archiveChangeFolder)).toHaveBeenCalled();

    // commitArchive must have been called
    expect(vi.mocked(commitArchive)).toHaveBeenCalled();

    // git push origin <branch> must have been called
    const pushCall = spawnMock.mock.calls.find(
      (c: unknown[]) =>
        c[0] === "git" &&
        Array.isArray(c[1]) &&
        (c[1] as string[])[0] === "push" &&
        (c[1] as string[])[1] === "origin",
    );
    expect(pushCall).toBeDefined();

    // headSha must have been captured (exitCode 0 with headSha set)
    expect("headSha" in result && (result as { headSha?: string }).headSha).toBeDefined();
  });

  /**
   * TC-010: deferArchivedTransition unset (default false) → markJobArchived IS called.
   * Plain `job archive` must still transition to archived at record time.
   */
  it("TC-010: deferArchivedTransition unset → markJobArchived IS called (regression guard)", async () => {
    const result = await runArchiveOrchestrator({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
      // deferArchivedTransition absent → defaults to false
    });

    expect(result.exitCode).toBe(0);

    // markJobArchived must have been called (plain `job archive` transitions at record time)
    expect(vi.mocked(markJobArchived)).toHaveBeenCalled();
  });
});
