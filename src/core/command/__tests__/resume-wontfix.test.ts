/**
 * Tests for ResumeCommand.prepare() — --wontfix / --wontfix-reason flag behavior.
 *
 * TC-003: --wontfix が発生 step 由来の disposition record を永続する
 * TC-005: --prompt と --wontfix は併用できる
 * TC-006: regression-gate 未実行で exit code 2
 * TC-007: 番号が範囲外で exit code 2
 * TC-008: reason 欠落で exit code 2
 * TC-013: --wontfix 無しの resume は挙動不変
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

vi.mock("../../worktree/detection.js", () => ({
  detectSpecrunnerWorktree: vi.fn().mockResolvedValue({ isSpecrunnerWorktree: false }),
}));

vi.mock("../../resume/resolve-worktree-path.js", () => ({
  resolveLivenessWorktreePath: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../resume/apply-canon.js", () => ({
  detectCanonDirtyPaths: vi.fn().mockResolvedValue([]),
  commitOperatorCanon: vi.fn(),
}));

vi.mock("../../resume/adopt-commits.js", () => ({
  detectUnadoptedCommits: vi.fn().mockResolvedValue([]),
  buildAdoptEscalationMessage: vi.fn().mockReturnValue(""),
}));

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
import { computeLedgerRef } from "../../pipeline/findings-ledger.js";
import type { JobState, DispositionDecisionRecord } from "../../../state/schema.js";
import type { Finding } from "../../../kernel/report-result.js";
import type { StepRun } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_REQUEST = {
  title: "Test request",
  type: "new-feature" as const,
  slug: "test-slug",
  baseBranch: "main",
  adr: false,
  content: "# Request",
  path: "specrunner/changes/test-slug/request.md",
};

const MOCK_CONFIG = { version: 1, steps: {} };

const MOCK_STORE = {
  persist: vi.fn().mockResolvedValue(undefined),
};

function makeFixableFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "high",
    resolution: "fixable",
    file: "src/vuln.ts",
    line: 10,
    title: "SQL injection",
    rationale: "Unescaped input",
    ...overrides,
  };
}

function makeStepRun(findings: Finding[]): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T00:01:00Z",
    outcome: {
      verdict: "needs-fix",
      findingsPath: null,
      error: null,
      toolResult: { ok: true, findings },
    },
  };
}

function makeAwaitingResumeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-wontfix-test",
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
    step: "regression-gate",
    status: "awaiting-resume",
    branch: "feat/test-slug-abc12345",
    history: [],
    error: null,
    resumePoint: {
      step: "regression-gate",
      reason: "regression-gate escalated",
      iterationsExhausted: 0,
    },
    steps: {},
    ...overrides,
  };
}

function makeRunningState(base: JobState): JobState {
  return { ...base, status: "running", resumePoint: null, pid: process.pid };
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
// TC-013: --wontfix 無しの resume は挙動不変
// ---------------------------------------------------------------------------

describe("TC-013: --wontfix 無しの resume は挙動不変", () => {
  it("no disposition records added when --wontfix is absent", async () => {
    const baseState = makeAwaitingResumeState();
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(baseState);
    vi.mocked(transitionJob).mockReturnValue({ state: makeRunningState(baseState), noop: false });

    const cmd = new ResumeCommand({} as never, {} as never, "test-slug", { cwd: "/repo" });
    await callPrepare(cmd);

    expect(MOCK_STORE.persist).toHaveBeenCalled();
    const persisted = vi.mocked(MOCK_STORE.persist).mock.calls[0]![0] as JobState;
    const dispositions = (persisted.decisions ?? []).filter(
      (d) => d.kind === "disposition",
    );
    expect(dispositions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-006: regression-gate 未実行で exit code 2
// ---------------------------------------------------------------------------

describe("TC-006: regression-gate 未実行で exit code 2", () => {
  it("exits with code 2 when gate has no StepRun", async () => {
    // State with no regression-gate steps
    const baseState = makeAwaitingResumeState({ steps: {} });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(baseState);
    vi.mocked(transitionJob).mockReturnValue({ state: makeRunningState(baseState), noop: false });

    const cmd = new ResumeCommand(
      {} as never, {} as never, "test-slug",
      { cwd: "/repo", wontfix: "1", wontfixReason: "reason" },
    );
    const exitCode = await cmd.execute();
    expect(exitCode).toBe(2);
    // decisions must be unchanged (nothing persisted with disposition)
    expect(MOCK_STORE.persist).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-007: 番号が範囲外で exit code 2
// ---------------------------------------------------------------------------

describe("TC-007: 番号が範囲外で exit code 2", () => {
  it("exits with code 2 when index 3 exceeds 2 reported findings", async () => {
    const f1 = makeFixableFinding({ title: "F1", file: "a.ts" });
    const f2 = makeFixableFinding({ title: "F2", file: "b.ts" });

    const baseState = makeAwaitingResumeState({
      steps: {
        "regression-gate": [makeStepRun([f1, f2])],
        "code-review": [makeStepRun([f1, f2])],
      },
    });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(baseState);
    vi.mocked(transitionJob).mockReturnValue({ state: makeRunningState(baseState), noop: false });

    const cmd = new ResumeCommand(
      {} as never, {} as never, "test-slug",
      { cwd: "/repo", wontfix: "3", wontfixReason: "reason" },
    );
    const exitCode = await cmd.execute();
    expect(exitCode).toBe(2);
    expect(MOCK_STORE.persist).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-008: reason 欠落で exit code 2
// ---------------------------------------------------------------------------

describe("TC-008: reason 欠落で exit code 2", () => {
  it("exits with code 2 when --wontfix-reason is missing", async () => {
    const f1 = makeFixableFinding();
    const baseState = makeAwaitingResumeState({
      steps: { "regression-gate": [makeStepRun([f1])], "code-review": [makeStepRun([f1])] },
    });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(baseState);
    vi.mocked(transitionJob).mockReturnValue({ state: makeRunningState(baseState), noop: false });

    const cmd = new ResumeCommand(
      {} as never, {} as never, "test-slug",
      { cwd: "/repo", wontfix: "1" }, // no wontfixReason
    );
    const exitCode = await cmd.execute();
    expect(exitCode).toBe(2);
    expect(MOCK_STORE.persist).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-003: --wontfix が発生 step 由来の disposition record を永続する
// ---------------------------------------------------------------------------

describe("TC-003: --wontfix が発生 step 由来の disposition record を永続する", () => {
  it("persists a DispositionDecisionRecord with correct fields", async () => {
    const finding = makeFixableFinding({ title: "SQL injection", file: "src/db.ts", line: 42 });
    // Gate finding carries the provenance ref (new contract: ref-based resolution)
    const gateFinding = { ...finding, ledgerRef: computeLedgerRef(finding) };

    const baseState = makeAwaitingResumeState({
      steps: {
        "regression-gate": [makeStepRun([gateFinding])],
        "code-review": [makeStepRun([finding])],
      },
    });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(baseState);
    vi.mocked(transitionJob).mockReturnValue({ state: makeRunningState(baseState), noop: false });

    const cmd = new ResumeCommand(
      {} as never, {} as never, "test-slug",
      { cwd: "/repo", wontfix: "1", wontfixReason: "accepted risk" },
    );
    // Use callPrepare to test the persistence without running the full pipeline
    await callPrepare(cmd);

    expect(MOCK_STORE.persist).toHaveBeenCalled();
    const persisted = vi.mocked(MOCK_STORE.persist).mock.calls[0]![0] as JobState;

    const dispositions = (persisted.decisions ?? []).filter(
      (d): d is DispositionDecisionRecord => d.kind === "disposition",
    );
    expect(dispositions).toHaveLength(1);

    const rec = dispositions[0]!;
    expect(rec.step).toBe("code-review");
    expect(rec.source).toBe("operator");
    expect(rec.reason).toBe("accepted risk");
    expect(rec.disposition).toBe("wontfix");
    expect(rec.finding.title).toBe("SQL injection");
  });
});

// ---------------------------------------------------------------------------
// TC-005: --prompt と --wontfix は併用できる
// ---------------------------------------------------------------------------

describe("TC-005: --prompt と --wontfix は併用できる", () => {
  it("records both operatorAdjudication and disposition record", async () => {
    const finding = makeFixableFinding({ title: "XSS", file: "src/render.ts", line: 5 });
    // Gate finding carries the provenance ref (new contract: ref-based resolution)
    const gateFinding = { ...finding, ledgerRef: computeLedgerRef(finding) };

    const baseState = makeAwaitingResumeState({
      steps: {
        "regression-gate": [makeStepRun([gateFinding])],
        "code-review": [makeStepRun([finding])],
      },
    });
    vi.mocked(resolveJobStateBySlug).mockResolvedValue(baseState);
    vi.mocked(transitionJob).mockReturnValue({ state: makeRunningState(baseState), noop: false });

    const cmd = new ResumeCommand(
      {} as never, {} as never, "test-slug",
      {
        cwd: "/repo",
        prompt: "Please also check the auth module",
        wontfix: "1",
        wontfixReason: "mitigated by WAF",
      },
    );
    // Use callPrepare to test persistence without running the full pipeline
    await callPrepare(cmd);

    const persisted = vi.mocked(MOCK_STORE.persist).mock.calls[0]![0] as JobState;

    // operatorAdjudication from --prompt
    expect(persisted.operatorAdjudications).toBeDefined();
    expect(persisted.operatorAdjudications!.length).toBeGreaterThanOrEqual(1);
    expect(persisted.operatorAdjudications![0]!.text).toBe("Please also check the auth module");

    // disposition record from --wontfix
    const dispositions = (persisted.decisions ?? []).filter(
      (d): d is DispositionDecisionRecord => d.kind === "disposition",
    );
    expect(dispositions).toHaveLength(1);
    expect(dispositions[0]!.reason).toBe("mitigated by WAF");
  });
});
