/**
 * Tests for member→coordinator automatic resume context retention (D3, round-immutable-input).
 *
 * Verifies that when a resumePoint.step is a reviewer member name, the resumeContext
 * is preserved after member→coordinator mapping in ResumeCommand.prepare().
 * Without the fix, the strict-equality gate (startStep === resumePoint.step) would
 * discard resumeContext because startStep is mapped to "custom-reviewers" while
 * resumePoint.step remains the original member name.
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

vi.mock("../../resume/safety.js", () => ({
  isStaleRunning: vi.fn().mockReturnValue(false),
  checkConsecutiveEscalations: vi.fn().mockReturnValue(false),
  checkStaleState: vi.fn().mockReturnValue(false),
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { ResumeCommand } from "../resume.js";
import { resolveJobStateBySlug } from "../../resume/resolve-job.js";
import { transitionJob } from "../../../state/lifecycle.js";
import { resolveStateStoreByJobId } from "../../job-access/resolve-state-store.js";
import { parseRequestMd } from "../../../parser/request-md.js";
import { loadConfig } from "../../../config/store.js";
import type { JobState } from "../../../state/schema.js";
import type { ReviewerSnapshot } from "../../../kernel/reviewer-snapshot.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MEMBER_NAME = "cross-boundary-invariants";

const MOCK_REVIEWERS: ReviewerSnapshot[] = [
  {
    name: MEMBER_NAME,
    maxIterations: 3,
    purpose: "detect cross-boundary invariant violations",
    criteria: "no violations",
    judgment: "approved or needs-fix",
    freeText: "",
  },
];

const MOCK_REQUEST = {
  title: "Test request",
  type: "spec-change",
  slug: "test-slug",
  baseBranch: "main",
  adr: false,
};

const MOCK_CONFIG = {
  version: 1,
  steps: {},
};

const MOCK_STORE = {
  persist: vi.fn().mockResolvedValue(undefined),
};

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-abc123",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/test-slug/request.md",
      title: "Test",
      type: "spec-change",
      slug: "test-slug",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "custom-reviewers",
    status: "awaiting-resume",
    branch: "change/test-slug",
    history: [],
    error: null,
    steps: {},
    reviewers: MOCK_REVIEWERS,
    ...overrides,
  };
}

function makeRunningState(overrides: Partial<JobState> = {}): JobState {
  return {
    ...makeJobState(),
    status: "running",
    resumePoint: null,
    pid: process.pid,
    ...overrides,
  };
}

function makeRuntime() {
  return {} as never;
}

function makeEventBus() {
  return {} as never;
}

async function callPrepare(cmd: ResumeCommand): Promise<PrepareResult> {
  return (cmd as unknown as { prepare(): Promise<PrepareResult> }).prepare();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(MOCK_STORE.persist).mockClear();
  vi.mocked(resolveStateStoreByJobId).mockResolvedValue(MOCK_STORE as never);
  vi.mocked(parseRequestMd).mockResolvedValue(MOCK_REQUEST as never);
  vi.mocked(loadConfig).mockResolvedValue(MOCK_CONFIG as never);
});

// ---------------------------------------------------------------------------
// TC-MC-001: member-derived resumePoint → resumeContext preserved
// ---------------------------------------------------------------------------

describe("ResumeCommand.prepare() — member resumePoint preserves resumeContext (D3)", () => {
  it("TC-MC-001: resumeContext is defined when resumePoint.step is a reviewer member name", async () => {
    const awaitingState = makeJobState({
      status: "awaiting-resume",
      resumePoint: {
        step: MEMBER_NAME,
        reason: "Interrupted by signal",
        iterationsExhausted: 0,
      },
    });
    const runningState = makeRunningState({
      resumePoint: null,
      step: "custom-reviewers",
    });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", { cwd: "/repo" });
    const result = await callPrepare(cmd);

    // startStep must be the coordinator (member → coordinator mapping)
    expect(result.startStep).toBe("custom-reviewers");
    // resumeContext must be defined (not dropped by strict-equality gate)
    expect(result.resumeContext).toBeDefined();
    // resumeContext.resumePoint.step must retain the original member name
    expect(result.resumeContext?.resumePoint.step).toBe(MEMBER_NAME);
  });

  it("TC-MC-002: resumeContext.resumePoint.step retains original member name (not mapped to coordinator)", async () => {
    const awaitingState = makeJobState({
      status: "awaiting-resume",
      resumePoint: {
        step: MEMBER_NAME,
        reason: "escalation",
        iterationsExhausted: 2,
      },
    });
    const runningState = makeRunningState({ resumePoint: null });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", { cwd: "/repo" });
    const result = await callPrepare(cmd);

    // The resumePoint inside resumeContext must NOT be re-mapped to "custom-reviewers"
    // (the coordinator). It must keep the member name so that ParallelReviewRound
    // can route automatic context to the correct member via buildResumePrompt gate.
    expect(result.resumeContext?.resumePoint.step).toBe(MEMBER_NAME);
    expect(result.resumeContext?.resumePoint.step).not.toBe("custom-reviewers");
  });
});

// ---------------------------------------------------------------------------
// TC-MC-003: static step resume — existing behaviour unchanged
// ---------------------------------------------------------------------------

describe("ResumeCommand.prepare() — static step resume context preserved (regression)", () => {
  it("TC-MC-003: static resumePoint.step=spec-review → resumeContext.resumePoint.step=spec-review", async () => {
    const awaitingState = makeJobState({
      status: "awaiting-resume",
      reviewers: [], // no reviewers — static pipeline
      resumePoint: {
        step: "spec-review",
        reason: "timeout",
        iterationsExhausted: 1,
      },
    });
    const runningState = makeRunningState({ resumePoint: null });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", { cwd: "/repo" });
    const result = await callPrepare(cmd);

    expect(result.startStep).toBe("spec-review");
    expect(result.resumeContext).toBeDefined();
    expect(result.resumeContext?.resumePoint.step).toBe("spec-review");
  });
});

// ---------------------------------------------------------------------------
// TC-MC-004: --from redirect → resumeContext undefined
// ---------------------------------------------------------------------------

describe("ResumeCommand.prepare() — --from redirect suppresses resumeContext", () => {
  it("TC-MC-004: --from pointing to a different step clears resumeContext", async () => {
    const awaitingState = makeJobState({
      status: "awaiting-resume",
      resumePoint: {
        step: MEMBER_NAME,
        reason: "timeout",
        iterationsExhausted: 0,
      },
    });
    const runningState = makeRunningState({ resumePoint: null });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    // --from code-review redirects away from the member's coordinator
    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", {
      cwd: "/repo",
      from: "code-review",
    });
    const result = await callPrepare(cmd);

    // startStep is the explicitly requested step
    expect(result.startStep).toBe("code-review");
    // resumeContext must be undefined because startStep differs from the recorded resumePoint
    expect(result.resumeContext).toBeUndefined();
  });
});
