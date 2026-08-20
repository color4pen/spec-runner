/**
 * TC-005, TC-006, TC-007, TC-008, TC-009, TC-012
 *
 * ResumeCommand.prepare() exit code from resolveResumeStep:
 *   TC-005: --from regression-gate with reviewers → does NOT exit 2 (resolve succeeds)
 *   TC-006: --from custom-reviewers with reviewers → does NOT exit 2
 *   TC-007: --from <member-name> with reviewers → does NOT exit 2 (maps to coordinator)
 *   TC-008: --from bogus-step → PrepareError exitCode 2
 *   TC-009: --from regression-gate without reviewers → PrepareError exitCode 2
 *   TC-012: no --from, state.step="init" → PrepareError exitCode 1
 *
 * Uses real resolve-step.ts (not mocked); mock infrastructure follows resume-hard-crash.test.ts.
 *
 * Source: test-cases.md
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
import type { ReviewerSnapshot } from "../../../kernel/reviewer-snapshot.js";

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

function makeReviewer(name: string): ReviewerSnapshot {
  return {
    name,
    maxIterations: 3,
    purpose: "test",
    criteria: "test",
    judgment: "test",
    freeText: "",
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

/** Extract exitCode from a PrepareError (not exported, check via duck-typing). */
function getExitCode(err: unknown): number | undefined {
  return (err as { exitCode?: number }).exitCode;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(MOCK_STORE.persist).mockClear();
  vi.mocked(resolveStateStoreByJobId).mockResolvedValue(MOCK_STORE as never);
  vi.mocked(parseRequestMd).mockResolvedValue(MOCK_REQUEST as never);
  vi.mocked(loadConfig).mockResolvedValue(MOCK_CONFIG as never);
  vi.mocked(isStaleRunning).mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// TC-008: --from bogus-step → PrepareError exitCode 2
// ---------------------------------------------------------------------------

describe("TC-008: --from bogus-step exits 2 for resume", () => {
  it("PrepareError.exitCode === 2 when --from is an unknown step", async () => {
    const awaitingState = makeJobState({ status: "awaiting-resume", step: "design" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "bogus-step",
      cwd: "/repo",
    });

    try {
      await callPrepare(cmd);
      throw new Error("Expected PrepareError to be thrown");
    } catch (err) {
      expect(getExitCode(err)).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-009: --from regression-gate without reviewers → PrepareError exitCode 2
// ---------------------------------------------------------------------------

describe("TC-009: --from regression-gate exits 2 for job without custom reviewers", () => {
  it("PrepareError.exitCode === 2 when reviewers is absent", async () => {
    const awaitingState = makeJobState({ status: "awaiting-resume", step: "design" });
    // no reviewers field → buildAllowedStepSet returns static set without regression-gate
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "regression-gate",
      cwd: "/repo",
    });

    try {
      await callPrepare(cmd);
      throw new Error("Expected PrepareError to be thrown");
    } catch (err) {
      expect(getExitCode(err)).toBe(2);
    }
  });

  it("PrepareError.exitCode === 2 when reviewers is empty array", async () => {
    const awaitingState = makeJobState({ status: "awaiting-resume", step: "design", reviewers: [] });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "regression-gate",
      cwd: "/repo",
    });

    try {
      await callPrepare(cmd);
      throw new Error("Expected PrepareError to be thrown");
    } catch (err) {
      expect(getExitCode(err)).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-012: no --from, state.step="init" → PrepareError exitCode 1
// ---------------------------------------------------------------------------

describe("TC-012: no --from and no resume position exits 1", () => {
  it("PrepareError.exitCode === 1 when --from is absent and state.step is not a pipeline step", async () => {
    const awaitingState = makeJobState({ status: "awaiting-resume", step: "init" });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", {
      // no --from
      cwd: "/repo",
    });

    try {
      await callPrepare(cmd);
      throw new Error("Expected PrepareError to be thrown");
    } catch (err) {
      expect(getExitCode(err)).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-005: --from regression-gate with reviewers → does NOT exit 2
// ---------------------------------------------------------------------------

describe("TC-005: --from regression-gate succeeds for job with custom reviewers", () => {
  it("prepare() resolves without PrepareError(2) when reviewers include security", async () => {
    const reviewers = [makeReviewer("security")];
    const awaitingState = makeJobState({ status: "awaiting-resume", step: "design", reviewers });
    const runningState = makeJobState({ status: "running", step: "design", reviewers, pid: process.pid });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "regression-gate",
      cwd: "/repo",
    });

    // Should not throw PrepareError(2); may resolve successfully
    let exitCode: number | undefined;
    try {
      const result = await callPrepare(cmd);
      // If it resolves, check startStep is regression-gate (resolve succeeded)
      expect(result.startStep).toBe("regression-gate");
      return;
    } catch (err) {
      exitCode = getExitCode(err);
    }
    // If it throws, it must NOT be exit code 2 (resolve failure)
    expect(exitCode).not.toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TC-006: --from custom-reviewers with reviewers → does NOT exit 2
// ---------------------------------------------------------------------------

describe("TC-006: --from custom-reviewers succeeds for job with custom reviewers", () => {
  it("prepare() resolves without PrepareError(2) when reviewers are present", async () => {
    const reviewers = [makeReviewer("security")];
    const awaitingState = makeJobState({ status: "awaiting-resume", step: "design", reviewers });
    const runningState = makeJobState({ status: "running", step: "design", reviewers, pid: process.pid });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "custom-reviewers",
      cwd: "/repo",
    });

    let exitCode: number | undefined;
    try {
      const result = await callPrepare(cmd);
      expect(result.startStep).toBe("custom-reviewers");
      return;
    } catch (err) {
      exitCode = getExitCode(err);
    }
    expect(exitCode).not.toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TC-007: --from <member-name> maps to coordinator → does NOT exit 2
// ---------------------------------------------------------------------------

describe("TC-007: --from <member-name> maps to coordinator for job with custom reviewers", () => {
  it("prepare() resolves without PrepareError(2); member 'alice' maps to custom-reviewers", async () => {
    const reviewers = [makeReviewer("alice")];
    const awaitingState = makeJobState({ status: "awaiting-resume", step: "design", reviewers });
    const runningState = makeJobState({ status: "running", step: "design", reviewers, pid: process.pid });

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    const cmd = new ResumeCommand(makeRuntime(), makeEventBus(), "test-slug", {
      from: "alice",
      cwd: "/repo",
    });

    let exitCode: number | undefined;
    try {
      const result = await callPrepare(cmd);
      // member→coordinator mapping: startStep is "custom-reviewers"
      expect(result.startStep).toBe("custom-reviewers");
      return;
    } catch (err) {
      exitCode = getExitCode(err);
    }
    expect(exitCode).not.toBe(2);
  });
});
