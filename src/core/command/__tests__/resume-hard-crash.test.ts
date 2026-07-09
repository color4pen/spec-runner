/**
 * Minimal integration tests for ResumeCommand.prepare() — hard-crash recovery.
 *
 * Verifies that:
 * 1. The old guard (`resumePoint === null && from === undefined → throw`) is gone.
 * 2. `state.step` is forwarded to `resolveResumeStep` as the hard-crash fallback.
 *
 * The resolution logic itself is tested exhaustively in resolve-step.test.ts (T-03).
 * Here we only verify that the wiring between prepare() and resolveResumeStep is correct.
 *
 * Note: prepare() is protected, so we access it via a type cast.
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
  isStaleRunning: vi.fn(),
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
import { isStaleRunning } from "../../resume/safety.js";
import { transitionJob } from "../../../state/lifecycle.js";
import { resolveStateStoreByJobId } from "../../job-access/resolve-state-store.js";
import { parseRequestMd } from "../../../parser/request-md.js";
import { loadConfig } from "../../../config/store.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
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
      type: "bug-fix",
      slug: "test-slug",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "design",
    status: "awaiting-resume",
    branch: "fix/test-slug",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeRuntime() {
  return {} as never;
}

function makeEventBus() {
  return {} as never;
}

/** Call the protected prepare() via type cast. */
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
// T-04 AC1: hard-crash happy path
// state=running / step="design" / resumePoint=null / pid dead
// → startStep === "design" (fallback from state.step)
// ---------------------------------------------------------------------------

describe("ResumeCommand.prepare() — hard-crash recovery via state.step", () => {
  it("AC1: recovers from hard-crash by using state.step when resumePoint is null", async () => {
    const staleState = makeJobState({
      status: "running",
      step: "design",
      resumePoint: undefined,
      pid: 99999,
    });

    const awaitingState = makeJobState({
      status: "awaiting-resume",
      step: "design",
      resumePoint: undefined,
      pid: null,
    });

    const runningState = makeJobState({
      status: "running",
      step: "design",
      resumePoint: null,
      pid: process.pid,
    });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(staleState);
    vi.mocked(isStaleRunning).mockReturnValue(true);
    // First call: running → awaiting-resume (stale detection)
    // Second call: awaiting-resume → running (resume transition)
    vi.mocked(transitionJob)
      .mockReturnValueOnce({ state: awaitingState, noop: false })
      .mockReturnValueOnce({ state: runningState, noop: false });

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", {
      cwd: "/repo",
    });

    const result = await callPrepare(cmd);

    // The key assertion: hard-crash job gets startStep from state.step
    expect(result.startStep).toBe("design");
    // resumeContext should be undefined (no resumePoint — cosmetic only, per spec)
    expect(result.resumeContext).toBeUndefined();
  });

  it("AC1: recovers with different valid step names from state.step", async () => {
    const staleState = makeJobState({
      status: "running",
      step: "implementer",
      resumePoint: undefined,
      pid: 99999,
    });
    const awaitingState = makeJobState({ status: "awaiting-resume", step: "implementer", pid: null });
    const runningState = makeJobState({ status: "running", step: "implementer", pid: process.pid });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(staleState);
    vi.mocked(isStaleRunning).mockReturnValue(true);
    vi.mocked(transitionJob)
      .mockReturnValueOnce({ state: awaitingState, noop: false })
      .mockReturnValueOnce({ state: runningState, noop: false });

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", { cwd: "/repo" });
    const result = await callPrepare(cmd);
    expect(result.startStep).toBe("implementer");
  });
});

// ---------------------------------------------------------------------------
// T-04 AC2: not-started job — state.step is absent or not a pipeline step → PrepareError
// ---------------------------------------------------------------------------

describe("ResumeCommand.prepare() — not-started job throws PrepareError", () => {
  it("AC2: job with step='init' and no resumePoint throws (not a pipeline step)", async () => {
    const staleState = makeJobState({
      status: "running",
      step: "init",
      resumePoint: undefined,
      pid: 99999,
    });
    const awaitingState = makeJobState({ status: "awaiting-resume", step: "init", pid: null });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(staleState);
    vi.mocked(isStaleRunning).mockReturnValue(true);
    vi.mocked(transitionJob).mockReturnValue({ state: awaitingState, noop: false });

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", { cwd: "/repo" });

    // Should throw — exit code 1
    await expect(callPrepare(cmd)).rejects.toThrow("Failed to resolve resume step");
  });
});

// ---------------------------------------------------------------------------
// T-04 AC3: resumePoint present — existing behaviour unchanged (regression)
// ---------------------------------------------------------------------------

describe("ResumeCommand.prepare() — resume clears mainCheckoutDrift", () => {
  it("running transition patch clears mainCheckoutDrift alongside resumePoint and error", async () => {
    const awaitingState = makeJobState({
      status: "awaiting-resume",
      step: "implementer",
      resumePoint: {
        step: "implementer",
        reason: "main checkout write detected",
        iterationsExhausted: 0,
      },
      mainCheckoutDrift: {
        changes: [{ path: ".specrunner/config.json", kind: "modified" }],
        detectedAtStep: "implementer",
        ts: "2026-07-09T00:00:00.000Z",
      },
    });
    const runningState = makeJobState({
      status: "running",
      step: "implementer",
      resumePoint: null,
      pid: process.pid,
    });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(isStaleRunning).mockReturnValue(false);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", { cwd: "/repo" });
    await callPrepare(cmd);

    // The awaiting-resume → running transition must clear the drift record,
    // otherwise a later unrelated halt would misreport the stale drift.
    const runningCall = vi
      .mocked(transitionJob)
      .mock.calls.find(([, to]) => to === "running");
    expect(runningCall).toBeDefined();
    const patch = runningCall![2].patch as Record<string, unknown>;
    expect(patch["resumePoint"]).toBeNull();
    expect(patch["mainCheckoutDrift"]).toBeNull();
  });
});

describe("ResumeCommand.prepare() — resumePoint present uses resumePoint.step (regression)", () => {
  it("AC3: uses resumePoint.step when resumePoint is present, even if state.step differs", async () => {
    const awaitingState = makeJobState({
      status: "awaiting-resume",
      step: "design",
      resumePoint: {
        step: "spec-review",
        reason: "timeout",
        iterationsExhausted: 1,
      },
    });
    const runningState = makeJobState({
      status: "running",
      step: "design",
      resumePoint: null,
      pid: process.pid,
    });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(isStaleRunning).mockReturnValue(false);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", { cwd: "/repo" });
    const result = await callPrepare(cmd);

    // resumePoint.step wins over state.step
    expect(result.startStep).toBe("spec-review");
  });
});
