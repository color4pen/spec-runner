/**
 * Integration tests for ResumeCommand.prepare() — partial canon quarantine gate (T-03).
 *
 * TC-001: untracked な書きかけ canon がある中断 resume は隔離して続行する
 * TC-002: tracked-modified な書きかけ canon がある中断 resume は隔離して続行する
 * TC-003: 隔離後に退避先へ evidence が残る（gate 配線レベルの検証）
 * TC-004: 中断の裏づけが無い dirty canon は halt する
 * TC-005: 中断 step の writes() 外の canon が混在する場合は halt する
 * TC-006: 前 step が正常完了している場合は halt する
 * TC-007: --apply-canon 指定時は operator-apply commit を行う（自動隔離しない）
 * TC-008: 退避書き込み失敗時は何も削除せず halt する
 * TC-009: resumePoint 無しの stale 経路でも隔離判定が働く
 * TC-010: 隔離後の再 resume は dirty canon を検出しない（冪等性）
 * TC-027: --from で別 step へ redirect した resume は dirty canon でも自動隔離しない
 *
 * Tests are intentionally RED until T-03 adds the three-way branch to resume.ts.
 * Uses the same vi.mock harness as resume-apply-canon.test.ts / resume-reconcile.test.ts.
 *
 * TC-028 SABOTAGE RECORD (inline):
 * The else-if branch in resume.ts that calls quarantinePartialCanon is load-bearing.
 * Removing it would cause TC-001 to fail (quarantinePartialCanon never called → prepare() throws)
 * and TC-009 to fail (same). TC-004/005/006 would remain green since they test fail-closed halt.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrepareResult } from "../runner.js";

// ---------------------------------------------------------------------------
// vi.hoisted: mock fn references accessible in vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockDetectCanonDirtyPaths,
  mockCommitOperatorCanon,
  mockQuarantinePartialCanon,
  mockReconcileWorktreeArtifacts,
} = vi.hoisted(() => ({
  mockDetectCanonDirtyPaths: vi.fn(),
  mockCommitOperatorCanon: vi.fn(),
  mockQuarantinePartialCanon: vi.fn(),
  mockReconcileWorktreeArtifacts: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../resume/apply-canon.js", () => ({
  detectCanonDirtyPaths: mockDetectCanonDirtyPaths,
  commitOperatorCanon: mockCommitOperatorCanon,
}));

vi.mock("../../resume/reconcile-worktree.js", () => ({
  reconcileWorktreeArtifacts: mockReconcileWorktreeArtifacts,
  // quarantinePartialCanon is a new export — mocked here (will be red until T-01 adds it)
  quarantinePartialCanon: mockQuarantinePartialCanon,
}));

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
import type { JobState, StepRun } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLUG = "test-slug";
const CHANGE_FOLDER = `specrunner/changes/${SLUG}`;
const FAKE_WORKTREE = "/fake/worktree/path";

/** Canon paths within design step's writes() */
const DESIGN_DIRTY_PATH = `${CHANGE_FOLDER}/design.md`;
const DESIGN_DIRTY_PATHS = [`${CHANGE_FOLDER}/design.md`];

/** Canon path OUTSIDE design's writes() (condition 2 failure) */
const OUTSIDE_DESIGN_WRITES = `${CHANGE_FOLDER}/test-cases.md`;

const MOCK_REQUEST = {
  title: "Test request",
  type: "spec-change" as const,
  slug: SLUG,
  baseBranch: "main",
  adr: false,
  content: "# Test",
  path: `${CHANGE_FOLDER}/request.md`,
};

const MOCK_CONFIG = { version: 1, steps: {} };

const MOCK_STORE = {
  persist: vi.fn().mockResolvedValue(undefined),
};

const NOOP_RECONCILE_RESULT = { reconciled: [], quarantineDir: null };
const QUARANTINE_RESULT = {
  reconciled: [`${CHANGE_FOLDER}/design.md`],
  quarantineDir: `/fake/worktree/.specrunner/local/${SLUG}/canon-quarantine-1234567890`,
};

// ---------------------------------------------------------------------------
// State factories
// ---------------------------------------------------------------------------

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-partial-canon-test",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    request: {
      path: `${CHANGE_FOLDER}/request.md`,
      title: "Test",
      type: "spec-change",
      slug: SLUG,
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "design",
    status: "awaiting-resume",
    branch: `change/${SLUG}`,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeRunningState(overrides: Partial<JobState> = {}): JobState {
  return makeJobState({
    status: "running",
    step: "design",
    resumePoint: null,
    pid: process.pid,
    worktreePath: FAKE_WORKTREE,
    ...overrides,
  });
}

/**
 * ResumePoint indicating a signal interruption at the "design" step.
 * Satisfies condition 3 (interruptionBacked) of D2.
 */
const SIGNAL_RESUME_POINT = {
  step: "design",
  reason: "signal",
  iterationsExhausted: 0,
};

/**
 * A fake completed StepRun for the "design" step.
 * Non-empty state.steps["design"] → condition 4 (completedStepRunAbsent=false).
 */
const COMPLETED_DESIGN_STEP_RUN: StepRun = {
  attempt: 1,
  sessionId: "fake-session",
  outcome: { verdict: "success", findingsPath: null, error: null },
  startedAt: "2026-08-09T00:00:00.000Z",
  endedAt: "2026-08-09T00:01:00.000Z",
};

/** Access the protected prepare() via type cast. */
async function callPrepare(cmd: ResumeCommand): Promise<PrepareResult> {
  return (cmd as unknown as { prepare(): Promise<PrepareResult> }).prepare();
}

// ---------------------------------------------------------------------------
// Global beforeEach
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(MOCK_STORE.persist).mockClear();
  vi.mocked(resolveStateStoreByJobId).mockResolvedValue(MOCK_STORE as never);
  vi.mocked(parseRequestMd).mockResolvedValue(MOCK_REQUEST as never);
  vi.mocked(loadConfig).mockResolvedValue(MOCK_CONFIG as never);
  vi.mocked(isStaleRunning).mockReturnValue(false);

  // Default: clean worktree, no quarantine needed
  mockDetectCanonDirtyPaths.mockResolvedValue([]);
  mockCommitOperatorCanon.mockResolvedValue("fake-oid");
  mockQuarantinePartialCanon.mockResolvedValue(QUARANTINE_RESULT);
  mockReconcileWorktreeArtifacts.mockResolvedValue(NOOP_RECONCILE_RESULT);
});

// ---------------------------------------------------------------------------
// Shared setup helpers
// ---------------------------------------------------------------------------

/** Setup for: interrupted design step with signal, no completed StepRun. */
function setupSignalInterruptedDesign(dirtyPaths = DESIGN_DIRTY_PATHS): void {
  const awaitingState = makeJobState({
    status: "awaiting-resume",
    step: "design",
    worktreePath: FAKE_WORKTREE,
    resumePoint: SIGNAL_RESUME_POINT,
    steps: {}, // no completed StepRun → condition 4 met
  });
  const runningState = makeRunningState({ resumePoint: null });

  vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
  vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });
  mockDetectCanonDirtyPaths.mockResolvedValue(dirtyPaths);
}

/** Setup for: operator edit — no interruption backing. */
function setupNoInterruptionBacking(): void {
  const awaitingState = makeJobState({
    status: "awaiting-resume",
    step: "design",
    worktreePath: FAKE_WORKTREE,
    resumePoint: null, // no resumePoint → interruptionBacked depends on stale only
    steps: {},
  });
  const runningState = makeRunningState({ resumePoint: null });

  vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
  vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });
  vi.mocked(isStaleRunning).mockReturnValue(false); // not stale
  mockDetectCanonDirtyPaths.mockResolvedValue(DESIGN_DIRTY_PATHS);
}

/** Setup for: completed design step (non-empty state.steps["design"]). */
function setupCompletedDesignStep(): void {
  const awaitingState = makeJobState({
    status: "awaiting-resume",
    step: "design",
    worktreePath: FAKE_WORKTREE,
    resumePoint: SIGNAL_RESUME_POINT,
    steps: { design: [COMPLETED_DESIGN_STEP_RUN] }, // condition 4 fails
  });
  const runningState = makeRunningState({ resumePoint: null });

  vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
  vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });
  mockDetectCanonDirtyPaths.mockResolvedValue(DESIGN_DIRTY_PATHS);
}

/** Setup for: stale-running (SIGKILL/hard-crash) path with design interrupted. */
function setupStaleRunningDesign(): void {
  const awaitingState = makeJobState({
    status: "awaiting-resume",
    step: "design",
    worktreePath: FAKE_WORKTREE,
    resumePoint: null, // no resumePoint — SIGKILL path
    steps: {},
  });
  const runningState = makeRunningState({ resumePoint: null });

  vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
  vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });
  vi.mocked(isStaleRunning).mockReturnValue(true); // stale detected
  mockDetectCanonDirtyPaths.mockResolvedValue(DESIGN_DIRTY_PATHS);
}

// ---------------------------------------------------------------------------
// TC-001: untracked な書きかけ canon がある中断 resume は隔離して続行する
// ---------------------------------------------------------------------------

describe("TC-001: untracked な書きかけ canon がある中断 resume は隔離して続行する", () => {
  beforeEach(() => {
    setupSignalInterruptedDesign();
  });

  it("TC-001: quarantinePartialCanon is called for signal-interrupted design step (untracked dirty canon)", async () => {
    // GIVEN: signal interruption, untracked design.md in worktree, no completed StepRun
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    // WHEN
    await callPrepare(cmd);
    // THEN: auto-quarantine was invoked (not fail-closed halt)
    expect(
      mockQuarantinePartialCanon,
      "quarantinePartialCanon must be called for interrupted-step partial output",
    ).toHaveBeenCalledTimes(1);
  });

  it("TC-001: prepare() does NOT throw when dirty canon is auto-quarantined (no halt)", async () => {
    // GIVEN / WHEN
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    // THEN: must not throw — resume continues
    await expect(callPrepare(cmd)).resolves.toBeDefined();
  });

  it("TC-001: quarantinePartialCanon is called with the dirty canon paths (slug, worktreePath, paths)", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    await callPrepare(cmd);
    // Check that quarantinePartialCanon was called with the right slug and dirty paths
    const [calledSlug, calledWorktree, calledPaths] = mockQuarantinePartialCanon.mock.calls[0] ?? [];
    expect(calledSlug).toBe(SLUG);
    expect(calledWorktree).toBe(FAKE_WORKTREE);
    expect(calledPaths).toContain(DESIGN_DIRTY_PATH);
  });

  it("TC-001 DESTROY: removing the else-if quarantine branch would cause this test to fail (sabotage record)", async () => {
    /**
     * Without the else-if quarantine branch, prepare() would throw PrepareError(1)
     * and this test would fail because prepare() resolves to a PrepareResult.
     * The presence of this test passing confirms the quarantine branch is active.
     */
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    let threw = false;
    try {
      await callPrepare(cmd);
    } catch {
      threw = true;
    }
    expect(
      threw,
      "TC-001 DESTROY: If the quarantine else-if branch is absent, prepare() throws → this test fails. " +
      "Presence of threw=false confirms the quarantine branch is active.",
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-002: tracked-modified な書きかけ canon がある中断 resume は隔離して続行する
// ---------------------------------------------------------------------------

describe("TC-002: tracked-modified な書きかけ canon がある中断 resume は隔離して続行する", () => {
  beforeEach(() => {
    // tracked-modified: same interruption condition, different conceptual dirty kind
    setupSignalInterruptedDesign([`${CHANGE_FOLDER}/design.md`, `${CHANGE_FOLDER}/tasks.md`]);
  });

  it("TC-002: quarantinePartialCanon is called for tracked-modified dirty canon (design + tasks)", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    await callPrepare(cmd);
    expect(mockQuarantinePartialCanon).toHaveBeenCalledTimes(1);
  });

  it("TC-002: prepare() resolves without throwing for tracked-modified dirty canon", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    await expect(callPrepare(cmd)).resolves.toBeDefined();
  });

  it("TC-002: both tracked-modified paths are passed to quarantinePartialCanon", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    await callPrepare(cmd);
    const [, , calledPaths] = mockQuarantinePartialCanon.mock.calls[0] ?? [];
    expect(calledPaths).toContain(`${CHANGE_FOLDER}/design.md`);
    expect(calledPaths).toContain(`${CHANGE_FOLDER}/tasks.md`);
  });
});

// ---------------------------------------------------------------------------
// TC-003: 隔離後に退避先へ evidence が残る
// ---------------------------------------------------------------------------

describe("TC-003: 隔離後に退避先へ evidence が残る（gate 配線レベル）", () => {
  beforeEach(() => {
    setupSignalInterruptedDesign();
  });

  it("TC-003: quarantinePartialCanon is called with the dirty canon paths (slug and worktreePath correct)", async () => {
    // Evidence writability is tested in e2e (TC-023). At integration level:
    // verify that quarantinePartialCanon is called with slug and worktreePath
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    await callPrepare(cmd);
    expect(mockQuarantinePartialCanon).toHaveBeenCalledWith(
      SLUG,
      FAKE_WORKTREE,
      expect.arrayContaining([DESIGN_DIRTY_PATH]),
      expect.anything(), // spawnFn
    );
  });

  it("TC-003: prepare() returns startStep='design' after successful quarantine (step re-runs from beginning)", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    const result = await callPrepare(cmd);
    // startStep must be the interrupted step (design) so it re-runs from scratch
    expect(result.startStep).toBe("design");
  });
});

// ---------------------------------------------------------------------------
// TC-004: 中断の裏づけが無い dirty canon は halt する
// ---------------------------------------------------------------------------

describe("TC-004: 中断の裏づけが無い dirty canon は halt する", () => {
  beforeEach(() => {
    setupNoInterruptionBacking();
  });

  it("TC-004: prepare() throws when dirty canon has no interruption backing (operator edit suspected)", async () => {
    // GIVEN: resumePoint=null, isStaleRunning=false → no machine-backed interruption
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    // WHEN / THEN: must throw — fail-closed (operator edit protection)
    await expect(callPrepare(cmd)).rejects.toThrow();
  });

  it("TC-004: throws PrepareError with exitCode=1", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    let err: Error & { exitCode?: number } | undefined;
    try { await callPrepare(cmd); } catch (e) { err = e as never; }
    expect(err?.exitCode).toBe(1);
  });

  it("TC-004: quarantinePartialCanon is NOT called (operator edit → fail-closed, not auto-quarantine)", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    try { await callPrepare(cmd); } catch { /* expected */ }
    expect(
      mockQuarantinePartialCanon,
      "quarantinePartialCanon must NOT be called for unverified dirty canon (operator edit protection)",
    ).not.toHaveBeenCalled();
  });

  it("TC-004: also fails when resumePoint.reason=escalation (not an interruption reason)", async () => {
    // Setup: escalation reason — treated as operator edit, not interruption
    const awaitingState = makeJobState({
      status: "awaiting-resume",
      step: "design",
      worktreePath: FAKE_WORKTREE,
      resumePoint: { step: "design", reason: "escalation", iterationsExhausted: 0 },
      steps: {},
    });
    const runningState = makeRunningState({ resumePoint: null });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });
    vi.mocked(isStaleRunning).mockReturnValue(false);
    mockDetectCanonDirtyPaths.mockResolvedValue(DESIGN_DIRTY_PATHS);

    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    await expect(callPrepare(cmd)).rejects.toThrow();
    expect(mockQuarantinePartialCanon).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-005: 中断 step の writes() 外の canon が混在する場合は halt する
// ---------------------------------------------------------------------------

describe("TC-005: 中断 step の writes() 外の canon が混在する場合は halt する", () => {
  beforeEach(() => {
    // test-cases.md is in protectedCanonPaths but NOT in design's writes()
    setupSignalInterruptedDesign([DESIGN_DIRTY_PATH, OUTSIDE_DESIGN_WRITES]);
  });

  it("TC-005: prepare() throws when dirty canon includes a path outside design's writes()", async () => {
    // GIVEN: interruption is backed but test-cases.md is not design's declared write
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    // WHEN / THEN: condition 2 fails → fail-closed
    await expect(callPrepare(cmd)).rejects.toThrow();
  });

  it("TC-005: quarantinePartialCanon is NOT called when out-of-scope canon is mixed in", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    try { await callPrepare(cmd); } catch { /* expected */ }
    expect(
      mockQuarantinePartialCanon,
      "quarantinePartialCanon must NOT be called when out-of-scope canon is mixed in dirty paths",
    ).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-006: 前 step が正常完了している場合は halt する
// ---------------------------------------------------------------------------

describe("TC-006: 前 step が正常完了している場合は halt する", () => {
  beforeEach(() => {
    setupCompletedDesignStep();
  });

  it("TC-006: prepare() throws when design has a completed StepRun (condition 4 not met)", async () => {
    // GIVEN: state.steps["design"] is non-empty → completedStepRunAbsent=false
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    // WHEN / THEN: fail-closed (completed StepRun means the dirty canon is not a partial output)
    await expect(callPrepare(cmd)).rejects.toThrow();
  });

  it("TC-006: quarantinePartialCanon is NOT called when design has a completed StepRun", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    try { await callPrepare(cmd); } catch { /* expected */ }
    expect(
      mockQuarantinePartialCanon,
      "quarantinePartialCanon must NOT be called when design already has a completed StepRun",
    ).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-007: --apply-canon 指定時は operator-apply commit を行う（自動隔離しない）
// ---------------------------------------------------------------------------

describe("TC-007: --apply-canon 指定時は operator-apply commit を行う（自動隔離しない）", () => {
  beforeEach(() => {
    setupSignalInterruptedDesign();
  });

  it("TC-007: commitOperatorCanon is called when --apply-canon is given (even if auto-quarantine would match)", async () => {
    // GIVEN: interrupted design, would normally auto-quarantine, but --apply-canon takes priority
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo", applyCanon: true },
    );
    // WHEN
    await callPrepare(cmd);
    // THEN: operator-apply commit is used
    expect(
      mockCommitOperatorCanon,
      "commitOperatorCanon must be called when --apply-canon is specified",
    ).toHaveBeenCalledTimes(1);
  });

  it("TC-007: quarantinePartialCanon is NOT called when --apply-canon is given", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo", applyCanon: true },
    );
    await callPrepare(cmd);
    expect(
      mockQuarantinePartialCanon,
      "quarantinePartialCanon must NOT be called when --apply-canon is given (operator priority)",
    ).not.toHaveBeenCalled();
  });

  it("TC-007: prepare() resolves successfully when --apply-canon commits the dirty canon", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo", applyCanon: true },
    );
    await expect(callPrepare(cmd)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-008: 退避書き込み失敗時は何も削除せず halt する
// ---------------------------------------------------------------------------

describe("TC-008: 退避書き込み失敗時は何も削除せず halt する", () => {
  beforeEach(() => {
    setupSignalInterruptedDesign();
    // quarantinePartialCanon throws → evidence failed → must halt without deleting
    mockQuarantinePartialCanon.mockRejectedValue(
      new Error("EACCES: permission denied, mkdir '.specrunner/local/test-slug/canon-quarantine-123'"),
    );
  });

  it("TC-008: prepare() throws (PrepareError) when quarantinePartialCanon fails", async () => {
    // GIVEN: quarantine write fails
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    // WHEN / THEN: must halt — evidence not written, nothing deleted
    await expect(callPrepare(cmd)).rejects.toThrow();
  });

  it("TC-008: throws PrepareError with exitCode=1 when quarantine fails", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    let err: Error & { exitCode?: number } | undefined;
    try { await callPrepare(cmd); } catch (e) { err = e as never; }
    expect(err?.exitCode).toBe(1);
  });

  it("TC-008: step is NOT started when quarantine fails (prepare() throws before execute)", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    let threw = false;
    try { await callPrepare(cmd); } catch { threw = true; }
    expect(
      threw,
      "step must NOT start when quarantine fails — prepare() must throw",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-009: resumePoint 無しの stale 経路でも隔離判定が働く
// ---------------------------------------------------------------------------

describe("TC-009: resumePoint 無しの stale 経路でも隔離判定が働く", () => {
  beforeEach(() => {
    setupStaleRunningDesign();
  });

  it("TC-009: quarantinePartialCanon is called for stale-running path (SIGKILL/hard-crash) without resumePoint", async () => {
    // GIVEN: isStaleRunning=true, resumePoint=null, state.steps["design"] absent
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    // WHEN
    await callPrepare(cmd);
    // THEN: stale detection backs the interruption → auto-quarantine proceeds
    expect(
      mockQuarantinePartialCanon,
      "stale-running detection must trigger auto-quarantine (staleRunningDetected=true backs interruption)",
    ).toHaveBeenCalledTimes(1);
  });

  it("TC-009: prepare() resolves without throwing for stale-running path", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    await expect(callPrepare(cmd)).resolves.toBeDefined();
  });

  it("TC-009: quarantinePartialCanon receives the correct dirty paths for stale path", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    await callPrepare(cmd);
    const [, , calledPaths] = mockQuarantinePartialCanon.mock.calls[0] ?? [];
    expect(calledPaths).toContain(DESIGN_DIRTY_PATH);
  });
});

// ---------------------------------------------------------------------------
// TC-010: 隔離後の再 resume は dirty canon を検出しない（冪等性）
// ---------------------------------------------------------------------------

describe("TC-010: 隔離後の再 resume は dirty canon を検出しない（冪等性）", () => {
  it("TC-010: gate passes cleanly when detectCanonDirtyPaths returns [] (post-quarantine state)", async () => {
    // GIVEN: detectCanonDirtyPaths returns [] — as it would after a successful quarantine
    const awaitingState = makeJobState({
      status: "awaiting-resume",
      step: "design",
      worktreePath: FAKE_WORKTREE,
    });
    const runningState = makeRunningState();
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });
    mockDetectCanonDirtyPaths.mockResolvedValue([]); // clean after quarantine

    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    // WHEN
    const result = await callPrepare(cmd);
    // THEN: gate passes, no quarantine invoked, no halt
    expect(result).toBeDefined();
    expect(result.startStep).toBe("design");
    expect(
      mockQuarantinePartialCanon,
      "quarantinePartialCanon must NOT be called when no dirty canon exists (post-quarantine idempotency)",
    ).not.toHaveBeenCalled();
  });

  it("TC-010: quarantinePartialCanon is not called on a clean worktree (idempotency)", async () => {
    // Verifies that running resume again after successful quarantine does NOT re-trigger quarantine
    const awaitingState = makeJobState({
      status: "awaiting-resume",
      step: "design",
      worktreePath: FAKE_WORKTREE,
      resumePoint: SIGNAL_RESUME_POINT, // still has resumePoint but canon is now clean
    });
    const runningState = makeRunningState();
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });
    mockDetectCanonDirtyPaths.mockResolvedValue([]); // quarantine already happened

    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG, { cwd: "/repo" },
    );
    await callPrepare(cmd);
    expect(mockQuarantinePartialCanon).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-027: --from で別 step へ redirect した resume は dirty canon でも自動隔離しない
// ---------------------------------------------------------------------------

describe("TC-027: --from で別 step へ redirect した resume は dirty canon でも自動隔離しない", () => {
  beforeEach(() => {
    // All interruption conditions met for "design" step
    setupSignalInterruptedDesign();
  });

  it("TC-027: prepare() throws (fail-closed) when --from spec-review redirects away from interrupted design step", async () => {
    /**
     * Condition 1 (startStep === interruptedStep) is NOT met:
     *   startStep = "spec-review" (from --from option)
     *   interruptedStep = "design" (state.step)
     *   → "spec-review" !== "design" → fail-closed halt
     */
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG,
      { cwd: "/repo", from: "spec-review" }, // --from redirects to different step
    );
    // WHEN / THEN: condition 1 not met → fail-closed, NOT auto-quarantine
    await expect(callPrepare(cmd)).rejects.toThrow();
  });

  it("TC-027: quarantinePartialCanon is NOT called when --from redirects to a different step", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG,
      { cwd: "/repo", from: "spec-review" },
    );
    try { await callPrepare(cmd); } catch { /* expected */ }
    expect(
      mockQuarantinePartialCanon,
      "quarantinePartialCanon must NOT be called when startStep !== interruptedStep (--from redirect)",
    ).not.toHaveBeenCalled();
  });

  it("TC-027: throws PrepareError with exitCode=1 for --from redirect with dirty canon", async () => {
    const cmd = new ResumeCommand(
      {} as never, {} as never, SLUG,
      { cwd: "/repo", from: "spec-review" },
    );
    let err: Error & { exitCode?: number } | undefined;
    try { await callPrepare(cmd); } catch (e) { err = e as never; }
    expect(err?.exitCode).toBe(1);
  });
});
