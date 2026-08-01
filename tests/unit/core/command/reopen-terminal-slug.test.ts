/**
 * Unit tests for the terminal-only slug path in ReopenCommand.prepare().
 *
 * TC-RS-001: terminal-only slug → logError + ReopenCommand.execute() returns 1
 *   (spec.md > reopen terminal-only slug path > Scenario: terminal-only slug is rejected with status gate message)
 * TC-RS-002: terminal-only slug with newest updatedAt → correct status shown in error message
 *   (spec.md > reopen terminal-only slug path > Scenario: newest terminal job status is shown)
 * TC-RS-003: multiple terminal jobs → newest-by-updatedAt status is shown in error
 *   (spec.md > reopen terminal-only slug path > Scenario: multiple terminal jobs, newest is shown)
 *
 * Source: spec.md, tasks.md (reopen path fix)
 *
 * These tests cover the new code block in ReopenCommand.prepare() that is reached when
 * resolveJobStateBySlug returns null (all matching jobs are terminal) and
 * JobStateStore.list(cwd, { includeArchived: true }) returns terminal jobs for the slug.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { JobState } from "../../../../src/state/schema.js";
import type { RuntimeStrategy } from "../../../../src/core/port/runtime-strategy.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";

// ---------------------------------------------------------------------------
// Hoist mocks
// ---------------------------------------------------------------------------

const mockList = vi.hoisted(() => vi.fn());
const mockResolveJobStateBySlug = vi.hoisted(() => vi.fn());
const mockDetectSpecrunnerWorktree = vi.hoisted(() => vi.fn());

vi.mock("../../../../src/core/worktree/detection.js", () => ({
  detectSpecrunnerWorktree: mockDetectSpecrunnerWorktree,
}));

vi.mock("../../../../src/core/resume/resolve-job.js", () => ({
  resolveJobStateBySlug: mockResolveJobStateBySlug,
}));

vi.mock("../../../../src/store/job-state-store.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../src/store/job-state-store.js")>();
  return {
    ...original,
    JobStateStore: class MockJobStateStore extends original.JobStateStore {
      static override list = mockList;
    },
  };
});

// Suppress log output in tests
vi.mock("../../../../src/logger/stdout.js", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  stderrWrite: vi.fn(),
  stdoutWrite: vi.fn(),
  setLogLevel: vi.fn(),
  initVerboseLog: vi.fn(),
  closeVerboseLog: vi.fn(),
  getVerboseLogFilePath: vi.fn().mockReturnValue(null),
  isLevelEnabled: vi.fn().mockReturnValue(false),
  resolveLogLevel: vi.fn().mockReturnValue("default"),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTerminalJobState(
  status: JobState["status"],
  slug: string,
  updatedAt = "2026-01-01T00:00:00.000Z",
): JobState {
  return {
    version: 1,
    jobId: `job-${slug.slice(0, 8)}-${Math.random().toString(16).slice(2, 10)}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
    request: {
      path: `/fake/repo/specrunner/changes/${slug}/request.md`,
      title: "Test",
      type: "new-feature",
      slug,
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "implementer",
    status,
    branch: null,
    error: null,
    history: [],
    steps: {},
  } as JobState;
}

/** Minimal fake RuntimeStrategy — no assertProviderReadiness so the gate is skipped */
const fakeRuntime: RuntimeStrategy = {} as RuntimeStrategy;

const SLUG = "test-reopen-slug";
const FAKE_CWD = "/fake/cwd";

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  // Default: not inside a worktree
  mockDetectSpecrunnerWorktree.mockResolvedValue({ isSpecrunnerWorktree: false });
  // Default: no non-terminal job found by slug (terminal-only scenario)
  mockResolveJobStateBySlug.mockResolvedValue(null);
  // Default: one canceled job for the slug
  mockList.mockResolvedValue([makeTerminalJobState("canceled", SLUG)]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-RS-001: terminal-only slug → execute() returns 1
// ---------------------------------------------------------------------------

describe("TC-RS-001: ReopenCommand returns exit code 1 for terminal-only slug", () => {
  it("execute() returns 1 when the slug has only a terminal job", async () => {
    const { ReopenCommand } = await import("../../../../src/core/command/reopen.js");
    const cmd = new ReopenCommand(fakeRuntime, new EventBus(), SLUG, {
      from: "implementer",
      reason: "test",
      githubClient: null,
      cwd: FAKE_CWD,
    });

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(1);
  });

  it("does NOT throw when the slug has only a terminal job", async () => {
    const { ReopenCommand } = await import("../../../../src/core/command/reopen.js");
    const cmd = new ReopenCommand(fakeRuntime, new EventBus(), SLUG, {
      from: "implementer",
      reason: "test",
      githubClient: null,
      cwd: FAKE_CWD,
    });

    await expect(cmd.execute()).resolves.toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-RS-002: terminal slug with status "canceled" → status shown in error
// ---------------------------------------------------------------------------

describe("TC-RS-002: terminal slug with canceled job shows that status in error", () => {
  it("calls logError mentioning the terminal status when slug has only a canceled job", async () => {
    const { logError } = await import("../../../../src/logger/stdout.js");
    mockList.mockResolvedValue([makeTerminalJobState("canceled", SLUG)]);

    const { ReopenCommand } = await import("../../../../src/core/command/reopen.js");
    const cmd = new ReopenCommand(fakeRuntime, new EventBus(), SLUG, {
      from: "implementer",
      reason: "test",
      githubClient: null,
      cwd: FAKE_CWD,
    });

    await cmd.execute();

    expect(vi.mocked(logError)).toHaveBeenCalledWith(
      expect.stringContaining("canceled"),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-RS-003: multiple terminal jobs → newest-by-updatedAt status is shown
// ---------------------------------------------------------------------------

describe("TC-RS-003: multiple terminal jobs — newest-by-updatedAt is shown in error", () => {
  it("shows the status of the job with the newest updatedAt", async () => {
    const { logError } = await import("../../../../src/logger/stdout.js");

    const olderArchived = makeTerminalJobState("archived", SLUG, "2026-01-01T00:00:00.000Z");
    const newerCanceled = makeTerminalJobState("canceled", SLUG, "2026-06-01T00:00:00.000Z");
    mockList.mockResolvedValue([olderArchived, newerCanceled]);

    const { ReopenCommand } = await import("../../../../src/core/command/reopen.js");
    const cmd = new ReopenCommand(fakeRuntime, new EventBus(), SLUG, {
      from: "implementer",
      reason: "test",
      githubClient: null,
      cwd: FAKE_CWD,
    });

    await cmd.execute();

    // The newest job (canceled, 2026-06-01) should be the one whose status is shown
    expect(vi.mocked(logError)).toHaveBeenCalledWith(
      expect.stringContaining("canceled"),
    );
  });

  it("returns exit code 1 regardless of how many terminal jobs exist", async () => {
    const jobs = [
      makeTerminalJobState("archived", SLUG, "2026-01-01T00:00:00.000Z"),
      makeTerminalJobState("canceled", SLUG, "2026-06-01T00:00:00.000Z"),
      makeTerminalJobState("archived", SLUG, "2026-03-01T00:00:00.000Z"),
    ];
    mockList.mockResolvedValue(jobs);

    const { ReopenCommand } = await import("../../../../src/core/command/reopen.js");
    const cmd = new ReopenCommand(fakeRuntime, new EventBus(), SLUG, {
      from: "implementer",
      reason: "test",
      githubClient: null,
      cwd: FAKE_CWD,
    });

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(1);
  });
});
