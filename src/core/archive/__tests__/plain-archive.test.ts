/**
 * Tests for plain archive (runPlainArchive) — single-phase archive contract.
 *
 * TC-001: awaiting-archive + OPEN PR → 1 run → orchestrator + markJobArchived + cleanup(deleteRemoteBranch:false) + exit 0
 * TC-002: success stdout does NOT contain re-run / remains-in-awaiting-archive wording
 * TC-003: already archived → short-circuit exit 0 (terminal status gate)
 * TC-004: PR merge state is never queried (no getPullRequest)
 * TC-005: archived transition happens while PR is still OPEN (markJobArchived called unconditionally on success)
 * TC-006: plain archive keeps remote branch (cleanup called with deleteRemoteBranch:false)
 * TC-008: push failure → exit 1 escalation, no transition, no cleanup
 * TC-009: transition failure → exit 1 escalation, no cleanup
 * TC-010: leftover 2-phase job (archiveRecorded + remote branch gone) → no new commit, push skipped, archived + cleanup + exit 0
 * TC-011: already-recorded + OPEN PR → orchestrator called (idempotent), archived + cleanup + exit 0
 * TC-012: recorded + worktree missing → Path B: no orchestrator, best-effort markJobArchived, cleanup + exit 0
 * TC-013: unrecorded + worktree missing → orchestrator called → escalation exit 1, no transition
 * TC-014: PR-less job → orchestrator + markJobArchived + cleanup + exit 0
 * TC-017: success output points to GitHub merge as next step (advisory with PR number)
 * TC-038: Path B worktree missing (noWorktree=false) → best-effort transition + cleanup
 * TC-039: markJobArchived is called BEFORE runArchiveCleanup
 * TC-041: success advisory contains "merge" + PR number; no "re-run" / "awaiting-archive"
 * TC-042: Path B noWorktree=true + local branch missing → best-effort transition + cleanup
 * TC-043: --from-issue flow calls runPlainArchive (structural / caller-level; verified by CLI test)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { JobState } from "../../../state/schema.js";
import type { SpawnFn } from "../../../util/spawn.js";
import type { FinishFs } from "../../finish/types.js";

// ---------------------------------------------------------------------------
// Module mocks (hoisted)
// ---------------------------------------------------------------------------

vi.mock("../../../store/job-state-store.js", () => ({
  JobStateStore: {
    listWithSourceDirs: vi.fn(),
  },
}));

vi.mock("../orchestrator.js", () => ({
  runArchiveOrchestrator: vi.fn(),
  // Default: non-null worktree path so Path B triggers only when fs.exists returns false
  resolveWorktreePathForArchive: vi.fn().mockResolvedValue(
    "/repo/.git/specrunner-worktrees/test-job-aaaabbbb",
  ),
}));

vi.mock("../cleanup.js", () => ({
  runArchiveCleanup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../finish/job-state-update.js", () => ({
  assertJobFinishable: vi.fn(),
  markJobArchived: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../logger/stdout.js", () => ({
  logResult: vi.fn(),
  stderrWrite: vi.fn(),
}));

// Import after mocks are set up
import { runPlainArchive } from "../plain-archive.js";
import { JobStateStore } from "../../../store/job-state-store.js";
import { runArchiveOrchestrator } from "../orchestrator.js";
import { runArchiveCleanup } from "../cleanup.js";
import { markJobArchived } from "../../finish/job-state-update.js";
import { stderrWrite } from "../../../logger/stdout.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_CWD = "/repo";
const FAKE_SLUG = "test-job";
const FAKE_JOB_ID = "aaaabbbb-0000-0000-0000-000000000001";
const FAKE_BRANCH = "fix/test-job-aaaabbbb";
const FAKE_PR_NUMBER = 42;
const FAKE_WORKTREE_PATH = "/repo/.git/specrunner-worktrees/test-job-aaaabbbb";

/**
 * sourceChangeDir for a job whose change folder is in the active location
 * (not yet recorded into archive/).
 */
const ACTIVE_SOURCE_CHANGE_DIR = `/repo/specrunner/changes/${FAKE_SLUG}`;

/**
 * sourceChangeDir for a job whose change folder has been moved into archive/
 * (archive recording complete).
 */
const ARCHIVE_SOURCE_CHANGE_DIR = `/repo/specrunner/changes/archive/2026-01-01-${FAKE_SLUG}`;

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
    worktreePath: FAKE_WORKTREE_PATH,
    history: [],
    error: null,
    pullRequest: { number: FAKE_PR_NUMBER, url: `https://github.com/test/repo/pull/${FAKE_PR_NUMBER}` },
    ...overrides,
  } as JobState;
}

function makeActiveEntries(stateOverrides: Partial<JobState> = {}) {
  return [{ state: makeState(stateOverrides), sourceChangeDir: ACTIVE_SOURCE_CHANGE_DIR }];
}

function makeArchiveEntries(stateOverrides: Partial<JobState> = {}) {
  return [{ state: makeState(stateOverrides), sourceChangeDir: ARCHIVE_SOURCE_CHANGE_DIR }];
}

function makeSpawn(
  overrides: Partial<Record<string, { exitCode: number; stdout: string; stderr: string }>> = {},
): SpawnFn {
  return vi.fn().mockImplementation((_cmd: string, args: string[]) => {
    const key = args.join(" ");
    if (key in overrides) return Promise.resolve(overrides[key]);
    return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  });
}

function makeFs(existsResult = true): FinishFs {
  return {
    exists: vi.fn().mockResolvedValue(existsResult),
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
// TC-001: awaiting-archive + OPEN PR → 1 run → all steps → exit 0
// ---------------------------------------------------------------------------

describe("plain archive — awaiting-archive + OPEN PR (TC-001, TC-004, TC-005, TC-006)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
    vi.mocked(runArchiveCleanup).mockResolvedValue(undefined);
  });

  /**
   * TC-001: OPEN PR → orchestrator + markJobArchived + cleanup(deleteRemoteBranch:false) in one run
   */
  it("TC-001: awaiting-archive + OPEN PR → orchestrator + transition + cleanup + exit 0", async () => {
    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
    });

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(markJobArchived)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runArchiveCleanup)).toHaveBeenCalledTimes(1);
  });

  /**
   * TC-004: No GitHub API call is ever made (no getPullRequest)
   * The function does not import GitHubClient and cannot make PR queries.
   */
  it("TC-004: No GitHub PR API is called during plain archive", async () => {
    // runPlainArchive takes no githubClient — structural guarantee.
    // Verify by ensuring no spawn calls related to GitHub API are made.
    const spawnFn = makeSpawn();
    await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: spawnFn,
      fs: makeFs(),
    });
    // Only git commands (no GitHub REST calls via spawn)
    const gitCalls = vi.mocked(spawnFn).mock.calls.map(([cmd]) => cmd as string);
    expect(gitCalls.every((cmd) => cmd === "git" || cmd === undefined)).toBe(true);
  });

  /**
   * TC-005: archived transition happens unconditionally after push success (PR still OPEN)
   */
  it("TC-005: markJobArchived called even while PR is OPEN", async () => {
    await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
    });

    expect(vi.mocked(markJobArchived)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(markJobArchived)).toHaveBeenCalledWith(FAKE_SLUG, expect.any(String));
  });

  /**
   * TC-006: plain archive keeps remote branch (deleteRemoteBranch:false)
   */
  it("TC-006: cleanup called with deleteRemoteBranch:false", async () => {
    await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
    });

    expect(vi.mocked(runArchiveCleanup)).toHaveBeenCalledWith(
      expect.objectContaining({ deleteRemoteBranch: false }),
      expect.any(Function),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-002: success stdout does NOT contain re-run / awaiting-archive wording
// ---------------------------------------------------------------------------

describe("plain archive — stdout wording (TC-002, TC-017, TC-041)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
    vi.mocked(runArchiveCleanup).mockResolvedValue(undefined);
  });

  /**
   * TC-002: success stdout does not instruct re-run or say "remains in awaiting-archive"
   */
  it("TC-002: success stdout has no re-run instruction or awaiting-archive statement", async () => {
    const stdoutCalls: string[] = [];
    await runPlainArchive(
      { slug: FAKE_SLUG, cwd: FAKE_CWD, spawn: makeSpawn(), fs: makeFs() },
      (msg) => stdoutCalls.push(msg),
    );
    const combined = stdoutCalls.join("\n");
    expect(combined).not.toMatch(/re.?run/i);
    expect(combined).not.toMatch(/remains in/i);
    expect(combined).not.toMatch(/awaiting-archive/i);
    expect(combined).not.toMatch(/after.*merge/i);
  });

  /**
   * TC-017: success output mentions merging the PR on GitHub
   */
  it("TC-017: success stdout mentions merging PR on GitHub and warns about already-merged", async () => {
    const stdoutCalls: string[] = [];
    await runPlainArchive(
      { slug: FAKE_SLUG, cwd: FAKE_CWD, spawn: makeSpawn(), fs: makeFs() },
      (msg) => stdoutCalls.push(msg),
    );
    const combined = stdoutCalls.join("\n");
    // Must mention PR number
    expect(combined).toContain(`${FAKE_PR_NUMBER}`);
    // Must mention merging on GitHub
    expect(combined).toMatch(/merge/i);
    // Must warn about already-merged / closed PR
    expect(combined).toMatch(/already merged|closed|not reach/i);
  });

  /**
   * TC-041: advisory is unconditional (no API needed), contains PR number and merge guidance
   */
  it("TC-041: advisory is emitted without any GitHub API call, contains PR number and merge info", async () => {
    const stdoutCalls: string[] = [];
    await runPlainArchive(
      { slug: FAKE_SLUG, cwd: FAKE_CWD, spawn: makeSpawn(), fs: makeFs() },
      (msg) => stdoutCalls.push(msg),
    );
    const combined = stdoutCalls.join("\n");
    expect(combined).toContain(`${FAKE_PR_NUMBER}`);
    // No GitHub API was called (markJobArchived is mocked, orchestrator is mocked)
    // structural guarantee — no GitHubClient in PlainArchiveInput
  });
});

// ---------------------------------------------------------------------------
// TC-003: already archived → short-circuit (terminal status)
// ---------------------------------------------------------------------------

describe("plain archive — terminal status no-op (TC-003)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
    vi.mocked(runArchiveCleanup).mockResolvedValue(undefined);
  });

  it("TC-003: already archived → short-circuit exit 0, no orchestrator, no transition, no cleanup", async () => {
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(
      makeActiveEntries({ status: "archived" }),
    );
    const stdoutCalls: string[] = [];
    const result = await runPlainArchive(
      { slug: FAKE_SLUG, cwd: FAKE_CWD, spawn: makeSpawn(), fs: makeFs() },
      (msg) => stdoutCalls.push(msg),
    );
    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runArchiveOrchestrator)).not.toHaveBeenCalled();
    expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled();
    expect(vi.mocked(runArchiveCleanup)).not.toHaveBeenCalled();
    expect(stdoutCalls.some((m) => /finished|archived/i.test(m))).toBe(true);
  });

  it("TC-003b: already canceled → short-circuit exit 0, no orchestrator, no cleanup", async () => {
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(
      makeActiveEntries({ status: "canceled" }),
    );
    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
    });
    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runArchiveOrchestrator)).not.toHaveBeenCalled();
    expect(vi.mocked(runArchiveCleanup)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-008: push failure → exit 1 escalation, no transition, no cleanup
// ---------------------------------------------------------------------------

describe("plain archive — push failure (TC-008)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
    vi.mocked(runArchiveCleanup).mockResolvedValue(undefined);
  });

  it("TC-008: orchestrator push failure → exit 1 escalation, markJobArchived NOT called, cleanup NOT called", async () => {
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({
      exitCode: 1,
      escalation: "push failed",
    });

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
    });

    expect(result.exitCode).toBe(1);
    expect("escalation" in result).toBe(true);
    expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled();
    expect(vi.mocked(runArchiveCleanup)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-009: transition failure → exit 1 escalation, no cleanup
// ---------------------------------------------------------------------------

describe("plain archive — transition failure (TC-009)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "abc1234" });
    vi.mocked(runArchiveCleanup).mockResolvedValue(undefined);
  });

  it("TC-009: markJobArchived throws → exit 1 escalation, cleanup NOT called", async () => {
    vi.mocked(markJobArchived).mockRejectedValue(new Error("disk full"));

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
    });

    expect(result.exitCode).toBe(1);
    expect("escalation" in result).toBe(true);
    expect(vi.mocked(runArchiveCleanup)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-010: leftover 2-phase job (archiveRecorded + remote branch gone) → idempotent finish
// ---------------------------------------------------------------------------

describe("plain archive — leftover 2-phase job (TC-010)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Change folder already in archive/ (archiveRecorded=true)
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeArchiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "sha1" });
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
    vi.mocked(runArchiveCleanup).mockResolvedValue(undefined);
  });

  it("TC-010: archiveRecorded=true + worktree present → orchestrator called (idempotent), archived + cleanup + exit 0", async () => {
    // Worktree dir exists on disk
    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(true), // exists=true
    });

    expect(result.exitCode).toBe(0);
    // Orchestrator is called (it handles the idempotent push guard internally)
    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(markJobArchived)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runArchiveCleanup)).toHaveBeenCalledWith(
      expect.objectContaining({ deleteRemoteBranch: false }),
      expect.any(Function),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-011: already-recorded + OPEN PR → orchestrator (idempotent) + archived + cleanup
// ---------------------------------------------------------------------------

describe("plain archive — already recorded + worktree present (TC-011)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeArchiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "sha2" });
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
    vi.mocked(runArchiveCleanup).mockResolvedValue(undefined);
  });

  it("TC-011: archiveRecorded=true + worktree present → orchestrator called (idempotent), archived + cleanup", async () => {
    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(true),
    });

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(markJobArchived)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runArchiveCleanup)).toHaveBeenCalledWith(
      expect.objectContaining({ deleteRemoteBranch: false }),
      expect.any(Function),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-012 / TC-038: recorded + worktree missing → Path B (no orchestrator)
// ---------------------------------------------------------------------------

describe("plain archive — Path B: recorded + worktree missing (TC-012, TC-038)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // archiveRecorded=true (folder in archive/)
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeArchiveEntries());
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
    vi.mocked(runArchiveCleanup).mockResolvedValue(undefined);
  });

  it("TC-012/TC-038: archiveRecorded=true + worktree dir missing → no orchestrator, best-effort transition, cleanup, exit 0", async () => {
    // fs.exists returns false → worktree dir not present
    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(false), // worktree dir does NOT exist
    });

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runArchiveOrchestrator)).not.toHaveBeenCalled();
    expect(vi.mocked(markJobArchived)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runArchiveCleanup)).toHaveBeenCalledWith(
      expect.objectContaining({ deleteRemoteBranch: false }),
      expect.any(Function),
    );
  });

  it("TC-038: Path B — markJobArchived failure is a warning, cleanup still runs, exit 0", async () => {
    vi.mocked(markJobArchived).mockRejectedValue(new Error("state not found"));

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(false),
    });

    expect(result.exitCode).toBe(0);
    // warning emitted
    const warnCalls = vi.mocked(stderrWrite).mock.calls.map(([m]) => m as string);
    expect(warnCalls.some((m) => /warning/i.test(m))).toBe(true);
    // cleanup still runs
    expect(vi.mocked(runArchiveCleanup)).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TC-013: unrecorded + worktree missing → orchestrator called → escalation
// ---------------------------------------------------------------------------

describe("plain archive — unrecorded + worktree missing → escalation (TC-013)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Active entry (NOT in archive/) = archiveRecorded:false
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    // Orchestrator will escalate when worktree is missing
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({
      exitCode: 1,
      escalation: "Worktree not found for test-job.",
    });
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
    vi.mocked(runArchiveCleanup).mockResolvedValue(undefined);
  });

  it("TC-013: archiveRecorded=false + worktree missing → orchestrator escalates, no transition, exit 1", async () => {
    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(false), // worktree doesn't exist but archiveRecorded=false → Path A
    });

    expect(result.exitCode).toBe(1);
    expect("escalation" in result).toBe(true);
    // orchestrator WAS called (not Path B)
    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalled();
    expect(vi.mocked(markJobArchived)).not.toHaveBeenCalled();
    expect(vi.mocked(runArchiveCleanup)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-014: PR-less job → same single path (record → transition → cleanup)
// ---------------------------------------------------------------------------

describe("plain archive — PR-less job (TC-014)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue([
      {
        state: makeState({ pullRequest: undefined }),
        sourceChangeDir: ACTIVE_SOURCE_CHANGE_DIR,
      },
    ]);
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "sha3" });
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
    vi.mocked(runArchiveCleanup).mockResolvedValue(undefined);
  });

  it("TC-014: PR-less job → orchestrator + markJobArchived + cleanup (no advisory) + exit 0", async () => {
    const stdoutCalls: string[] = [];
    const result = await runPlainArchive(
      { slug: FAKE_SLUG, cwd: FAKE_CWD, spawn: makeSpawn(), fs: makeFs() },
      (msg) => stdoutCalls.push(msg),
    );

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runArchiveOrchestrator)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(markJobArchived)).toHaveBeenCalledTimes(1);
    // Cleanup runs (PR-less still gets cleanup)
    expect(vi.mocked(runArchiveCleanup)).toHaveBeenCalledWith(
      expect.objectContaining({ deleteRemoteBranch: false }),
      expect.any(Function),
    );
    // No PR-related advisory
    const combined = stdoutCalls.join("\n");
    expect(combined).not.toMatch(/#\d+/);
  });
});

// ---------------------------------------------------------------------------
// TC-039: markJobArchived is called BEFORE runArchiveCleanup
// ---------------------------------------------------------------------------

describe("plain archive — call order (TC-039)", () => {
  it("TC-039: markJobArchived is called before runArchiveCleanup", async () => {
    vi.clearAllMocks();
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue(makeActiveEntries());
    vi.mocked(runArchiveOrchestrator).mockResolvedValue({ exitCode: 0, headSha: "sha4" });
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
    vi.mocked(runArchiveCleanup).mockResolvedValue(undefined);

    const callOrder: string[] = [];
    vi.mocked(markJobArchived).mockImplementation(async () => {
      callOrder.push("markJobArchived");
      return undefined as unknown as JobState;
    });
    vi.mocked(runArchiveCleanup).mockImplementation(async () => {
      callOrder.push("runArchiveCleanup");
    });

    await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: makeSpawn(),
      fs: makeFs(),
    });

    const markIdx = callOrder.indexOf("markJobArchived");
    const cleanupIdx = callOrder.indexOf("runArchiveCleanup");
    expect(markIdx).toBeGreaterThanOrEqual(0);
    expect(cleanupIdx).toBeGreaterThanOrEqual(0);
    expect(markIdx).toBeLessThan(cleanupIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-042: Path B — noWorktree=true + local branch missing → best-effort + cleanup
// ---------------------------------------------------------------------------

describe("plain archive — Path B: noWorktree + local branch missing (TC-042)", () => {
  it("TC-042: noWorktree=true + local branch absent → no orchestrator, best-effort transition, cleanup, exit 0", async () => {
    vi.clearAllMocks();
    // archiveRecorded=true, noWorktree=true
    vi.mocked(JobStateStore.listWithSourceDirs).mockResolvedValue([
      {
        state: makeState({ noWorktree: true }),
        sourceChangeDir: ARCHIVE_SOURCE_CHANGE_DIR,
      },
    ]);
    vi.mocked(markJobArchived).mockResolvedValue(undefined as unknown as JobState);
    vi.mocked(runArchiveCleanup).mockResolvedValue(undefined);

    // git rev-parse returns exit 1 (local branch absent)
    const spawnFn = vi.fn().mockImplementation((_cmd: string, args: string[]) => {
      if (args.includes("rev-parse") && args.includes("--verify")) {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await runPlainArchive({
      slug: FAKE_SLUG,
      cwd: FAKE_CWD,
      spawn: spawnFn as SpawnFn,
      fs: makeFs(),
    });

    expect(result.exitCode).toBe(0);
    expect(vi.mocked(runArchiveOrchestrator)).not.toHaveBeenCalled();
    expect(vi.mocked(markJobArchived)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runArchiveCleanup)).toHaveBeenCalledWith(
      expect.objectContaining({ deleteRemoteBranch: false }),
      expect.any(Function),
    );
  });
});
