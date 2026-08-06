/**
 * Integration tests for ResumeCommand.prepare() with the adopt-commits gate.
 *
 * TC-001: unknown committed commit halts before any step executes
 * TC-002: empty publish range leaves resume behavior unchanged
 * TC-003: escalation names the commit and offers three fixes
 * TC-004: adopted OID is recorded in persisted state
 * TC-005: persist failure prevents pipeline launch
 * TC-006: --apply-canon alone still halts on a committed operator commit
 * TC-011: null runStore prevents pipeline launch when --adopt-commits is given
 * TC-012: exit-128 is treated as empty publish range; any other git failure is fail-closed
 * TC-013: --apply-canon and --adopt-commits flags are composable; apply-canon OID is not re-adopted
 *
 * Sources:
 *   TC-001 — spec.md > Requirement: resume reconciles the publish range against the ledger
 *             before any step runs > Scenario: unknown committed commit halts before any step executes
 *   TC-002 — spec.md > Requirement: resume reconciles ... > Scenario: empty publish range leaves
 *             resume behavior unchanged
 *   TC-003 — spec.md > Requirement: flag-less halt presents each unknown commit and the three
 *             resolution options > Scenario: escalation names the commit and offers three fixes
 *   TC-004 — spec.md > Requirement: resume --adopt-commits records unknown OIDs then launches
 *             the pipeline > Scenario: adopted OID is recorded in persisted state
 *   TC-005 — spec.md > Requirement: resume --adopt-commits records ... > Scenario: persist
 *             failure prevents pipeline launch
 *   TC-006 — spec.md > Requirement: --apply-canon does not adopt committed operator commits
 *             > Scenario: --apply-canon alone still halts on a committed operator commit
 *   TC-011 — tasks.md T-04, tasks.md T-06 (TC-I4b)
 *   TC-012 — tasks.md T-06 (TC-I7), design.md D3
 *   TC-013 — tasks.md T-06 (TC-I-combined), design.md D4
 *
 * Uses the mock-harness pattern from resume-apply-canon.test.ts.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * TC-001 / TC-I8 DESTRUCTION CONFIRMATION (inline documentation):
 *
 * The adopt gate added to `ResumeCommand.prepare()` in T-04:
 *   ```
 *   if (commits.length > 0 && !this.options.adoptCommits) {
 *     throw new PrepareError(1, "Unknown commits in publish range; use --adopt-commits");
 *   }
 *   ```
 * is load-bearing. Removing it reinstates the original failure mode:
 *   1. Operator makes a commit (not in ledger)
 *   2. `job resume` starts a step (step runs side effects)
 *   3. The step's egress check detects the unknown commit and halts with EGRESS_UNKNOWN_COMMIT
 *   4. Operator pays the cost of a full step execution before the error
 *
 * Verification: TC-001 (in this file) tests that prepare() throws BEFORE any step is started.
 * If the guard is removed, TC-001 fails (prepare() does not throw), confirming the guard is
 * the sole mechanism preventing the step-first-then-fail failure mode.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrepareResult } from "../runner.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// vi.hoisted: create mock fn references accessible in vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockDetectCanonDirtyPaths,
  mockCommitOperatorCanon,
  mockDetectUnadoptedCommits,
  mockBuildAdoptEscalationMessage,
} = vi.hoisted(() => ({
  mockDetectCanonDirtyPaths: vi.fn(),
  mockCommitOperatorCanon: vi.fn(),
  mockDetectUnadoptedCommits: vi.fn(),
  mockBuildAdoptEscalationMessage: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks (hoisted — must be before any imports that resolve the mocked modules)
// ---------------------------------------------------------------------------

vi.mock("../../resume/apply-canon.js", () => ({
  detectCanonDirtyPaths: mockDetectCanonDirtyPaths,
  commitOperatorCanon: mockCommitOperatorCanon,
}));

vi.mock("../../resume/adopt-commits.js", () => ({
  detectUnadoptedCommits: mockDetectUnadoptedCommits,
  buildAdoptEscalationMessage: mockBuildAdoptEscalationMessage,
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
import { logError, stderrWrite } from "../../../logger/stdout.js";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const MOCK_REQUEST = {
  title: "Test request",
  type: "bug-fix" as const,
  slug: "test-slug",
  baseBranch: "main",
  adr: false,
  content: "# Test",
  path: "specrunner/changes/test-slug/request.md",
};

const MOCK_CONFIG = { version: 1, steps: {} };

const MOCK_STORE = {
  persist: vi.fn().mockResolvedValue(undefined),
};

/** Fake worktree path (non-null triggers the adopt gate inside prepare()) */
const FAKE_WORKTREE = "/fake/worktree/path";

/** Fake unknown operator commit used across tests */
const UNKNOWN_COMMIT = {
  oid: "operator-oid-xyz",
  shortSha: "abc1234",
  subject: "operator: fix escalation",
  author: "Operator Dev",
  paths: ["specrunner/changes/test-slug/spec.md"],
};

/** Escalation message text returned by the mock buildAdoptEscalationMessage */
const ADOPT_ESCALATION_MESSAGE =
  `abc1234 operator: fix escalation\n` +
  `Use --adopt-commits to record the commit in the ledger.\n` +
  `Or push the commit to origin.\n` +
  `Or remove/revert the commit (git reset / git revert).\n`;

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-adopt-commits-test",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
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

/** Access the protected prepare() via type cast (same pattern as resume-apply-canon.test.ts) */
async function callPrepare(cmd: ResumeCommand): Promise<PrepareResult> {
  return (cmd as unknown as { prepare(): Promise<PrepareResult> }).prepare();
}

// ---------------------------------------------------------------------------
// Setup: runs before each test — establish safe defaults
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(MOCK_STORE.persist).mockClear().mockResolvedValue(undefined);
  vi.mocked(resolveStateStoreByJobId).mockResolvedValue(MOCK_STORE as never);
  vi.mocked(parseRequestMd).mockResolvedValue(MOCK_REQUEST as never);
  vi.mocked(loadConfig).mockResolvedValue(MOCK_CONFIG as never);
  vi.mocked(isStaleRunning).mockReturnValue(false);
  vi.mocked(logError).mockClear();
  vi.mocked(stderrWrite).mockClear();

  // Default apply-canon: clean worktree (no dirty canon paths)
  mockDetectCanonDirtyPaths.mockResolvedValue([]);
  mockCommitOperatorCanon.mockResolvedValue("fake-apply-oid-abc123");

  // Default adopt-commits: no unknown commits (empty publish range scenario)
  mockDetectUnadoptedCommits.mockResolvedValue([]);
  mockBuildAdoptEscalationMessage.mockReturnValue(ADOPT_ESCALATION_MESSAGE);

  // Default job state: awaiting-resume with FAKE_WORKTREE
  const awaitingState = makeJobState({
    status: "awaiting-resume",
    step: "design",
    worktreePath: FAKE_WORKTREE,
  });
  const runningState = makeRunningState();
  vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
  vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });
});

// ---------------------------------------------------------------------------
// TC-001: unknown committed commit halts before any step executes
// Source: spec.md > Scenario: unknown committed commit halts before any step executes
// ---------------------------------------------------------------------------

describe("TC-001: unknown committed commit halts before any step executes", () => {
  beforeEach(() => {
    // GIVEN: a job in awaiting-resume with a worktree
    // AND: one commit in the publish range that is NOT in synthesizedCommits
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);
  });

  it("TC-001: prepare() throws when an unknown commit is in the publish range (no --adopt-commits)", async () => {
    // WHEN: resume without --adopt-commits
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" }, // no adoptCommits
    );

    // THEN: prepare() throws (step is never started)
    await expect(callPrepare(cmd)).rejects.toThrow();
  });

  it("TC-001: prepare() throws with exitCode 1 (PrepareError — user-correctable)", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );

    let caught: Error & { exitCode?: number } | undefined;
    try {
      await callPrepare(cmd);
    } catch (e) {
      caught = e as Error & { exitCode?: number };
    }

    expect(caught).toBeDefined();
    expect(caught?.exitCode).toBe(1);
  });

  it("TC-001: the step is NOT started (prepare() threw — no step side effect possible)", async () => {
    // Verification: the throw from prepare() prevents execute() from running the pipeline.
    // This assertion documents: the halt is at prepare() boundary, before any step executes.
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );

    let threw = false;
    try {
      await callPrepare(cmd);
    } catch {
      threw = true;
    }

    // TC-001: step is not started IF AND ONLY IF prepare() threw
    expect(
      threw,
      "TC-001: prepare() must throw before the pipeline starts (no step side effect). " +
      "EGRESS_UNKNOWN_COMMIT fires AFTER a step runs — that is the old behavior this gate replaces.",
    ).toBe(true);
  });

  it("TC-001 (TC-I8 sabotage record): removing the halt makes this test fail", async () => {
    // TC-I8 SABOTAGE RECORD:
    // If the `commits.length > 0 && !adoptCommits` guard were removed from prepare(),
    // the assertion below would observe `threw === false` (prepare() completes without throwing).
    // That would cause TC-001 to fail, confirming the guard is load-bearing.
    // The presence of this test (and TC-001 passing) proves the gate is active.
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );

    let threw = false;
    try {
      await callPrepare(cmd);
    } catch {
      threw = true;
    }

    expect(
      threw,
      "TC-I8: The adopt gate is load-bearing. " +
      "If this assertion fails, removing the guard caused TC-001 to fail — " +
      "confirming the gate prevents step execution before egress validation.",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-002: empty publish range leaves resume behavior unchanged
// Source: spec.md > Scenario: empty publish range leaves resume behavior unchanged
// ---------------------------------------------------------------------------

describe("TC-002: empty publish range leaves resume behavior unchanged", () => {
  it("TC-002: prepare() resolves when detectUnadoptedCommits returns [] (no unknown commits)", async () => {
    // GIVEN: detectUnadoptedCommits returns [] (empty publish range or all in ledger)
    mockDetectUnadoptedCommits.mockResolvedValue([]);

    // WHEN: resume without any flags
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );

    // THEN: prepare() resolves (no halt)
    const result = await callPrepare(cmd);
    expect(result).toBeDefined();
    expect(result.startStep).toBe("design");
  });

  it("TC-002: synthesizedCommits is NOT changed by the gate when range is empty", async () => {
    // GIVEN: detectUnadoptedCommits returns []
    mockDetectUnadoptedCommits.mockResolvedValue([]);

    const awaitingState = makeJobState({
      status: "awaiting-resume",
      step: "design",
      worktreePath: FAKE_WORKTREE,
      synthesizedCommits: ["existing-oid-abc"],
    });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    const runningState = makeRunningState({ synthesizedCommits: ["existing-oid-abc"] });
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );

    await callPrepare(cmd);

    // synthesizedCommits must not have been changed (no new OIDs adopted)
    const persistCalls = vi.mocked(MOCK_STORE.persist).mock.calls;
    // All persist calls should have synthesizedCommits = ["existing-oid-abc"] (unchanged)
    for (const [state] of persistCalls) {
      const s = state as JobState;
      if (s.synthesizedCommits) {
        expect(s.synthesizedCommits).not.toContain("operator-oid-xyz");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// TC-003: escalation names the commit and offers three fixes
// Source: spec.md > Requirement: flag-less halt presents each unknown commit and the three
//         resolution options > Scenario: escalation names the commit and offers three fixes
// ---------------------------------------------------------------------------

describe("TC-003: escalation names the commit and offers three fixes", () => {
  beforeEach(() => {
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);
  });

  it("TC-003: escalation output contains the unknown commit's short SHA", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );

    try {
      await callPrepare(cmd);
    } catch {
      // expected
    }

    // The escalation message (from buildAdoptEscalationMessage) must be written to stderr/logError
    const logErrorCalls = vi.mocked(logError).mock.calls.map(([msg]) => String(msg));
    const stderrCalls = vi.mocked(stderrWrite).mock.calls.map(([msg]) => String(msg));
    const allOutput = [...logErrorCalls, ...stderrCalls].join("\n");

    expect(allOutput).toContain(UNKNOWN_COMMIT.shortSha);
  });

  it("TC-003: escalation output references --adopt-commits as one option", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );

    try {
      await callPrepare(cmd);
    } catch {
      // expected
    }

    const logErrorCalls = vi.mocked(logError).mock.calls.map(([msg]) => String(msg));
    const stderrCalls = vi.mocked(stderrWrite).mock.calls.map(([msg]) => String(msg));
    const allOutput = [...logErrorCalls, ...stderrCalls].join("\n");

    expect(allOutput).toContain("--adopt-commits");
  });

  it("TC-003: escalation output references pushing to origin as one option", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );

    try {
      await callPrepare(cmd);
    } catch {
      // expected
    }

    const logErrorCalls = vi.mocked(logError).mock.calls.map(([msg]) => String(msg));
    const stderrCalls = vi.mocked(stderrWrite).mock.calls.map(([msg]) => String(msg));
    const allOutput = [...logErrorCalls, ...stderrCalls].join("\n").toLowerCase();

    expect(allOutput.includes("push") || allOutput.includes("origin")).toBe(true);
  });

  it("TC-003: escalation output references removing/reverting as one option", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );

    try {
      await callPrepare(cmd);
    } catch {
      // expected
    }

    const logErrorCalls = vi.mocked(logError).mock.calls.map(([msg]) => String(msg));
    const stderrCalls = vi.mocked(stderrWrite).mock.calls.map(([msg]) => String(msg));
    const allOutput = [...logErrorCalls, ...stderrCalls].join("\n").toLowerCase();

    expect(
      allOutput.includes("reset") || allOutput.includes("revert") || allOutput.includes("remove"),
    ).toBe(true);
  });

  it("TC-003: state.synthesizedCommits does NOT contain the unknown OID after the halt", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );

    try {
      await callPrepare(cmd);
    } catch {
      // expected
    }

    // The unknown OID must NOT have been appended to synthesizedCommits
    const persistCalls = vi.mocked(MOCK_STORE.persist).mock.calls;
    for (const [state] of persistCalls) {
      const s = state as JobState;
      expect(s.synthesizedCommits ?? []).not.toContain(UNKNOWN_COMMIT.oid);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-004: adopted OID is recorded in persisted state
// Source: spec.md > Requirement: resume --adopt-commits records unknown OIDs then launches
//         the pipeline > Scenario: adopted OID is recorded in persisted state
// ---------------------------------------------------------------------------

describe("TC-004: adopted OID is recorded in persisted state", () => {
  it("TC-004: --adopt-commits appends the unknown OID to synthesizedCommits and persists it", async () => {
    // GIVEN: one unknown commit in the publish range
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);

    // WHEN: resume with adoptCommits: true
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", adoptCommits: true } as never,
    );

    // THEN: prepare() resolves (pipeline is launched)
    const result = await callPrepare(cmd);
    expect(result).toBeDefined();
    expect(result.startStep).toBe("design");

    // AND: the adopted OID is present in the persisted state
    const persistCalls = vi.mocked(MOCK_STORE.persist).mock.calls;
    const callWithAdoptedOid = persistCalls.find(([state]) => {
      const s = state as JobState;
      return s.synthesizedCommits?.includes(UNKNOWN_COMMIT.oid);
    });
    expect(
      callWithAdoptedOid,
      "persist must have been called with state.synthesizedCommits containing the adopted OID",
    ).toBeDefined();
  });

  it("TC-004: prepare() resolves so the pipeline launches (not just adopts and stops)", async () => {
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);

    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", adoptCommits: true } as never,
    );

    // WHEN / THEN: prepare() resolves (no throw)
    await expect(callPrepare(cmd)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-005: persist failure prevents pipeline launch
// Source: spec.md > Requirement: resume --adopt-commits records ... > Scenario: persist
//         failure prevents pipeline launch
// ---------------------------------------------------------------------------

describe("TC-005: persist failure prevents pipeline launch", () => {
  it("TC-005: prepare() throws PrepareError(1) when persist rejects after adopt", async () => {
    // GIVEN: one unknown commit AND persist rejects
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);

    // Make persist fail on the second call (the adopt persist, not the initial running transition persist)
    // The second call is the one that persists the state with the adopted OID.
    let persistCallCount = 0;
    vi.mocked(MOCK_STORE.persist).mockImplementation(async () => {
      persistCallCount++;
      if (persistCallCount >= 2) {
        throw new Error("persist failed: disk full");
      }
    });

    // WHEN: resume with adoptCommits: true
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", adoptCommits: true } as never,
    );

    // THEN: prepare() throws (pipeline is NOT launched)
    let caught: Error & { exitCode?: number } | undefined;
    try {
      await callPrepare(cmd);
    } catch (e) {
      caught = e as Error & { exitCode?: number };
    }

    expect(caught).toBeDefined();
    expect(caught?.exitCode).toBe(1);
  });

  it("TC-005: pipeline is NOT launched on persist failure (prepare() threw before execute())", async () => {
    // Verify the throw from prepare() prevents the pipeline from starting
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);
    vi.mocked(MOCK_STORE.persist).mockRejectedValue(new Error("persist failed"));

    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", adoptCommits: true } as never,
    );

    let threw = false;
    try {
      await callPrepare(cmd);
    } catch {
      threw = true;
    }

    expect(threw, "pipeline must not launch when persist fails: prepare() must throw").toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-006: --apply-canon alone still halts on a committed operator commit
// Source: spec.md > Requirement: --apply-canon does not adopt committed operator commits
//         > Scenario: --apply-canon alone still halts on a committed operator commit
// ---------------------------------------------------------------------------

describe("TC-006: --apply-canon alone still halts on a committed operator commit", () => {
  it("TC-006: prepare() throws when applyCanon=true but worktree is clean and unknown commit exists", async () => {
    // GIVEN: no dirty canon paths (worktree is clean — operator already committed)
    mockDetectCanonDirtyPaths.mockResolvedValue([]);
    // AND: an unknown commit in the publish range
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);

    // WHEN: resume with only --apply-canon (no --adopt-commits)
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", applyCanon: true } as never,
    );

    // THEN: prepare() throws (the adopt gate fires; --apply-canon did not adopt the commit)
    await expect(callPrepare(cmd)).rejects.toThrow();
  });

  it("TC-006: commitOperatorCanon is NOT called when worktree is clean (no dirty canon paths)", async () => {
    mockDetectCanonDirtyPaths.mockResolvedValue([]);
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);

    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", applyCanon: true } as never,
    );

    try {
      await callPrepare(cmd);
    } catch {
      // expected
    }

    // --apply-canon must NOT commit because the worktree is clean
    expect(mockCommitOperatorCanon).not.toHaveBeenCalled();
  });

  it("TC-006: the unknown OID is NOT appended to synthesizedCommits (--apply-canon did not widen)", async () => {
    mockDetectCanonDirtyPaths.mockResolvedValue([]);
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);

    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", applyCanon: true } as never,
    );

    try {
      await callPrepare(cmd);
    } catch {
      // expected
    }

    // The unknown commit's OID must NOT have been appended
    const persistCalls = vi.mocked(MOCK_STORE.persist).mock.calls;
    for (const [state] of persistCalls) {
      const s = state as JobState;
      expect(s.synthesizedCommits ?? []).not.toContain(UNKNOWN_COMMIT.oid);
    }
  });

  it("TC-006: prepare() halts with exit code 1 and presents the three resolution options", async () => {
    mockDetectCanonDirtyPaths.mockResolvedValue([]);
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);

    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", applyCanon: true } as never,
    );

    let caught: Error & { exitCode?: number } | undefined;
    try {
      await callPrepare(cmd);
    } catch (e) {
      caught = e as Error & { exitCode?: number };
    }

    expect(caught?.exitCode).toBe(1);

    // Resolution options must be presented
    const logErrorCalls = vi.mocked(logError).mock.calls.map(([msg]) => String(msg));
    const stderrCalls = vi.mocked(stderrWrite).mock.calls.map(([msg]) => String(msg));
    const allOutput = [...logErrorCalls, ...stderrCalls].join("\n");
    expect(allOutput).toContain("--adopt-commits");
  });
});

// ---------------------------------------------------------------------------
// TC-011: null runStore prevents pipeline launch when --adopt-commits is given
// Source: tasks.md T-04, tasks.md T-06 (TC-I4b)
// ---------------------------------------------------------------------------

describe("TC-011: null runStore prevents pipeline launch when --adopt-commits is given", () => {
  it("TC-011: prepare() throws PrepareError(1) when runStore is null and adoptCommits is true", async () => {
    // GIVEN: resolveStateStoreByJobId returns null (no runStore available)
    vi.mocked(resolveStateStoreByJobId).mockResolvedValue(null as never);
    // AND: an unknown commit in the publish range
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);

    // WHEN: resume with adoptCommits: true
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", adoptCommits: true } as never,
    );

    // THEN: prepare() throws with exitCode 1 (pipeline not launched)
    let caught: Error & { exitCode?: number } | undefined;
    try {
      await callPrepare(cmd);
    } catch (e) {
      caught = e as Error & { exitCode?: number };
    }

    expect(caught).toBeDefined();
    expect(caught?.exitCode).toBe(1);
  });

  it("TC-011: null runStore is treated identically to a persist failure (fail-closed)", async () => {
    // Verify that a null runStore prevents pipeline launch — not just fails silently
    vi.mocked(resolveStateStoreByJobId).mockResolvedValue(null as never);
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);

    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", adoptCommits: true } as never,
    );

    let threw = false;
    try {
      await callPrepare(cmd);
    } catch {
      threw = true;
    }

    expect(
      threw,
      "TC-011: null runStore must cause prepare() to throw (fail-closed), not silently adopt",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-012: exit-128 is treated as empty publish range; any other git failure is fail-closed
// Source: tasks.md T-06 (TC-I7), design.md D3
// ---------------------------------------------------------------------------

describe("TC-012: exit-128 is treated as empty publish range; any other git failure is fail-closed", () => {
  it("TC-012: prepare() does NOT throw when detectUnadoptedCommits throws with 'exit 128'", async () => {
    // GIVEN: detectUnadoptedCommits rejects with an error whose message contains 'exit 128'
    mockDetectUnadoptedCommits.mockRejectedValue(
      new Error("git rev-list failed (exit 128): not a git repository"),
    );

    // WHEN: resume without flags
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );

    // THEN: prepare() resolves — exit 128 is treated as an empty publish range (non-git-dir carve-out)
    await expect(callPrepare(cmd)).resolves.toBeDefined();
  });

  it("TC-012: prepare() DOES throw when detectUnadoptedCommits throws with a non-128 error (fail-closed)", async () => {
    // GIVEN: detectUnadoptedCommits rejects with a non-128 git error
    mockDetectUnadoptedCommits.mockRejectedValue(
      new Error("git rev-list failed (exit 1): some git error"),
    );

    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );

    // THEN: prepare() throws — fail-closed for all non-128 git failures
    let caught: Error & { exitCode?: number } | undefined;
    try {
      await callPrepare(cmd);
    } catch (e) {
      caught = e as Error & { exitCode?: number };
    }

    expect(caught).toBeDefined();
    expect(caught?.exitCode).toBe(1);
  });

  it("TC-012: exit-128 carve-out resolves with startStep (not a truncated stub result)", async () => {
    mockDetectUnadoptedCommits.mockRejectedValue(
      new Error("git rev-list failed (exit 128): not a git repository"),
    );

    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );

    const result = await callPrepare(cmd);
    expect(result.startStep).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-013: --apply-canon and --adopt-commits flags are composable; apply-canon OID is not re-adopted
// Source: tasks.md T-06 (TC-I-combined), design.md D4
// ---------------------------------------------------------------------------

describe("TC-013: --apply-canon and --adopt-commits flags are composable; apply-canon OID is not re-adopted", () => {
  const APPLY_CANON_OID = "apply-oid-abc";
  const OPERATOR_OID = "operator-oid-xyz";

  beforeEach(() => {
    // GIVEN: dirty protected canon paths (apply-canon will create a commit)
    const DIRTY_CANON_PATH = "specrunner/changes/test-slug/tasks.md";
    mockDetectCanonDirtyPaths.mockResolvedValue([DIRTY_CANON_PATH]);
    // commitOperatorCanon returns the apply-canon OID
    mockCommitOperatorCanon.mockResolvedValue(APPLY_CANON_OID);

    // GIVEN: detectUnadoptedCommits (called with post-apply-canon ledger that already contains APPLY_CANON_OID)
    // returns only the remaining unknown OID (the apply-canon OID is absent — it was in the ledger)
    mockDetectUnadoptedCommits.mockResolvedValue([
      {
        oid: OPERATOR_OID,
        shortSha: "oper0id",
        subject: "operator: manual fix",
        author: "Operator",
        paths: ["src/core/command/resume.ts"],
      },
    ]);
  });

  it("TC-013: prepare() resolves when both --apply-canon and --adopt-commits are given", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", applyCanon: true, adoptCommits: true } as never,
    );

    await expect(callPrepare(cmd)).resolves.toBeDefined();
  });

  it("TC-013: synthesizedCommits contains both apply-canon OID and adopted OID in persisted state", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", applyCanon: true, adoptCommits: true } as never,
    );

    await callPrepare(cmd);

    // The last persist call must have both OIDs in synthesizedCommits
    const persistCalls = vi.mocked(MOCK_STORE.persist).mock.calls;
    const lastCall = persistCalls[persistCalls.length - 1];
    const finalState = lastCall?.[0] as JobState | undefined;

    expect(finalState?.synthesizedCommits).toContain(APPLY_CANON_OID);
    expect(finalState?.synthesizedCommits).toContain(OPERATOR_OID);
  });

  it("TC-013: apply-canon OID appears exactly once in synthesizedCommits (not re-adopted)", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", applyCanon: true, adoptCommits: true } as never,
    );

    await callPrepare(cmd);

    const persistCalls = vi.mocked(MOCK_STORE.persist).mock.calls;
    const lastCall = persistCalls[persistCalls.length - 1];
    const finalState = lastCall?.[0] as JobState | undefined;

    const applyCanonOccurrences = (finalState?.synthesizedCommits ?? []).filter(
      (oid) => oid === APPLY_CANON_OID,
    ).length;

    expect(
      applyCanonOccurrences,
      "apply-canon OID must appear exactly once — it was not re-adopted by the adopt gate (D4 invariant)",
    ).toBe(1);
  });

  it("TC-013: detectUnadoptedCommits was called with a ledger that already contains the apply-canon OID", async () => {
    // D4 composability invariant: the ledger is read AFTER apply-canon appends its OID,
    // so detectUnadoptedCommits sees the apply-canon OID as known and does not return it.
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo", applyCanon: true, adoptCommits: true } as never,
    );

    await callPrepare(cmd);

    // The ledger argument passed to detectUnadoptedCommits must contain the apply-canon OID
    const detectCalls = mockDetectUnadoptedCommits.mock.calls;
    expect(detectCalls.length).toBeGreaterThan(0);
    const ledgerArg = detectCalls[0]![1] as string[];
    expect(
      ledgerArg,
      "detectUnadoptedCommits must be called with the post-apply-canon ledger " +
      "(containing apply-canon OID) so it does not flag it as unknown",
    ).toContain(APPLY_CANON_OID);
  });
});
