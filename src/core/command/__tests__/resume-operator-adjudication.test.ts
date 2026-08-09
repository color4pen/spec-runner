/**
 * Integration tests for ResumeCommand.prepare() — operator adjudication persistence.
 *
 * Source: specrunner/changes/custom-reviewer-round-context/test-cases.md
 * TC IDs are frozen — do not renumber.
 *
 * These tests FAIL until T-05 is implemented (RED phase).
 *
 * TC-024: --prompt 付き resume で裁定記録が state に追加される (must)
 * TC-025: --prompt 無しの resume では裁定記録を追加しない (must)
 *
 * Tests that ResumeCommand.prepare() persists operator adjudication records
 * in the job state when `--prompt` is non-empty. The one-shot deps injection
 * (resumePrompt) is unaffected.
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

// Worktree detection: never inside specrunner worktree (avoids the guard throw)
vi.mock("../../worktree/detection.js", () => ({
  detectSpecrunnerWorktree: vi.fn().mockResolvedValue({ isSpecrunnerWorktree: false }),
}));

// Resolve worktree path: return null so apply-canon / adopt-commits / reconcile gates are skipped
vi.mock("../../resume/resolve-worktree-path.js", () => ({
  resolveLivenessWorktreePath: vi.fn().mockResolvedValue(null),
}));

// Apply-canon gate: not needed for these tests
vi.mock("../../resume/apply-canon.js", () => ({
  detectCanonDirtyPaths: vi.fn().mockResolvedValue([]),
  commitOperatorCanon: vi.fn(),
}));

// Adopt-commits gate: not needed for these tests
vi.mock("../../resume/adopt-commits.js", () => ({
  detectUnadoptedCommits: vi.fn().mockResolvedValue([]),
  buildAdoptEscalationMessage: vi.fn().mockReturnValue(""),
}));

// Reconcile: not needed for these tests
vi.mock("../../resume/reconcile-worktree.js", () => ({
  reconcileWorktreeArtifacts: vi.fn().mockResolvedValue({ reconciled: [] }),
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_REQUEST = {
  title: "Test request",
  type: "new-feature" as const,
  slug: "test-slug",
  baseBranch: "main",
  adr: false,
  content: "# Request content",
  path: "specrunner/changes/test-slug/request.md",
};

const MOCK_CONFIG = { version: 1, steps: {} };

const MOCK_STORE = {
  persist: vi.fn().mockResolvedValue(undefined),
};

function makeAwaitingResumeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-adj-test",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    request: {
      path: "specrunner/changes/test-slug/request.md",
      title: "Test",
      type: "new-feature",
      slug: "test-slug",
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "security", // custom reviewer
    status: "awaiting-resume",
    branch: "feat/test-slug-abc12345",
    history: [],
    error: null,
    resumePoint: {
      step: "security",
      reason: "reviewer escalated",
      iterationsExhausted: 0,
    },
    steps: {},
    ...overrides,
  };
}

function makeRunningState(overrides: Partial<JobState> = {}): JobState {
  return makeAwaitingResumeState({
    status: "running",
    resumePoint: null,
    pid: process.pid,
    ...overrides,
  });
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
// TC-024 (must): --prompt 付き resume で裁定記録が state に追加される
// ---------------------------------------------------------------------------

describe("TC-024: --prompt 付き resume で裁定記録が state に追加される", () => {
  beforeEach(() => {
    const awaitingState = makeAwaitingResumeState();
    const runningState = makeRunningState();

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });
  });

  it("TC-024: persist is called with state containing operatorAdjudications entry", async () => {
    const ADJUDICATION_TEXT = "do not revert auth module changes";

    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", prompt: ADJUDICATION_TEXT },
    );

    await callPrepare(cmd);

    // persist must have been called
    expect(MOCK_STORE.persist).toHaveBeenCalled();

    // The state passed to persist must contain an operatorAdjudications entry
    const persistedState = vi.mocked(MOCK_STORE.persist).mock.calls[0]![0] as JobState & {
      operatorAdjudications?: Array<{ text: string; step: string; recordedAt: string }>;
    };

    expect(persistedState.operatorAdjudications).toBeDefined();
    expect(Array.isArray(persistedState.operatorAdjudications)).toBe(true);
    expect(persistedState.operatorAdjudications!.length).toBeGreaterThanOrEqual(1);

    const adj = persistedState.operatorAdjudications![0]!;
    expect(adj.text).toBe(ADJUDICATION_TEXT);
  });

  it("TC-024: persisted adjudication has the correct step (startStep)", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", prompt: "operator decision text" },
    );

    await callPrepare(cmd);

    const persistedState = vi.mocked(MOCK_STORE.persist).mock.calls[0]![0] as JobState & {
      operatorAdjudications?: Array<{ text: string; step: string; recordedAt: string }>;
    };

    const adj = persistedState.operatorAdjudications?.[0];
    expect(adj).toBeDefined();
    // step must be the resolved startStep (the step the job is resuming from)
    expect(typeof adj!.step).toBe("string");
    expect(adj!.step.length).toBeGreaterThan(0);
  });

  it("TC-024: persisted adjudication has a recordedAt ISO timestamp", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", prompt: "my decision" },
    );

    await callPrepare(cmd);

    const persistedState = vi.mocked(MOCK_STORE.persist).mock.calls[0]![0] as JobState & {
      operatorAdjudications?: Array<{ text: string; step: string; recordedAt: string }>;
    };

    const adj = persistedState.operatorAdjudications?.[0];
    expect(adj).toBeDefined();
    // recordedAt must be a valid ISO 8601 string
    expect(typeof adj!.recordedAt).toBe("string");
    expect(() => new Date(adj!.recordedAt)).not.toThrow();
    const parsed = new Date(adj!.recordedAt);
    expect(isNaN(parsed.getTime())).toBe(false);
  });

  it("TC-024: resumePrompt is still propagated (one-shot deps injection unchanged)", async () => {
    const PROMPT = "keep the auth change";

    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", prompt: PROMPT },
    );

    const result = await callPrepare(cmd);

    // The one-shot resumePrompt must still be propagated to the pipeline
    expect(result.resumePrompt).toBe(PROMPT);
  });
});

// ---------------------------------------------------------------------------
// TC-025 (must): --prompt 無しの resume では裁定記録を追加しない
// ---------------------------------------------------------------------------

describe("TC-025: --prompt 無しの resume では裁定記録を追加しない", () => {
  beforeEach(() => {
    const awaitingState = makeAwaitingResumeState();
    const runningState = makeRunningState();

    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });
  });

  it("TC-025: persist is called without operatorAdjudications when no prompt given", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" }, // no prompt
    );

    await callPrepare(cmd);

    expect(MOCK_STORE.persist).toHaveBeenCalled();

    const persistedState = vi.mocked(MOCK_STORE.persist).mock.calls[0]![0] as JobState & {
      operatorAdjudications?: unknown[];
    };

    // operatorAdjudications must NOT be added when prompt is absent
    const adj = persistedState.operatorAdjudications;
    const hasNoNewAdjudications =
      adj === undefined ||
      adj === null ||
      (Array.isArray(adj) && adj.length === 0);
    expect(hasNoNewAdjudications).toBe(true);
  });

  it("TC-025: empty string prompt does not add adjudication record", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", prompt: "" }, // empty string
    );

    await callPrepare(cmd);

    expect(MOCK_STORE.persist).toHaveBeenCalled();

    const persistedState = vi.mocked(MOCK_STORE.persist).mock.calls[0]![0] as JobState & {
      operatorAdjudications?: unknown[];
    };

    const adj = persistedState.operatorAdjudications;
    const hasNoNewAdjudications =
      adj === undefined ||
      adj === null ||
      (Array.isArray(adj) && adj.length === 0);
    expect(hasNoNewAdjudications).toBe(true);
  });

  it("TC-025: resumePrompt is undefined when no prompt given", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" }, // no prompt
    );

    const result = await callPrepare(cmd);
    expect(result.resumePrompt).toBeUndefined();
  });
});
