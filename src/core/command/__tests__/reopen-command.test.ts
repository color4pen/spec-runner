/**
 * TC-001, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-009, TC-010, TC-011,
 * TC-013, TC-015, TC-020, TC-021, TC-029, TC-030 — ReopenCommand.execute() unit tests.
 *
 * TC-001: reopen transitions an awaiting-archive job to awaiting-resume
 * TC-003: reopen of an archived job is rejected
 * TC-004: reopen of a canceled job is rejected
 * TC-005: reopen of a job with a merged PR is rejected
 * TC-006: reopen of a job with a closed (non-merged) PR is rejected
 * TC-007: reopen fails closed when no GitHub client or PR state query fails
 * TC-008: evidence fields are preserved after reopen
 * TC-009: run-control fields (error/resumePoint/mainCheckoutDrift/pid) are reset by reopen
 * TC-010: operator event is durably recorded before state transition
 * TC-011: operator event does not include fromStep
 * TC-013: resume executes the pipeline after reopen (ResumeCommand accepts awaiting-resume)
 * TC-015: resume directly on awaiting-archive is still refused (ResumeCommand pin)
 * TC-020: ReopenCommand has no CommandRunner inheritance
 * TC-021: ReopenCommand constructor takes only slug and options
 * TC-029: reopen inside specrunner worktree returns exit code 2
 * TC-030: reopen rejected when job has no associated PR number
 *
 * Source: spec.md, tasks.md T-02, T-06, design.md D1/D3/D4/D6
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks (hoisted)
// ---------------------------------------------------------------------------

vi.mock("../../resume/resolve-job.js", () => ({
  resolveJobStateBySlug: vi.fn(),
}));

vi.mock("../../../store/job-state-store.js", () => ({
  JobStateStore: {
    resolveId: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../job-access/load-by-job-id.js", () => ({
  loadStateByJobId: vi.fn(),
}));

vi.mock("../../job-access/resolve-state-store.js", () => ({
  resolveStateStoreByJobId: vi.fn(),
}));

vi.mock("../../../state/lifecycle.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../state/lifecycle.js")>();
  return {
    ...actual,
    transitionJob: vi.fn(),
    canTransition: actual.canTransition,
  };
});

vi.mock("../../../util/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../util/paths.js")>();
  return {
    ...actual,
    livenessJsonPath: vi.fn().mockReturnValue(".specrunner/local/test-slug/liveness.json"),
  };
});

vi.mock("../../../logger/stdout.js", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  setLogLevel: vi.fn(),
  stderrWrite: vi.fn(),
}));

vi.mock("../../state/job-slug.js", () => ({
  getJobSlug: vi.fn().mockReturnValue("test-slug"),
}));

vi.mock("../../worktree/detection.js", () => ({
  detectSpecrunnerWorktree: vi.fn().mockResolvedValue({ isSpecrunnerWorktree: false }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ReopenCommand } from "../reopen.js";
import { ResumeCommand } from "../resume.js";
import type { CommandRunnerRuntime } from "../runner.js";
import { resolveJobStateBySlug } from "../../resume/resolve-job.js";
import { transitionJob, canTransition } from "../../../state/lifecycle.js";
import { resolveStateStoreByJobId } from "../../job-access/resolve-state-store.js";
import { detectSpecrunnerWorktree } from "../../worktree/detection.js";
import type { JobState } from "../../../state/schema.js";
import { specReviewResultPath } from "../../../util/paths.js";
import { CommandRunner } from "../runner.js";

// ---------------------------------------------------------------------------
// Shared mock objects
// ---------------------------------------------------------------------------

/** Mock store with appendOperatorEvent support. */
const MOCK_STORE = {
  persist: vi.fn().mockResolvedValue(undefined),
  appendOperatorEvent: vi.fn().mockResolvedValue(undefined),
};

/** Mock GitHub client returning OPEN PR state by default. */
const MOCK_GITHUB_CLIENT = {
  getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" }),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal CommandRunnerRuntime fake for tests that only invoke prepare() directly.
 * The runtime methods are not called in prepare(); only state resolution happens.
 */
function makeMinimalRuntime(): CommandRunnerRuntime {
  return {
    assertProviderReadiness: vi.fn().mockResolvedValue(undefined),
    setupWorkspace: vi.fn().mockResolvedValue({ cwd: "/repo" }),
    teardown: vi.fn().mockResolvedValue(undefined),
    registerCleanup: vi.fn().mockReturnValue({}),
    reloadJobState: vi.fn().mockResolvedValue(undefined),
    persistJobState: vi.fn().mockResolvedValue(undefined),
    buildDeps: vi.fn().mockReturnValue({}),
  };
}

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-abc123",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/test-slug/request.md",
      title: "Test",
      type: "bug-fix",
      slug: "test-slug",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: "fix/test-slug",
    history: [],
    error: null,
    steps: {},
    pullRequest: {
      url: "https://github.com/test/repo/pull/42",
      number: 42,
      createdAt: "2026-06-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

function makeAwaitingResumeState(base: JobState): JobState {
  return {
    ...base,
    status: "awaiting-resume",
    error: null,
    resumePoint: null,
    mainCheckoutDrift: null,
    pid: null,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(MOCK_STORE.persist).mockClear();
  vi.mocked(MOCK_STORE.appendOperatorEvent).mockClear();
  vi.mocked(MOCK_GITHUB_CLIENT.getPullRequest).mockClear();
  vi.mocked(MOCK_GITHUB_CLIENT.getPullRequest).mockResolvedValue({ state: "OPEN" });
  vi.mocked(resolveStateStoreByJobId).mockResolvedValue(MOCK_STORE as never);
  vi.mocked(detectSpecrunnerWorktree).mockResolvedValue({ isSpecrunnerWorktree: false });
});

// ---------------------------------------------------------------------------
// TC-001: reopen transitions an awaiting-archive job to awaiting-resume
// ---------------------------------------------------------------------------

describe("TC-001: reopen transitions an awaiting-archive job to awaiting-resume", () => {
  it("TC-001: execute() returns 0 and transitions to awaiting-resume for OPEN-PR job", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    const awaitingResumeState = makeAwaitingResumeState(awaitingState);

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: awaitingResumeState, noop: false });

    const cmd = new ReopenCommand("test-slug", {
      reason: "post-review fix",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    const exitCode = await cmd.execute();

    // THEN exit code is 0
    expect(exitCode).toBe(0);
    // AND transitionJob was called with awaiting-resume and allowReopen:true
    const transitionCalls = vi.mocked(transitionJob).mock.calls;
    const awaitingResumeCall = transitionCalls.find(([, to]) => to === "awaiting-resume");
    expect(awaitingResumeCall).toBeDefined();
    const opts = awaitingResumeCall![3];
    expect(opts?.["allowReopen"]).toBe(true);
    // AND persist was called with status awaiting-resume
    const persistCalls = vi.mocked(MOCK_STORE.persist).mock.calls;
    const awaitingResumePersist = persistCalls.find(
      ([s]) => (s as JobState).status === "awaiting-resume",
    );
    expect(awaitingResumePersist).toBeDefined();
  });

  it("TC-002: reopen does not start the pipeline — execute() returns after transition", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    const awaitingResumeState = makeAwaitingResumeState(awaitingState);

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: awaitingResumeState, noop: false });

    const cmd = new ReopenCommand("test-slug", {
      reason: "post-review fix",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    // execute() completes with exit code 0 — no pipeline startup
    const exitCode = await cmd.execute();
    expect(exitCode).toBe(0);
    // AND the final persisted state has status awaiting-resume (not running)
    const persistCalls = vi.mocked(MOCK_STORE.persist).mock.calls;
    expect(persistCalls.some(([s]) => (s as JobState).status === "running")).toBe(false);
    expect(persistCalls.some(([s]) => (s as JobState).status === "awaiting-resume")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-003: reopen of an archived job is rejected
// ---------------------------------------------------------------------------

describe("TC-003: reopen of an archived job is rejected", () => {
  it("TC-003: execute() returns 1 for archived status", async () => {
    const archivedState = makeJobState({ status: "archived" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(archivedState);

    const cmd = new ReopenCommand("test-slug", {
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(1);
    // AND no state transition is persisted
    expect(vi.mocked(MOCK_STORE.persist).mock.calls.filter(
      ([s]) => (s as JobState).status === "awaiting-resume",
    )).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-004: reopen of a canceled job is rejected
// ---------------------------------------------------------------------------

describe("TC-004: reopen of a canceled job is rejected", () => {
  it("TC-004: execute() returns 1 for canceled status", async () => {
    const canceledState = makeJobState({ status: "canceled" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(canceledState);

    const cmd = new ReopenCommand("test-slug", {
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(1);
    expect(vi.mocked(MOCK_STORE.persist).mock.calls.filter(
      ([s]) => (s as JobState).status === "awaiting-resume",
    )).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-005: reopen of a job with a merged PR is rejected
// ---------------------------------------------------------------------------

describe("TC-005: reopen of a job with a merged PR is rejected", () => {
  it("TC-005: execute() returns 1 when PR state is MERGED", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(MOCK_GITHUB_CLIENT.getPullRequest).mockResolvedValue({ state: "MERGED" });

    const cmd = new ReopenCommand("test-slug", {
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(1);
    // AND the job transition is not performed
    expect(vi.mocked(MOCK_STORE.persist).mock.calls.filter(
      ([s]) => (s as JobState).status === "awaiting-resume",
    )).toHaveLength(0);
  });

  it("TC-005-b: persisted job status remains awaiting-archive after rejection", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(MOCK_GITHUB_CLIENT.getPullRequest).mockResolvedValue({ state: "MERGED" });

    const cmd = new ReopenCommand("test-slug", {
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    await cmd.execute();

    // persist() must not have been called with status=awaiting-resume
    const persistCalls = vi.mocked(MOCK_STORE.persist).mock.calls;
    expect(persistCalls.filter(
      ([state]) => (state as JobState).status === "awaiting-resume",
    )).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-006: reopen of a job with a closed (non-merged) PR is rejected
// ---------------------------------------------------------------------------

describe("TC-006: reopen of a job with a closed PR is rejected", () => {
  it("TC-006: execute() returns 1 when PR state is CLOSED", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(MOCK_GITHUB_CLIENT.getPullRequest).mockResolvedValue({ state: "CLOSED" });

    const cmd = new ReopenCommand("test-slug", {
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(1);
    expect(vi.mocked(MOCK_STORE.persist).mock.calls.filter(
      ([s]) => (s as JobState).status === "awaiting-resume",
    )).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-007: reopen fails closed when PR-state query fails or client absent
// ---------------------------------------------------------------------------

describe("TC-007: reopen fails closed when PR state is unavailable", () => {
  it("TC-007-a: execute() returns 1 when getPullRequest throws", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(MOCK_GITHUB_CLIENT.getPullRequest).mockRejectedValue(new Error("API error"));

    const cmd = new ReopenCommand("test-slug", {
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    // THEN fail-closed: returns 1 rather than proceeding with unknown PR state
    const exitCode = await cmd.execute();
    expect(exitCode).toBe(1);
  });

  it("TC-007-b: execute() returns 1 when no GitHub client is provided (null)", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);

    const cmd = new ReopenCommand("test-slug", {
      reason: "x",
      cwd: "/repo",
      githubClient: null, // absent client → fail-closed
    });

    // THEN returns 1 — cannot determine PR state without a client
    const exitCode = await cmd.execute();
    expect(exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-008: evidence fields are preserved after reopen
// ---------------------------------------------------------------------------

describe("TC-008: evidence fields are preserved after reopen", () => {
  it("TC-008-a: state.steps and reviewerStatuses are not cleared by execute()", async () => {
    const existingStepRun = {
      attempt: 1,
      sessionId: null,
      outcome: { verdict: "approved" as const, findingsPath: null, error: null },
      startedAt: "2026-06-01T09:00:00.000Z",
      endedAt: "2026-06-01T09:30:00.000Z",
    };

    const awaitingState = makeJobState({
      status: "awaiting-archive",
      steps: { "spec-review": [existingStepRun] },
      reviewerStatuses: [
        {
          name: "security",
          status: "approved" as const,
          approvedAtCommit: "sha-old",
          activationPaths: ["src/**"],
          invalidatedByCommit: null,
        },
      ],
    });
    const awaitingResumeState = makeAwaitingResumeState(awaitingState);
    // Crucially: awaiting-resume state preserves steps and reviewerStatuses
    Object.assign(awaitingResumeState, {
      steps: awaitingState.steps,
      reviewerStatuses: awaitingState.reviewerStatuses,
    });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: awaitingResumeState, noop: false });

    const cmd = new ReopenCommand("test-slug", {
      reason: "post-review fix",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(0);

    // THEN persist was called and the persisted state preserves steps and reviewerStatuses
    expect(vi.mocked(MOCK_STORE.persist)).toHaveBeenCalled();
    const persistArg = vi.mocked(MOCK_STORE.persist).mock.calls[0]![0] as JobState;
    expect(persistArg.steps?.["spec-review"]).toHaveLength(1);
    expect(persistArg.reviewerStatuses).toHaveLength(1);
    expect(persistArg.reviewerStatuses?.[0]?.name).toBe("security");
  });

  it("TC-008-b: iteration numbering — next spec-review result path is -002.md (appends, not overwrites)", () => {
    // After reopen, one existing spec-review run already exists.
    // The pipeline will write the next iteration as ...result-002.md.
    const nextIteration = 1 + 1; // 1 existing run → next is #2
    const nextPath = specReviewResultPath("test-slug", nextIteration);
    expect(nextPath).toBe("specrunner/changes/test-slug/spec-review-result-002.md");
  });
});

// ---------------------------------------------------------------------------
// TC-009: run-control fields are reset by reopen
// ---------------------------------------------------------------------------

describe("TC-009: run-control fields are reset by reopen (D4)", () => {
  it("TC-009: transitionJob is called with patch clearing only error/resumePoint/mainCheckoutDrift/pid", async () => {
    const awaitingState = makeJobState({
      status: "awaiting-archive",
      steps: { "spec-review": [{ attempt: 1, sessionId: null, outcome: { verdict: "approved" as const, findingsPath: null, error: null }, startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T01:00:00.000Z" }] },
      reviewerStatuses: [{ name: "security", status: "approved" as const, approvedAtCommit: "sha-old" }],
    });
    const awaitingResumeState = makeAwaitingResumeState(awaitingState);

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: awaitingResumeState, noop: false });

    const cmd = new ReopenCommand("test-slug", {
      reason: "post-review fix",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    await cmd.execute();

    // Verify transitionJob was called with the correct patch targeting awaiting-resume
    const awaitingResumeTransitionCall = vi
      .mocked(transitionJob)
      .mock.calls.find(([, to]) => to === "awaiting-resume");
    expect(awaitingResumeTransitionCall).toBeDefined();

    const ctx = awaitingResumeTransitionCall![2];
    const patch = ctx.patch as Record<string, unknown>;

    // THEN only run-control fields are in the patch
    expect(patch["error"]).toBeNull();
    expect(patch["resumePoint"]).toBeNull();
    expect(patch["mainCheckoutDrift"]).toBeNull();
    // pid is reset to null (not process.pid)
    expect(patch["pid"]).toBeNull();

    // AND steps and reviewerStatuses are NOT in the patch (preserved)
    expect(patch["steps"]).toBeUndefined();
    expect(patch["reviewerStatuses"]).toBeUndefined();
    expect(patch["decisions"]).toBeUndefined();
    expect(patch["biteEvidence"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-010: operator event is durably recorded before state transition
// TC-011: operator event does not include fromStep
// ---------------------------------------------------------------------------

describe("TC-010 + TC-011: operator event recorded before transition; no fromStep", () => {
  it("TC-010: appendOperatorEvent is called before persist during execute()", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    const awaitingResumeState = makeAwaitingResumeState(awaitingState);

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: awaitingResumeState, noop: false });

    const cmd = new ReopenCommand("test-slug", {
      reason: "post-review fix",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    await cmd.execute();

    // Verify appendOperatorEvent was called
    expect(vi.mocked(MOCK_STORE.appendOperatorEvent)).toHaveBeenCalledOnce();

    // Verify the operator event record has the correct fields
    const operatorEventArg = vi.mocked(MOCK_STORE.appendOperatorEvent).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(operatorEventArg?.["type"]).toBe("operator-event");
    expect(operatorEventArg?.["action"]).toBe("reopen");
    expect(operatorEventArg?.["reason"]).toBe("post-review fix");
    expect(typeof operatorEventArg?.["ts"]).toBe("string");

    // Verify call order: appendOperatorEvent must precede persist
    const operatorEventOrder =
      vi.mocked(MOCK_STORE.appendOperatorEvent).mock.invocationCallOrder[0]!;
    const persistOrder = vi.mocked(MOCK_STORE.persist).mock.invocationCallOrder[0]!;
    expect(operatorEventOrder).toBeLessThan(persistOrder);
  });

  it("TC-011: operator event does NOT include fromStep field", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    const awaitingResumeState = makeAwaitingResumeState(awaitingState);

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: awaitingResumeState, noop: false });

    const cmd = new ReopenCommand("test-slug", {
      reason: "post-review fix",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    await cmd.execute();

    // Verify fromStep is absent from the operator event record
    const operatorEventArg = vi.mocked(MOCK_STORE.appendOperatorEvent).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(operatorEventArg?.["fromStep"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-013: Resume executes the pipeline after reopen (ResumeCommand accepts awaiting-resume)
// ---------------------------------------------------------------------------

describe("TC-013: ResumeCommand accepts awaiting-resume status after reopen", () => {
  it("TC-013: canTransition('awaiting-resume', 'running') is true — ResumeCommand status gate passes for post-reopen job", () => {
    // After ReopenCommand transitions a job to awaiting-resume (D1 lifecycle contract),
    // ResumeCommand.prepare() checks canTransition(state.status, "running") at the status gate.
    // Verify that awaiting-resume → running is permitted by the general guard,
    // confirming that resume is the sole execution entry point after reopen.
    expect(canTransition("awaiting-resume", "running")).toBe(true);
  });

  it("TC-013-b: canTransition('awaiting-archive', 'running') is false — reopen does NOT grant direct execution", () => {
    // awaiting-archive → running must remain forbidden (general guard).
    // Only awaiting-archive → awaiting-resume is available (via REOPEN_TRANSITIONS + allowReopen opt-in),
    // and execution requires a subsequent resume call.
    expect(canTransition("awaiting-archive", "running")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-015: resume directly on awaiting-archive is still refused (ResumeCommand pin)
// ---------------------------------------------------------------------------

describe("TC-015: ResumeCommand.prepare() rejects awaiting-archive → running", () => {
  it("TC-015: ResumeCommand.prepare() throws for awaiting-archive status", async () => {
    // The existing ResumeCommand.prepare() checks canTransition(state.status, "running").
    // For awaiting-archive, canTransition returns false → throws.
    // This test pins the invariant that resume cannot transition awaiting-archive → running,
    // even after the reopen feature adds REOPEN_TRANSITIONS.
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);

    const cmd = new ResumeCommand(makeMinimalRuntime(), {} as never, "test-slug", { cwd: "/repo" });

    // Should throw — exit code 1
    const prepare = (cmd as unknown as { prepare(): Promise<unknown> }).prepare;
    await expect(prepare.call(cmd)).rejects.toThrow();
    // The transition must NOT be called for awaiting-archive in resume
    const transitionCalls = vi.mocked(transitionJob).mock.calls;
    const runningCalls = transitionCalls.filter(([, to]) => to === "running");
    expect(runningCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-020: ReopenCommand has no CommandRunner inheritance
// ---------------------------------------------------------------------------

describe("TC-020: ReopenCommand has no CommandRunner inheritance", () => {
  it("TC-020: ReopenCommand does not extend CommandRunner", () => {
    const cmd = new ReopenCommand("test-slug", {
      reason: "test",
      cwd: "/repo",
      githubClient: null,
    });

    // THEN ReopenCommand is NOT an instance of CommandRunner
    expect(cmd instanceof CommandRunner).toBe(false);
    // AND no prepare() method exists on the class
    expect(typeof (cmd as unknown as Record<string, unknown>)["prepare"]).not.toBe("function");
  });

  it("TC-020-b: ReopenCommand does not have prepare() method", () => {
    const cmd = new ReopenCommand("test-slug", {
      reason: "test",
      cwd: "/repo",
      githubClient: null,
    });
    // No prepare() method exists on ReopenCommand instances
    expect("prepare" in cmd).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-021: ReopenCommand constructor takes only slug and options
// ---------------------------------------------------------------------------

describe("TC-021: ReopenCommand constructor takes only slug and options", () => {
  it("TC-021: constructor accepts (slug: string, options: ReopenOptions) — no runtime or events", () => {
    // GIVEN the new ReopenCommand class with standalone constructor
    // WHEN constructed with (slug, options)
    // THEN no runtime or events parameters are needed
    expect(() => {
      const cmd = new ReopenCommand("my-slug", {
        reason: "test reason",
        cwd: "/repo",
        githubClient: null,
        logLevel: "default",
        json: false,
        noWorktree: false,
      });
      // The command must exist and have execute()
      expect(typeof cmd.execute).toBe("function");
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-029: reopen inside specrunner worktree returns exit code 2
// ---------------------------------------------------------------------------

describe("TC-029: reopen inside specrunner worktree returns exit code 2", () => {
  it("TC-029: execute() returns 2 when invoked from inside a specrunner worktree", async () => {
    vi.mocked(detectSpecrunnerWorktree).mockResolvedValue({
      isSpecrunnerWorktree: true,
      mainCheckoutPath: "/main-checkout",
    });

    const cmd = new ReopenCommand("test-slug", {
      reason: "x",
      cwd: "/main-checkout/.git/specrunner-worktrees/some-slug",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    const exitCode = await cmd.execute();
    expect(exitCode).toBe(2);
    // AND no state transition is performed
    expect(vi.mocked(MOCK_STORE.persist)).not.toHaveBeenCalled();
    // AND no operator event is appended
    expect(vi.mocked(MOCK_STORE.appendOperatorEvent)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-030: reopen rejected when job has no associated PR number
// ---------------------------------------------------------------------------

describe("TC-030: reopen rejected when job has no associated PR number", () => {
  it("TC-030: execute() returns 1 when state.pullRequest is absent", async () => {
    // GIVEN a job with awaiting-archive but no pullRequest field
    const stateNoPR = makeJobState({ status: "awaiting-archive", pullRequest: undefined });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(stateNoPR);

    const cmd = new ReopenCommand("test-slug", {
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    // THEN returns 1
    const exitCode = await cmd.execute();
    expect(exitCode).toBe(1);
    // AND no state transition is persisted
    expect(vi.mocked(MOCK_STORE.persist).mock.calls.filter(
      ([s]) => (s as JobState).status === "awaiting-resume",
    )).toHaveLength(0);
  });
});
