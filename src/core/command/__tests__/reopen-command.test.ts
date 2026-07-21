/**
 * TC-001, TC-003, TC-005, TC-006, TC-007, TC-008, TC-013, TC-014, TC-015,
 * TC-018, TC-020, TC-021 — ReopenCommand.prepare() unit tests.
 *
 * NOTE: This file imports from `../reopen.js` which does not exist until T-03
 * is implemented. All tests in this file are intentionally RED until
 * `src/core/command/reopen.ts` is created.
 *
 * TC-001: reopen restarts an awaiting-archive job from the requested step
 * TC-003: resume of an awaiting-archive job is rejected (ResumeCommand pin)
 * TC-005: reopen of a job with a merged PR is rejected
 * TC-006: reopen of an archived job is rejected
 * TC-007: reopen of a canceled job is rejected
 * TC-008: re-run after reopen adds a new iteration without touching prior evidence
 * TC-013: reopen fails closed when no PR is recorded on the job
 * TC-014: reopen rejects when the PR state is CLOSED
 * TC-015: reopen fails closed when PR-state query fails or no GitHub client
 * TC-018: reopen from inside a specrunner worktree is rejected
 * TC-020: transition patch clears only run-control fields
 * TC-021: operator event is appended before the transition is persisted
 *
 * Source: spec.md, tasks.md T-03, design.md D3/D4/D5/D6
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrepareResult } from "../runner.js";

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

vi.mock("../../../parser/request-md.js", () => ({
  parseRequestMd: vi.fn(),
}));

vi.mock("../../../config/store.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../../../state/lifecycle.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../state/lifecycle.js")>();
  return {
    ...actual,
    transitionJob: vi.fn(),
    canTransition: actual.canTransition,
  };
});

vi.mock("../../../util/repo-root.js", () => ({
  resolveRepoRoot: vi.fn().mockResolvedValue(null),
}));

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

vi.mock("../../resume/resolve-step.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../resume/resolve-step.js")>();
  return {
    ...actual,
    resolveResumeStep: vi.fn().mockReturnValue("spec-review"),
    buildAllowedStepSet: vi.fn().mockReturnValue(
      new Set(["spec-review", "implementer", "verification", "code-review", "conformance", "pr-create"]),
    ),
  };
});

vi.mock("../../resume/resolve-request-path.js", () => ({
  resolveRequestPath: vi.fn().mockReturnValue("specrunner/changes/test-slug/request.md"),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

// NOTE: The next line will fail (Cannot find module) until T-03 creates reopen.ts
import { ReopenCommand } from "../reopen.js";
import { ResumeCommand } from "../resume.js";
import { resolveJobStateBySlug } from "../../resume/resolve-job.js";
import { transitionJob } from "../../../state/lifecycle.js";
import { resolveStateStoreByJobId } from "../../job-access/resolve-state-store.js";
import { parseRequestMd } from "../../../parser/request-md.js";
import { loadConfig } from "../../../config/store.js";
import { detectSpecrunnerWorktree } from "../../worktree/detection.js";
import { resolveResumeStep } from "../../resume/resolve-step.js";
import type { JobState } from "../../../state/schema.js";
import { specReviewResultPath } from "../../../util/paths.js";

// ---------------------------------------------------------------------------
// Shared mock objects
// ---------------------------------------------------------------------------

const MOCK_REQUEST = {
  title: "Test request",
  type: "bug-fix",
  slug: "test-slug",
  baseBranch: "main",
  adr: false,
};

const MOCK_CONFIG = {
  version: 1,
  steps: {},
};

/** Mock store with appendOperatorEvent support (T-02). */
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

function makeRuntime() {
  return {} as never;
}

function makeEventBus() {
  return {} as never;
}

/** Access the protected prepare() method via type cast (same pattern as resume tests). */
async function callPrepare(cmd: ReopenCommand): Promise<PrepareResult> {
  return (cmd as unknown as { prepare(): Promise<PrepareResult> }).prepare();
}

/** Access the protected prepare() method on ResumeCommand (for TC-003). */
async function callResumePrepare(cmd: ResumeCommand): Promise<PrepareResult> {
  return (cmd as unknown as { prepare(): Promise<PrepareResult> }).prepare();
}

function makeRunningState(base: JobState): JobState {
  return {
    ...base,
    status: "running",
    error: null,
    resumePoint: null,
    mainCheckoutDrift: null,
    pid: process.pid,
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
  vi.mocked(parseRequestMd).mockResolvedValue(MOCK_REQUEST as never);
  vi.mocked(loadConfig).mockResolvedValue(MOCK_CONFIG as never);
  vi.mocked(detectSpecrunnerWorktree).mockResolvedValue({ isSpecrunnerWorktree: false });
  vi.mocked(resolveResumeStep).mockReturnValue("spec-review");
});

// ---------------------------------------------------------------------------
// TC-001: reopen restarts an awaiting-archive job from the requested step
// ---------------------------------------------------------------------------

describe("TC-001: reopen restarts an awaiting-archive job from the requested step", () => {
  it("TC-001: prepare() returns startStep=spec-review and status=running for OPEN-PR job", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    const runningState = makeRunningState(awaitingState);

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    const cmd = new ReopenCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "spec-review",
      reason: "post-review fix",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    const result = await callPrepare(cmd);

    // THEN job status becomes running
    expect(result.jobState.status).toBe("running");
    // AND pipeline begins from spec-review
    expect(result.startStep).toBe("spec-review");
    // AND no resumeContext is set (reopen is not a resume — no interrupted context)
    expect(result.resumeContext).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-003: resume of an awaiting-archive job is rejected (ResumeCommand pin)
// ---------------------------------------------------------------------------

describe("TC-003: ResumeCommand.prepare() rejects awaiting-archive → running", () => {
  it("TC-003: prepare() throws PrepareError(1) and does not transition the job", async () => {
    // The existing ResumeCommand.prepare() checks canTransition(state.status, "running").
    // For awaiting-archive, canTransition returns false → throws.
    // This test pins the invariant that resume cannot transition awaiting-archive → running,
    // even after the reopen feature adds REOPEN_TRANSITIONS.
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", { cwd: "/repo" });

    // Should throw — exit code 1
    await expect(callResumePrepare(cmd)).rejects.toThrow();
    // The transition must NOT be called for awaiting-archive in resume
    const transitionCalls = vi.mocked(transitionJob).mock.calls;
    const runningCalls = transitionCalls.filter(([, to]) => to === "running");
    expect(runningCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-005: reopen of a job with a merged PR is rejected
// ---------------------------------------------------------------------------

describe("TC-005: reopen of a job with a merged PR is rejected", () => {
  it("TC-005: prepare() throws PrepareError when PR state is MERGED", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(MOCK_GITHUB_CLIENT.getPullRequest).mockResolvedValue({ state: "MERGED" });

    const cmd = new ReopenCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "spec-review",
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    // THEN throws — exit code 1, message indicates merged PR
    await expect(callPrepare(cmd)).rejects.toThrow();
    // AND the job transition is not performed
    expect(vi.mocked(transitionJob).mock.calls.filter(([, to]) => to === "running")).toHaveLength(0);
  });

  it("TC-005-b: persisted job status remains awaiting-archive after rejection", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(MOCK_GITHUB_CLIENT.getPullRequest).mockResolvedValue({ state: "MERGED" });

    const cmd = new ReopenCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "spec-review",
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    try { await callPrepare(cmd); } catch { /* expected */ }

    // persist() must not have been called with status=running
    const persistCalls = vi.mocked(MOCK_STORE.persist).mock.calls;
    const runningPersistCalls = persistCalls.filter(
      ([state]) => (state as JobState).status === "running",
    );
    expect(runningPersistCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-006: reopen of an archived job is rejected
// ---------------------------------------------------------------------------

describe("TC-006: reopen of an archived job is rejected", () => {
  it("TC-006: prepare() throws PrepareError(1) for archived status", async () => {
    const archivedState = makeJobState({ status: "archived" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(archivedState);

    const cmd = new ReopenCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "spec-review",
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    // Archived jobs are non-reopenable — must throw
    await expect(callPrepare(cmd)).rejects.toThrow();
    // AND status remains archived (no persist with running)
    expect(vi.mocked(MOCK_STORE.persist).mock.calls.filter(
      ([s]) => (s as JobState).status === "running",
    )).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-007: reopen of a canceled job is rejected
// ---------------------------------------------------------------------------

describe("TC-007: reopen of a canceled job is rejected", () => {
  it("TC-007: prepare() throws PrepareError(1) for canceled status", async () => {
    const canceledState = makeJobState({ status: "canceled" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(canceledState);

    const cmd = new ReopenCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "spec-review",
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    await expect(callPrepare(cmd)).rejects.toThrow();
    expect(vi.mocked(MOCK_STORE.persist).mock.calls.filter(
      ([s]) => (s as JobState).status === "running",
    )).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-008: re-run after reopen adds a new iteration without touching prior evidence
// ---------------------------------------------------------------------------

describe("TC-008: re-run after reopen preserves prior evidence and appends new iterations", () => {
  it("TC-008-a: state.steps and reviewerStatuses are not cleared by prepare()", async () => {
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
    const runningState = makeRunningState(awaitingState);
    // Crucially: running state preserves steps and reviewerStatuses
    Object.assign(runningState, {
      steps: awaitingState.steps,
      reviewerStatuses: awaitingState.reviewerStatuses,
    });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    const cmd = new ReopenCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "spec-review",
      reason: "post-review fix",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    const result = await callPrepare(cmd);

    // THEN steps are preserved (not cleared)
    expect(result.jobState.steps?.["spec-review"]).toHaveLength(1);
    // AND reviewerStatuses are preserved (not cleared)
    expect(result.jobState.reviewerStatuses).toHaveLength(1);
    expect(result.jobState.reviewerStatuses?.[0]?.name).toBe("security");
  });

  it("TC-008-b: iteration numbering — next spec-review result path is -002.md (appends, not overwrites)", () => {
    // After reopen, one existing spec-review run already exists.
    // The pipeline will write the next iteration as ...result-002.md.
    // Test that the path computation uses the correct iteration number.
    const nextIteration = 1 + 1; // 1 existing run → next is #2
    const nextPath = specReviewResultPath("test-slug", nextIteration);
    expect(nextPath).toBe("specrunner/changes/test-slug/spec-review-result-002.md");
  });
});

// ---------------------------------------------------------------------------
// TC-013: reopen fails closed when no PR is recorded on the job
// ---------------------------------------------------------------------------

describe("TC-013: reopen fails closed when no PR is recorded on the job", () => {
  it("TC-013: prepare() throws PrepareError(1) when state.pullRequest is absent", async () => {
    // GIVEN a job with awaiting-archive but no pullRequest field
    const stateNoPR = makeJobState({ status: "awaiting-archive", pullRequest: undefined });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(stateNoPR);

    const cmd = new ReopenCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "spec-review",
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    // THEN throws with exit code 1
    await expect(callPrepare(cmd)).rejects.toThrow();
    // AND status remains awaiting-archive
    expect(vi.mocked(MOCK_STORE.persist).mock.calls.filter(
      ([s]) => (s as JobState).status === "running",
    )).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-014: reopen rejects when the PR state is CLOSED
// ---------------------------------------------------------------------------

describe("TC-014: reopen rejects when the PR state is CLOSED", () => {
  it("TC-014: prepare() throws PrepareError(1) when PR state is CLOSED", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(MOCK_GITHUB_CLIENT.getPullRequest).mockResolvedValue({ state: "CLOSED" });

    const cmd = new ReopenCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "spec-review",
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    // THEN throws — CLOSED PR is rejected (pr-create only reuses OPEN PRs)
    await expect(callPrepare(cmd)).rejects.toThrow();
    expect(vi.mocked(MOCK_STORE.persist).mock.calls.filter(
      ([s]) => (s as JobState).status === "running",
    )).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-015: reopen fails closed when PR-state query fails or no GitHub client
// ---------------------------------------------------------------------------

describe("TC-015: reopen fails closed when PR-state query fails or client absent", () => {
  it("TC-015-a: prepare() throws PrepareError(1) when getPullRequest throws", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(MOCK_GITHUB_CLIENT.getPullRequest).mockRejectedValue(new Error("API error"));

    const cmd = new ReopenCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "spec-review",
      reason: "x",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    // THEN fail-closed: throws rather than proceeding with unknown PR state
    await expect(callPrepare(cmd)).rejects.toThrow();
  });

  it("TC-015-b: prepare() throws PrepareError(1) when no GitHub client is provided (null)", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);

    const cmd = new ReopenCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "spec-review",
      reason: "x",
      cwd: "/repo",
      githubClient: null, // absent client → fail-closed
    });

    // THEN throws — cannot determine PR state without a client
    await expect(callPrepare(cmd)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-018: reopen from inside a specrunner worktree is rejected
// ---------------------------------------------------------------------------

describe("TC-018: reopen from inside a specrunner worktree is rejected", () => {
  it("TC-018: prepare() throws PrepareError(2) when invoked from inside a specrunner worktree", async () => {
    vi.mocked(detectSpecrunnerWorktree).mockResolvedValue({
      isSpecrunnerWorktree: true,
      mainCheckoutPath: "/main-checkout",
    });

    const cmd = new ReopenCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "spec-review",
      reason: "x",
      cwd: "/main-checkout/.git/specrunner-worktrees/some-slug",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    // THEN throws with exit code 2 (worktree guard)
    await expect(callPrepare(cmd)).rejects.toThrow();
    // AND no state mutation is performed
    expect(vi.mocked(MOCK_STORE.persist)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-020: transition patch clears only run-control fields
// ---------------------------------------------------------------------------

describe("TC-020: transition patch clears only run-control fields (D4)", () => {
  it("TC-020: transitionJob is called with patch clearing only error/resumePoint/mainCheckoutDrift/pid", async () => {
    const awaitingState = makeJobState({
      status: "awaiting-archive",
      steps: { "spec-review": [{ attempt: 1, sessionId: null, outcome: { verdict: "approved" as const, findingsPath: null, error: null }, startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T01:00:00.000Z" }] },
      reviewerStatuses: [{ name: "security", status: "approved" as const, approvedAtCommit: "sha-old" }],
    });
    const runningState = makeRunningState(awaitingState);

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    const cmd = new ReopenCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "spec-review",
      reason: "post-review fix",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    await callPrepare(cmd);

    // Verify transitionJob was called with the correct patch
    const runningTransitionCall = vi
      .mocked(transitionJob)
      .mock.calls.find(([, to]) => to === "running");
    expect(runningTransitionCall).toBeDefined();

    const ctx = runningTransitionCall![2];
    const patch = ctx.patch as Record<string, unknown>;

    // THEN only run-control fields are in the patch
    expect(patch["error"]).toBeNull();
    expect(patch["resumePoint"]).toBeNull();
    expect(patch["mainCheckoutDrift"]).toBeNull();
    expect(patch["pid"]).toBeDefined(); // process.pid or similar

    // AND steps and reviewerStatuses are NOT in the patch (preserved)
    expect(patch["steps"]).toBeUndefined();
    expect(patch["reviewerStatuses"]).toBeUndefined();
    expect(patch["decisions"]).toBeUndefined();
    expect(patch["biteEvidence"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-021: operator event is appended before the transition is persisted
// ---------------------------------------------------------------------------

describe("TC-021: operator event is appended before the transition is persisted (D6)", () => {
  it("TC-021: appendOperatorEvent is called before transitionJob during prepare()", async () => {
    const awaitingState = makeJobState({ status: "awaiting-archive" });
    const runningState = makeRunningState(awaitingState);

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    const cmd = new ReopenCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "spec-review",
      reason: "post-review fix",
      cwd: "/repo",
      githubClient: MOCK_GITHUB_CLIENT as never,
    });

    await callPrepare(cmd);

    // Verify appendOperatorEvent was called
    expect(vi.mocked(MOCK_STORE.appendOperatorEvent)).toHaveBeenCalledOnce();

    // Verify the operator event record has the correct fields
    const operatorEventArg = vi.mocked(MOCK_STORE.appendOperatorEvent).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(operatorEventArg?.["type"]).toBe("operator-event");
    expect(operatorEventArg?.["action"]).toBe("reopen");
    expect(operatorEventArg?.["reason"]).toBe("post-review fix");
    expect(operatorEventArg?.["fromStep"]).toBe("spec-review");
    expect(typeof operatorEventArg?.["ts"]).toBe("string");

    // Verify call order: appendOperatorEvent must precede transitionJob (running transition)
    const operatorEventOrder =
      vi.mocked(MOCK_STORE.appendOperatorEvent).mock.invocationCallOrder[0]!;
    const transitionRunningOrder = (() => {
      const calls = vi.mocked(transitionJob).mock.invocationCallOrder;
      const runningIdx = vi.mocked(transitionJob).mock.calls.findIndex(([, to]) => to === "running");
      return runningIdx >= 0 ? calls[runningIdx] : Infinity;
    })();
    expect(operatorEventOrder).toBeLessThan(transitionRunningOrder as number);
  });
});
