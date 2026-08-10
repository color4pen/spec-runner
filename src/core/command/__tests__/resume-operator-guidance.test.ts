/**
 * Integration tests for resume operator guidance (TC-001 through TC-008).
 *
 * TC-001: dirty canon と未知 commit の併存で 1 回の統合 halt
 * TC-002: dirty canon のみで --apply-canon 案内（完全コマンド形式）
 * TC-003: 未知 commit のみで --adopt-commits 案内（Gate 2 経由、--apply-canon なし）
 * TC-004: 統合 halt に代替案（discard / push / revert）が提示される
 * TC-005: halt 前後で git 履歴と synthesizedCommits が不変（副作用なし）
 * TC-006: 未知 commit 検出失敗時（非 exit 128）の fail-closed
 * TC-008: 存在しない slug の resume で slug 語彙のエラーを報告する
 *
 * Sources:
 *   TC-001 — spec.md > 採用系 preflight を統合した単一 halt > Scenario: dirty canon と未知 commit の併存
 *   TC-002 — spec.md > 採用系 preflight を統合した単一 halt > Scenario: dirty canon のみで --apply-canon 案内
 *   TC-003 — spec.md > 採用系 preflight を統合した単一 halt > Scenario: 未知 commit のみで --adopt-commits 案内
 *   TC-004 — spec.md > 統合 halt メッセージの形式 > Scenario: 代替案の提示
 *   TC-005 — spec.md > preflight は副作用を持たず fail-closed を維持する > Scenario: halt 前後で git 履歴と ledger が不変
 *   TC-006 — spec.md > preflight は副作用を持たず fail-closed を維持する > Scenario: 未知 commit 検出失敗時の fail-closed
 *   TC-008 — spec.md > 未解決 slug の報告文言 > Scenario: 存在しない slug の resume
 *
 * Uses the mock-harness pattern from resume-apply-canon.test.ts / resume-adopt-commits.test.ts.
 *
 * RED state notes:
 *   TC-001: buildAdoptionHaltMessage は resume.ts で呼ばれないため stderrWrite が統合 halt を持たない → fail
 *   TC-002: 旧コードは "Hint: Use --apply-canon..." と表示するだけで完全コマンドを出さない → fail
 *   TC-003: Gate 2 は既存コードで正しく動作するため GREEN になる（リグレッション pin）
 *   TC-004: 旧コードの Gate 1 halt は push/revert 代替案を含まない → fail
 *   TC-005: 旧コードは副作用なし → GREEN（リグレッション pin）
 *   TC-006: 旧コードは Gate 1 halt で detectUnadoptedCommits を呼ばない → fail
 *   TC-008: 旧コードは "Job not found: no job ID starts with '...'" を出力 → slug 語彙を含まない → fail
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrepareResult } from "../runner.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// vi.hoisted: mock fn references accessible in vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockDetectCanonDirtyPaths,
  mockCommitOperatorCanon,
  mockDetectUnadoptedCommits,
  mockBuildAdoptEscalationMessage,
  mockBuildAdoptionHaltMessage,
  mockJobStateStoreResolveId,
  mockJobStateStoreList,
} = vi.hoisted(() => ({
  mockDetectCanonDirtyPaths: vi.fn(),
  mockCommitOperatorCanon: vi.fn(),
  mockDetectUnadoptedCommits: vi.fn(),
  mockBuildAdoptEscalationMessage: vi.fn(),
  // TC-009 / T-01: buildAdoptionHaltMessage does not exist yet (RED state)
  // The mock factory provides it so resume.ts can call it when implemented (GREEN state).
  mockBuildAdoptionHaltMessage: vi.fn(),
  mockJobStateStoreResolveId: vi.fn(),
  mockJobStateStoreList: vi.fn().mockResolvedValue([]),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../resume/apply-canon.js", () => ({
  detectCanonDirtyPaths: mockDetectCanonDirtyPaths,
  commitOperatorCanon: mockCommitOperatorCanon,
}));

vi.mock("../../resume/adopt-commits.js", () => ({
  detectUnadoptedCommits: mockDetectUnadoptedCommits,
  buildAdoptEscalationMessage: mockBuildAdoptEscalationMessage,
  // buildAdoptionHaltMessage is the new T-01 function; provided here so resume.ts
  // can import it in GREEN state without module resolution errors.
  buildAdoptionHaltMessage: mockBuildAdoptionHaltMessage,
}));

vi.mock("../../resume/resolve-job.js", () => ({
  resolveJobStateBySlug: vi.fn(),
}));

vi.mock("../../../store/job-state-store.js", () => ({
  JobStateStore: {
    resolveId: mockJobStateStoreResolveId,
    list: mockJobStateStoreList,
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

const FAKE_WORKTREE = "/fake/worktree/path";

/** Dirty protected canon path used across tests */
const DIRTY_PATH = "specrunner/changes/test-slug/tasks.md";

/** Fake unknown operator commit for adopt-gate tests */
const UNKNOWN_COMMIT = {
  oid: "operator-oid-xyz1234567890abcdef12345678",
  shortSha: "abc1234",
  subject: "operator: fix escalation",
  author: "Operator Dev",
  paths: ["specrunner/changes/test-slug/spec.md"],
};

/**
 * Return value from mockBuildAdoptionHaltMessage for the combined (canon + commits) scenario.
 * Contains all required elements: slug, both flags, dirty path, commit SHA.
 * The content validation of the real function is in adoption-halt.test.ts (TC-009).
 */
const COMBINED_HALT_MSG =
  "Protected canon changes and unadopted commits detected. No step was run.\n\n" +
  `Modified canon paths:\n  ${DIRTY_PATH}\n\n` +
  `Unadopted commits:\n  ${UNKNOWN_COMMIT.shortSha} — ${UNKNOWN_COMMIT.subject}\n\n` +
  "To proceed:\n" +
  "  specrunner job resume test-slug --apply-canon --adopt-commits\n\n" +
  "Alternatives:\n" +
  `  Discard canon: git checkout HEAD -- ${DIRTY_PATH}\n` +
  "  Push or revert the operator commit(s) to remove them from the publish range.\n";

/**
 * Return value from mockBuildAdoptionHaltMessage for the canon-only scenario.
 */
const CANON_ONLY_HALT_MSG =
  "Protected canon changes detected. No step was run.\n\n" +
  `Modified canon paths:\n  ${DIRTY_PATH}\n\n` +
  "To proceed:\n" +
  "  specrunner job resume test-slug --apply-canon\n\n" +
  "Alternatives:\n" +
  `  Discard canon: git checkout HEAD -- ${DIRTY_PATH}\n`;

/**
 * Return value from mockBuildAdoptionHaltMessage for the detection-failed scenario.
 */
const DETECTION_FAILED_HALT_MSG =
  "Protected canon changes detected. Unknown commit detection failed. No step was run.\n\n" +
  `Modified canon paths:\n  ${DIRTY_PATH}\n\n` +
  "Note: detection of unadopted commits failed (non-fatal git error).\n" +
  "To proceed (fix canon changes first):\n" +
  "  specrunner job resume test-slug --apply-canon\n\n" +
  "Alternatives:\n" +
  `  Discard canon: git checkout HEAD -- ${DIRTY_PATH}\n`;

/**
 * Return value from mockBuildAdoptEscalationMessage (existing Gate 2 path).
 * Must NOT contain --apply-canon (Gate 2 is commits-only).
 */
const ADOPT_ESCALATION_MSG =
  "Unknown (non-pipeline) commits were found in the push range. No step was run.\n\n" +
  `Commit: ${UNKNOWN_COMMIT.shortSha} — ${UNKNOWN_COMMIT.subject}\n\n` +
  "To resolve, choose one of:\n" +
  "  1. Adopt the commit(s) into the egress ledger:\n" +
  "       specrunner job resume test-slug --adopt-commits\n" +
  "  2. Push the commit(s) to origin.\n" +
  "  3. Remove or revert the commit(s).\n";

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-operator-guidance-test",
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

async function callPrepare(cmd: ResumeCommand): Promise<PrepareResult> {
  return (cmd as unknown as { prepare(): Promise<PrepareResult> }).prepare();
}

function allStderrOutput(): string {
  return vi.mocked(stderrWrite).mock.calls.map(([msg]) => String(msg)).join("\n");
}

function allLogErrorOutput(): string {
  return vi.mocked(logError).mock.calls.map(([msg]) => String(msg)).join("\n");
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(MOCK_STORE.persist).mockClear().mockResolvedValue(undefined);
  vi.mocked(resolveStateStoreByJobId).mockResolvedValue(MOCK_STORE as never);
  vi.mocked(parseRequestMd).mockResolvedValue(MOCK_REQUEST as never);
  vi.mocked(loadConfig).mockResolvedValue(MOCK_CONFIG as never);
  vi.mocked(isStaleRunning).mockReturnValue(false);
  vi.mocked(logError).mockClear();
  vi.mocked(stderrWrite).mockClear();

  // Default mocks: clean worktree
  mockDetectCanonDirtyPaths.mockResolvedValue([]);
  mockCommitOperatorCanon.mockResolvedValue("fake-apply-oid-abc123");

  // Default mocks: no unknown commits
  mockDetectUnadoptedCommits.mockResolvedValue([]);
  mockBuildAdoptEscalationMessage.mockReturnValue(ADOPT_ESCALATION_MSG);
  mockBuildAdoptionHaltMessage.mockReturnValue(COMBINED_HALT_MSG);

  mockJobStateStoreList.mockResolvedValue([]);
  mockJobStateStoreResolveId.mockRejectedValue(
    new Error("Job not found: no job ID starts with 'test-slug'"),
  );

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
// TC-001: dirty canon と未知 commit の併存で 1 回の統合 halt
// Source: spec.md > 採用系 preflight を統合した単一 halt > Scenario: dirty canon と未知 commit の併存
// ---------------------------------------------------------------------------

describe("TC-001: dirty canon と未知 commit の併存で 1 回の統合 halt", () => {
  beforeEach(() => {
    // GIVEN: dirty protected canon path AND unadopted commits both exist
    mockDetectCanonDirtyPaths.mockResolvedValue([DIRTY_PATH]);
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);
    // buildAdoptionHaltMessage returns the combined message (set in global beforeEach)
  });

  it("TC-001: prepare() throws (pipeline does not start)", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );
    await expect(callPrepare(cmd)).rejects.toThrow();
  });

  it("TC-001: buildAdoptionHaltMessage is called (unified halt builder)", async () => {
    // TC-001: In RED state, resume.ts does NOT call buildAdoptionHaltMessage → fails.
    // In GREEN state, resume.ts calls it with both detections → passes.
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
    expect(
      mockBuildAdoptionHaltMessage,
      "buildAdoptionHaltMessage must be called to produce the unified halt message",
    ).toHaveBeenCalled();
  });

  it("TC-001: buildAdoptionHaltMessage is called with both dirtyCanonPaths and unadoptedCommits", async () => {
    // TC-001: both detections must be forwarded to the builder
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
    const calls = mockBuildAdoptionHaltMessage.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const firstCallArg = calls[0]?.[0] as {
      slug: string;
      dirtyCanonPaths: string[];
      unadoptedCommits: unknown[];
    };
    expect(firstCallArg?.dirtyCanonPaths).toContain(DIRTY_PATH);
    expect(firstCallArg?.unadoptedCommits).toEqual(
      expect.arrayContaining([expect.objectContaining({ shortSha: UNKNOWN_COMMIT.shortSha })]),
    );
  });

  it("TC-001: stderrWrite is called with the unified halt message", async () => {
    // TC-001: the combined message must reach stderr so the operator sees it
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
    const allStderr = allStderrOutput();
    expect(
      allStderr,
      "stderrWrite must include the combined halt message from buildAdoptionHaltMessage",
    ).toContain(COMBINED_HALT_MSG);
  });

  it("TC-001: the unified message output contains --apply-canon --adopt-commits", async () => {
    // TC-001: the message already contains the full command (from the mock); verify plumbing
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
    const allOutput = allStderrOutput() + "\n" + allLogErrorOutput();
    expect(allOutput).toContain("--apply-canon");
    expect(allOutput).toContain("--adopt-commits");
  });

  it("TC-001: the unified message output contains the dirty canon path", async () => {
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
    const allOutput = allStderrOutput() + "\n" + allLogErrorOutput();
    expect(allOutput).toContain(DIRTY_PATH);
  });

  it("TC-001: the unified message output contains the unadopted commit shortSha", async () => {
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
    const allOutput = allStderrOutput() + "\n" + allLogErrorOutput();
    expect(allOutput).toContain(UNKNOWN_COMMIT.shortSha);
  });
});

// ---------------------------------------------------------------------------
// TC-002: dirty canon のみで --apply-canon 案内（完全コマンド形式）
// Source: spec.md > Scenario: dirty canon のみで --apply-canon 案内
// ---------------------------------------------------------------------------

describe("TC-002: dirty canon のみで --apply-canon のみの完全コマンドが提示される", () => {
  beforeEach(() => {
    // GIVEN: dirty protected canon only (no unadopted commits)
    mockDetectCanonDirtyPaths.mockResolvedValue([DIRTY_PATH]);
    mockDetectUnadoptedCommits.mockResolvedValue([]);
    mockBuildAdoptionHaltMessage.mockReturnValue(CANON_ONLY_HALT_MSG);
  });

  it("TC-002: prepare() throws (pipeline does not start)", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );
    await expect(callPrepare(cmd)).rejects.toThrow();
  });

  it("TC-002: buildAdoptionHaltMessage is called with empty unadoptedCommits", async () => {
    // TC-002: dirty canon only → builder called with no unadopted commits
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
    const calls = mockBuildAdoptionHaltMessage.mock.calls;
    expect(calls.length, "buildAdoptionHaltMessage must be called").toBeGreaterThan(0);
    const firstCallArg = calls[0]?.[0] as { unadoptedCommits: unknown[] };
    expect(firstCallArg?.unadoptedCommits).toEqual([]);
  });

  it("TC-002: output contains complete command 'specrunner job resume test-slug --apply-canon'", async () => {
    // TC-002: the complete command (with real slug) must be present so the operator can copy it
    // In RED state: old hint is "Hint: Use --apply-canon to commit these changes..." — no full command
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
    const allOutput = allStderrOutput() + "\n" + allLogErrorOutput();
    expect(
      allOutput,
      "output must include the complete command 'specrunner job resume test-slug --apply-canon'",
    ).toContain("specrunner job resume test-slug --apply-canon");
  });

  it("TC-002: output does NOT contain --adopt-commits (dirty canon only scenario)", async () => {
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
    // TC-002: --adopt-commits must NOT appear when only dirty canon detected
    const allOutput = allStderrOutput() + "\n" + allLogErrorOutput();
    expect(
      allOutput,
      "output must NOT contain --adopt-commits when only dirty canon paths detected",
    ).not.toContain("--adopt-commits");
  });
});

// ---------------------------------------------------------------------------
// TC-003: 未知 commit のみで --adopt-commits 案内（Gate 2 経由）
// Source: spec.md > Scenario: 未知 commit のみで --adopt-commits 案内
// This test verifies the existing Gate 2 behavior is preserved and that
// --apply-canon is NOT added to the commits-only halt path.
// ---------------------------------------------------------------------------

describe("TC-003: 未知 commit のみで --adopt-commits のみの完全コマンドが提示される", () => {
  beforeEach(() => {
    // GIVEN: clean protected canon (no dirty paths), unadopted commits exist
    mockDetectCanonDirtyPaths.mockResolvedValue([]);
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);
    // Gate 2 uses buildAdoptEscalationMessage (existing, unchanged)
    mockBuildAdoptEscalationMessage.mockReturnValue(ADOPT_ESCALATION_MSG);
  });

  it("TC-003: prepare() throws (pipeline does not start)", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );
    await expect(callPrepare(cmd)).rejects.toThrow();
  });

  it("TC-003: output contains 'specrunner job resume test-slug --adopt-commits'", async () => {
    // TC-003: Gate 2 must provide the complete --adopt-commits command
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
    const allOutput = allStderrOutput() + "\n" + allLogErrorOutput();
    expect(allOutput).toContain("specrunner job resume test-slug --adopt-commits");
  });

  it("TC-003: output does NOT contain --apply-canon (commits-only path)", async () => {
    // TC-003: --apply-canon must NOT appear when only unadopted commits detected (no dirty canon)
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
    const allStderr = allStderrOutput();
    expect(
      allStderr,
      "stderrWrite must NOT contain --apply-canon in the commits-only (Gate 2) halt path",
    ).not.toContain("--apply-canon");
  });

  it("TC-003: buildAdoptionHaltMessage is NOT called (Gate 2 uses existing builder)", async () => {
    // TC-003: Gate 2 is unchanged; the new builder is only for Gate 1 halt paths
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
    expect(
      mockBuildAdoptionHaltMessage,
      "buildAdoptionHaltMessage must NOT be called for the commits-only Gate 2 halt path",
    ).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-004: 統合 halt に代替案（discard / push / revert）が提示される
// Source: spec.md > 統合 halt メッセージの形式 > Scenario: 代替案の提示
// ---------------------------------------------------------------------------

describe("TC-004: 統合 halt に代替案（discard / push / revert）が含まれる", () => {
  beforeEach(() => {
    // GIVEN: dirty canon + unadopted commits (combined halt scenario)
    mockDetectCanonDirtyPaths.mockResolvedValue([DIRTY_PATH]);
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);
    // The combined halt message includes alternatives
    mockBuildAdoptionHaltMessage.mockReturnValue(COMBINED_HALT_MSG);
  });

  it("TC-004: output contains discard alternative (git checkout for dirty canon)", async () => {
    // TC-004: operator must be told how to discard dirty canon changes
    // In RED state: old hint doesn't mention push/revert alternatives for commits
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
    const allOutput = allStderrOutput() + "\n" + allLogErrorOutput();
    expect(
      allOutput.toLowerCase(),
      "output must include discard alternative (git checkout or discard)",
    ).toMatch(/git checkout|discard/);
  });

  it("TC-004: output contains push or revert alternative for unadopted commits", async () => {
    // TC-004: operator must be told how to resolve unadopted commits without --adopt-commits
    // In RED state: Gate 1 halt has no push/revert for commits → fails
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
    const allOutput = (allStderrOutput() + "\n" + allLogErrorOutput()).toLowerCase();
    const hasPushOrRevert = allOutput.includes("push") || allOutput.includes("revert");
    expect(
      hasPushOrRevert,
      "output must include push or revert alternative for unadopted commits",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-005: halt 前後で git 履歴と synthesizedCommits が不変（副作用なし）
// Source: spec.md > preflight は副作用を持たず fail-closed を維持する > Scenario: halt 前後で git 履歴と ledger が不変
// ---------------------------------------------------------------------------

describe("TC-005: halt 前後で synthesizedCommits が不変（副作用なし）", () => {
  const INITIAL_SYNTH_COMMITS = ["initial-known-oid-aabbcc"];

  beforeEach(() => {
    // GIVEN: awaiting-resume job with known synthesizedCommits
    const awaitingState = makeJobState({
      status: "awaiting-resume",
      step: "design",
      worktreePath: FAKE_WORKTREE,
      synthesizedCommits: INITIAL_SYNTH_COMMITS,
    });
    const runningState = makeRunningState({
      synthesizedCommits: INITIAL_SYNTH_COMMITS,
    });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(awaitingState);
    vi.mocked(transitionJob).mockReturnValue({ state: runningState, noop: false });

    // Dirty canon to trigger halt
    mockDetectCanonDirtyPaths.mockResolvedValue([DIRTY_PATH]);
    // Any unadopted commits (preflight detection reads but does not persist)
    mockDetectUnadoptedCommits.mockResolvedValue([UNKNOWN_COMMIT]);
    mockBuildAdoptionHaltMessage.mockReturnValue(COMBINED_HALT_MSG);
  });

  it("TC-005: commitOperatorCanon is NOT called (no new git commit created)", async () => {
    // TC-005: preflight is read-only; must not create commits
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
    expect(
      mockCommitOperatorCanon,
      "commitOperatorCanon must NOT be called during a fail-closed halt (no --apply-canon)",
    ).not.toHaveBeenCalled();
  });

  it("TC-005: all MOCK_STORE.persist calls preserved initial synthesizedCommits", async () => {
    // TC-005: ledger (synthesizedCommits) must not grow during preflight halt
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
    const persistCalls = MOCK_STORE.persist.mock.calls;
    for (const [persistedState] of persistCalls) {
      const sc: string[] = (persistedState as JobState).synthesizedCommits ?? [];
      expect(
        sc,
        "synthesizedCommits must not be modified during a preflight halt",
      ).toEqual(INITIAL_SYNTH_COMMITS);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-006: 未知 commit 検出失敗時（非 exit 128）の fail-closed
// Source: spec.md > preflight は副作用を持たず fail-closed を維持する > Scenario: 未知 commit 検出失敗時の fail-closed
// ---------------------------------------------------------------------------

describe("TC-006: 未知 commit 検出失敗時（非 exit 128）の fail-closed", () => {
  beforeEach(() => {
    // GIVEN: dirty canon exists, preflight detectUnadoptedCommits fails (non-128)
    mockDetectCanonDirtyPaths.mockResolvedValue([DIRTY_PATH]);
    // Non-128 exit: fail-closed (NOT treated as empty range)
    mockDetectUnadoptedCommits.mockRejectedValue(
      new Error("git rev-list failed (exit 1): repository access denied"),
    );
    mockBuildAdoptionHaltMessage.mockReturnValue(DETECTION_FAILED_HALT_MSG);
  });

  it("TC-006: prepare() throws (pipeline does not start)", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "test-slug",
      { cwd: "/repo" },
    );
    await expect(callPrepare(cmd)).rejects.toThrow();
  });

  it("TC-006: buildAdoptionHaltMessage is called with commitDetectionFailed: true", async () => {
    // TC-006: detection failure must be propagated to the builder so operator is informed
    // In RED state: detectUnadoptedCommits is never called in Gate 1 path → fails
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
    const calls = mockBuildAdoptionHaltMessage.mock.calls;
    expect(calls.length, "buildAdoptionHaltMessage must be called").toBeGreaterThan(0);
    const firstCallArg = calls[0]?.[0] as { commitDetectionFailed?: boolean };
    expect(
      firstCallArg?.commitDetectionFailed,
      "buildAdoptionHaltMessage must be called with commitDetectionFailed: true",
    ).toBe(true);
  });

  it("TC-006: output contains detection failure indication", async () => {
    // TC-006: operator must know commit detection was incomplete
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
    const allOutput = allStderrOutput() + "\n" + allLogErrorOutput();
    expect(
      allOutput,
      "output must contain detection failure message from DETECTION_FAILED_HALT_MSG",
    ).toContain(DETECTION_FAILED_HALT_MSG);
  });

  it("TC-006: output does NOT recommend --adopt-commits (detection was incomplete)", async () => {
    // TC-006: must not recommend adopting commits that could not be verified
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
    // DETECTION_FAILED_HALT_MSG does not contain --adopt-commits
    const allStderr = allStderrOutput();
    expect(
      allStderr,
      "stderrWrite output must NOT contain --adopt-commits when detection failed",
    ).not.toContain("--adopt-commits");
  });
});

// ---------------------------------------------------------------------------
// TC-008: 存在しない slug の resume で slug 語彙のエラーを報告する
// Source: spec.md > 未解決 slug の報告文言 > Scenario: 存在しない slug の resume
// ---------------------------------------------------------------------------

describe("TC-008: 存在しない slug の resume で slug 語彙のエラーが報告される", () => {
  beforeEach(() => {
    // GIVEN: no active job matches the slug or job ID prefix
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(null);
    mockJobStateStoreList.mockResolvedValue([]); // no terminal jobs either
    // resolveId throws "not found"
    mockJobStateStoreResolveId.mockRejectedValue(
      new Error("Job not found: no job ID starts with 'nonexistent-slug'"),
    );
  });

  it("TC-008: prepare() throws (exit 1 path)", async () => {
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "nonexistent-slug",
      { cwd: "/repo" },
    );
    await expect(callPrepare(cmd)).rejects.toThrow();
  });

  it("TC-008: logError output contains slug-vocabulary message", async () => {
    // TC-008: operator sees slug-vocabulary error, not raw job-ID error
    // In RED state: logError gets "Job not found: no job ID starts with 'nonexistent-slug'"
    //   which does NOT contain "no active job with slug or job ID prefix" → fails
    // In GREEN state: logError gets the new wrapped message → passes
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "nonexistent-slug",
      { cwd: "/repo" },
    );
    try {
      await callPrepare(cmd);
    } catch {
      // expected
    }
    const allErr = allLogErrorOutput() + "\n" + allStderrOutput();
    expect(
      allErr,
      "output must contain slug-vocabulary language (slug or job ID prefix not found)",
    ).toMatch(/no active job with slug or job ID prefix|slug.*not found|not found.*slug/i);
  });

  it("TC-008: the output references the slug value that was provided", async () => {
    // TC-008: operator must see the value they used to resume so they can verify it
    const cmd = new ResumeCommand(
      {} as never,
      {} as never,
      "nonexistent-slug",
      { cwd: "/repo" },
    );
    try {
      await callPrepare(cmd);
    } catch {
      // expected
    }
    const allErr = allLogErrorOutput() + "\n" + allStderrOutput();
    expect(allErr).toContain("nonexistent-slug");
  });
});
