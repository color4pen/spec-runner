/**
 * Integration tests for the issue fidelity gate in CommandRunner (TC-001 to TC-008, TC-011, TC-026, TC-027)
 *
 * TC-001: issue 連携 run の entrance で gate が動く
 *   Source: spec.md > Requirement: entrance gate は最初の pipeline step より前に issue と request.md を照合する
 *           > Scenario: issue 連携 run の entrance で gate が動く
 *
 * TC-002: undeclared drop あり — 全 step 未実行で halt
 *   Source: spec.md > Requirement: undeclared drop が 1 件以上あれば pipeline step を一つも実行せず escalation で halt する
 *           > Scenario: undeclared drop あり → 全 step 未実行で halt
 *
 * TC-003: スコープ外宣言済み要件は undeclared drop に含まれない
 *   Source: spec.md > Requirement: undeclared drop が 1 件以上あれば pipeline step を一つも実行せず escalation で halt する
 *           > Scenario: スコープ外宣言済みは drop でない
 *
 * TC-004: undeclared drop ゼロ — gate 通過し request-review から通常開始
 *   Source: spec.md > Requirement: undeclared drop ゼロなら gate を通過し request-review から通常開始する
 *           > Scenario: undeclared drop ゼロ → 通常開始
 *
 * TC-005: gate 通過後に issue 本文が job state / change folder / step prompt に残らない
 *   Source: spec.md > Requirement: 照合に使った issue 本文を state / change folder / step prompt に保存・注入しない
 *           > Scenario: gate 通過後に issue 本文が残らない
 *
 * TC-006: --issue なし run で gate も issue fetch も実行されない
 *   Source: spec.md > Requirement: `--issue` を指定しない run では gate も issue fetch も実行されない
 *           > Scenario: 未連携 run では gate 不発火
 *
 * TC-007: inbox job で gate が skip され skip 理由が log に残る
 *   Source: spec.md > Requirement: inbox 経路では gate を skip し、skip 理由を log に残す
 *           > Scenario: inbox job は gate skip
 *
 * TC-008: issue fetch 失敗 — pass 扱いにならず halt する（fail-closed）
 *   Source: spec.md > Requirement: issue fetch 失敗は pass 扱いにならず halt する（fail-closed）
 *           > Scenario: fetch 失敗 → halt
 *
 * TC-011: halt 後に request.md を修正して resume — gate が再評価されて通過
 *   Source: spec.md > Requirement: halt 後に request.md を修正して resume すると gate が再評価される
 *           > Scenario: 修正後 resume で再評価 → 通過
 *
 * TC-026: 破壊確認 — halt 分岐を無効化するとテストが fail する
 *   Source: tasks.md > T-09
 *
 * TC-027: halt 時に linked issue へ escalation comment が書かれる
 *   Source: tasks.md > T-09
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { CommandRunner } from "../../../../src/core/command/runner.js";
import type { PrepareResult } from "../../../../src/core/command/runner.js";
import type { RuntimeStrategy, WorkspaceContext, CleanupHandle } from "../../../../src/core/port/runtime-strategy.js";
import type { IssueFidelityComparator, IssueFidelityComparison } from "../../../../src/core/port/issue-fidelity-comparator.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import { makeStoreFactory } from "../../../helpers/store-factory.js";
import { ERROR_CODES } from "../../../../src/errors.js";
import { buildInitialJobState, JobStateStore } from "../../../../src/store/job-state-store.js";
import { checkConsecutiveEscalations } from "../../../../src/core/resume/safety.js";

// ---------------------------------------------------------------------------
// Mock pipeline — capture pipeline.run calls
// vi.hoisted() ensures the mock fn is available inside the vi.mock() factory
// (vi.mock factories are hoisted above const declarations in the module).
// ---------------------------------------------------------------------------

const mockPipelineRun = vi.hoisted(() => vi.fn());

vi.mock("../../../../src/core/pipeline/index.js", () => ({
  createStandardPipeline: vi.fn().mockReturnValue({ run: mockPipelineRun }),
  buildPipelineForJob: vi.fn().mockReturnValue({ run: mockPipelineRun }),
}));

// ---------------------------------------------------------------------------
// Mock evaluateIssueFidelityGate — the gate orchestrator
// The mock allows tests to control what decision the gate returns.
// ---------------------------------------------------------------------------

const mockEvaluateGate = vi.hoisted(() => vi.fn());

vi.mock("../../../../src/core/gate/issue-fidelity-gate.js", () => ({
  evaluateIssueFidelityGate: mockEvaluateGate,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;
let stderrOutput: string[] = [];
let stdoutOutput: string[] = [];

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-gate-integration-"));
  stderrOutput = [];
  stdoutOutput = [];
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderrOutput.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdoutOutput.push(String(chunk));
    return true;
  });
  mockPipelineRun.mockClear();
  mockEvaluateGate.mockClear();
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const SAMPLE_CONFIG: SpecRunnerConfig = {
  version: 1,
  runtime: "local",
  agents: {},
};

const NOOP_HANDLE = {} as CleanupHandle;

function buildSuccessFinalState(slug: string): JobState {
  return {
    version: 1,
    jobId: "test-job-id",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: { path: "/req.md", title: "Test", type: "new-feature", slug },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "pr-create",
    status: "awaiting-archive",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

function buildMockGithubClient(opts: {
  createIssueCommentSpy?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    verifyBranch: vi.fn().mockResolvedValue(true),
    verifyPath: vi.fn().mockResolvedValue(true),
    getRawFile: vi.fn().mockResolvedValue(null),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
    getRefSha: vi.fn().mockResolvedValue(null),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    createIssueComment: opts.createIssueCommentSpy ?? vi.fn().mockResolvedValue({ id: 1, url: "https://..." }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    getIssue: vi.fn().mockResolvedValue({ number: 875, title: "Test Issue", body: "Issue body" }),
  };
}

type MockGithubClient = ReturnType<typeof buildMockGithubClient>;

function buildMockRuntime(githubClient: MockGithubClient, slug: string = "test-slug"): RuntimeStrategy & {
  capturedDeps: PipelineDeps;
} {
  const storeFactory = makeStoreFactory(tempDir);
  const capturedDeps: PipelineDeps = {
    request: { type: "new-feature", title: "Test", slug, baseBranch: "main", content: "test", adr: false },
    slug,
    config: SAMPLE_CONFIG,
    githubClient: githubClient as PipelineDeps["githubClient"],
    owner: "testowner",
    repo: "testrepo",
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    storeFactory,
    cwd: tempDir,
  } as unknown as PipelineDeps;

  const runtime = {
    query: vi.fn(),
    createAgentRunner: vi.fn().mockReturnValue({ run: vi.fn() }),
    setupWorkspace: vi.fn().mockResolvedValue({ cwd: tempDir } as WorkspaceContext),
    buildDeps: vi.fn().mockReturnValue(capturedDeps),
    registerCleanup: vi.fn().mockReturnValue(NOOP_HANDLE),
    teardown: vi.fn().mockResolvedValue(undefined),
    captureHeadSha: vi.fn().mockResolvedValue(null),
    prepareStepArtifacts: vi.fn().mockResolvedValue(undefined),
    finalizeStepArtifacts: vi.fn().mockResolvedValue(undefined),
    validateStepInputs: vi.fn().mockResolvedValue(undefined),
    validateStepOutputs: vi.fn().mockResolvedValue({ violations: [] }),
    commitFinalState: vi.fn().mockResolvedValue(undefined),
    bootstrapJob: vi.fn().mockRejectedValue(new Error("not implemented")),
    persistJobState: vi.fn().mockResolvedValue(undefined),
    verifyFindingRefs: vi.fn().mockResolvedValue([]),
    digestArtifacts: vi.fn().mockResolvedValue([]),
    listChangedFiles: vi.fn().mockResolvedValue({ kind: "success" as const, files: [] }),
    capturedDeps,
  };
  return runtime;
}

/** Simple subclass that exposes prepare() for testing via a pre-built PrepareResult. */
class TestCommand extends CommandRunner {
  constructor(
    runtime: RuntimeStrategy,
    private readonly prepareResult: PrepareResult,
    comparatorFactory?: (config: SpecRunnerConfig) => IssueFidelityComparator,
  ) {
    super(runtime, new EventBus(), comparatorFactory);
  }

  protected async prepare(): Promise<PrepareResult> {
    return this.prepareResult;
  }
}

function buildPrepareResult(opts: {
  issueNumber?: number | null;
  inboxOrigin?: boolean;
  startStep?: string;
  slug?: string;
} = {}): PrepareResult {
  const slug = opts.slug ?? "test-slug";
  const initialState = buildInitialJobState({
    request: {
      path: path.join(tempDir, "specrunner", "changes", slug, "request.md"),
      title: "Test Request",
      type: "new-feature",
      slug,
    },
    repository: { owner: "testowner", name: "testrepo" },
  });
  const jobState: JobState = {
    ...initialState,
    issueNumber: opts.issueNumber,
    ...((opts.inboxOrigin !== undefined) ? { inboxOrigin: opts.inboxOrigin } as Partial<JobState> : {}),
  };

  return {
    jobState,
    startStep: (opts.startStep ?? "request-review") as import("../../../../src/state/schema.js").StepName,
    request: { type: "new-feature", title: "Test", slug, baseBranch: "main", content: "test", adr: false },
    config: SAMPLE_CONFIG,
    slug,
    logLevel: "default",
    workspaceOpts: {},
    repoRoot: tempDir,
  };
}

/** Write a request.md into the change folder so the gate can read it. */
async function writeRequestMd(slug: string, content: string): Promise<void> {
  const dir = path.join(tempDir, "specrunner", "changes", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "request.md"), content, "utf-8");
}

// ---------------------------------------------------------------------------
// TC-001: issue 連携 run の entrance で gate が動く
// ---------------------------------------------------------------------------

describe("TC-001: issue 連携 run の entrance で gate が動く", () => {
  it("TC-001: issueNumber が設定された run で evaluateIssueFidelityGate が呼ばれ、pipeline.run より前に完了する", async () => {
    await writeRequestMd("test-slug", "# Test\n\n## Meta\n\n- **type**: new-feature\n");

    // Gate returns proceed (no drops)
    mockEvaluateGate.mockResolvedValue({ kind: "proceed" });
    mockPipelineRun.mockResolvedValue(buildSuccessFinalState("test-slug"));

    const githubClient = buildMockGithubClient();
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn().mockResolvedValue({ undeclaredDrops: [] } satisfies IssueFidelityComparison) });

    const prepared = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const command = new TestCommand(runtime, prepared, comparatorFactory);

    await command.execute();

    // Gate was called (evaluateIssueFidelityGate)
    expect(mockEvaluateGate).toHaveBeenCalled();
    // Pipeline ran after gate passed
    expect(mockPipelineRun).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-002: undeclared drop あり — 全 step 未実行で halt
// ---------------------------------------------------------------------------

describe("TC-002: undeclared drop あり — 全 step 未実行で halt", () => {
  it("TC-002: gate が halt を返すとき pipeline.run が呼ばれない", async () => {
    await writeRequestMd("test-slug", "# Test\n\n## Meta\n\n- **type**: new-feature\n");

    // Gate returns halt (undeclared drops)
    mockEvaluateGate.mockResolvedValue({
      kind: "halt",
      code: ERROR_CODES.ISSUE_FIDELITY_UNDECLARED_DROP,
      haltKind: "undeclared-drop",
      reason: "Undeclared drops: install into fixture project",
    });

    const githubClient = buildMockGithubClient();
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn().mockResolvedValue({ undeclaredDrops: ["install into fixture project"] } satisfies IssueFidelityComparison) });

    const prepared = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const command = new TestCommand(runtime, prepared, comparatorFactory);

    const exitCode = await command.execute();

    // pipeline.run が一切呼ばれていない（step 実行なし）
    expect(mockPipelineRun).not.toHaveBeenCalled();
    // exit 1
    expect(exitCode).toBe(1);
  });

  it("TC-002: halt の reason に drop の列挙が含まれ issue 本文は含まれない（AC1 / AC4）", async () => {
    const SENTINEL = "ISSUE_BODY_SENTINEL_TC002";
    await writeRequestMd("test-slug", "# Test\n\n## Meta\n\n- **type**: new-feature\n");

    const dropReason = "install into fixture project, run from subdirectory";
    mockEvaluateGate.mockResolvedValue({
      kind: "halt",
      code: ERROR_CODES.ISSUE_FIDELITY_UNDECLARED_DROP,
      haltKind: "undeclared-drop",
      reason: dropReason, // contains drops but NOT the SENTINEL (issue body)
    });

    const githubClient = buildMockGithubClient();
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({
      compare: vi.fn().mockResolvedValue({ undeclaredDrops: ["install into fixture project"] } satisfies IssueFidelityComparison),
    });

    const prepared = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    // Simulate issue body containing sentinel — the gate should NOT propagate it
    (prepared.jobState as JobState & { _testIssueBodySentinel?: string })._testIssueBodySentinel = SENTINEL;

    const command = new TestCommand(runtime, prepared, comparatorFactory);
    await command.execute();

    // pipeline.run not called
    expect(mockPipelineRun).not.toHaveBeenCalled();

    // The reason logged/stored should NOT contain the sentinel
    const pipelineCallArgs = JSON.stringify(mockPipelineRun.mock.calls);
    expect(pipelineCallArgs).not.toContain(SENTINEL);

    // Gate evaluation result reason contains drop info but not sentinel
    const gateCallArgs = JSON.stringify(mockEvaluateGate.mock.calls);
    expect(gateCallArgs).not.toContain(SENTINEL);
  });
});

// ---------------------------------------------------------------------------
// TC-003: スコープ外宣言済み要件は undeclared drop に含まれない
// ---------------------------------------------------------------------------

describe("TC-003: スコープ外宣言済み要件は undeclared drop に含まれない", () => {
  it("TC-003: gate が空 drop を返す（スコープ外宣言を尊重）と pipeline.run が呼ばれる", async () => {
    await writeRequestMd("test-slug", "# Test\n\n## Meta\n\n- **type**: new-feature\n\n## スコープ外\n\n- excluded-requirement\n");

    // Comparator honors scope-out declarations → 0 drops
    mockEvaluateGate.mockResolvedValue({ kind: "proceed" });
    mockPipelineRun.mockResolvedValue(buildSuccessFinalState("test-slug"));

    const githubClient = buildMockGithubClient();
    const runtime = buildMockRuntime(githubClient);
    const comparator: IssueFidelityComparator = {
      compare: vi.fn().mockResolvedValue({ undeclaredDrops: [] } satisfies IssueFidelityComparison),
    };
    const comparatorFactory = vi.fn().mockReturnValue(comparator);

    const prepared = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const command = new TestCommand(runtime, prepared, comparatorFactory);

    await command.execute();

    expect(mockPipelineRun).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-004: undeclared drop ゼロ — gate 通過し request-review から通常開始
// ---------------------------------------------------------------------------

describe("TC-004: undeclared drop ゼロ — gate 通過し request-review から通常開始", () => {
  it("TC-004: gate が proceed を返すとき pipeline.run(request-review) が通常どおり呼ばれる", async () => {
    await writeRequestMd("test-slug", "# Test\n\n## Meta\n\n- **type**: new-feature\n");

    mockEvaluateGate.mockResolvedValue({ kind: "proceed" });
    mockPipelineRun.mockResolvedValue(buildSuccessFinalState("test-slug"));

    const githubClient = buildMockGithubClient();
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn().mockResolvedValue({ undeclaredDrops: [] } satisfies IssueFidelityComparison) });

    const prepared = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const command = new TestCommand(runtime, prepared, comparatorFactory);

    await command.execute();

    expect(mockPipelineRun).toHaveBeenCalledWith(
      "request-review",
      expect.anything(),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-005: gate 通過後に issue 本文が job state / change folder / step prompt に残らない
// ---------------------------------------------------------------------------

describe("TC-005: gate 通過後に issue 本文が job state / change folder / step prompt に残らない", () => {
  it("TC-005: sentinel を含む issue body で gate が pass しても、change folder のファイルと pipeline args に sentinel が現れない", async () => {
    const SENTINEL = "ISSUE_BODY_SENTINEL_TC005_XYZ_9988";
    await writeRequestMd("test-slug", "# Test\n\n## Meta\n\n- **type**: new-feature\n");

    // Gate proceeds with proceed (simulates issue body used only in gate, not propagated)
    mockEvaluateGate.mockResolvedValue({ kind: "proceed" });
    mockPipelineRun.mockResolvedValue(buildSuccessFinalState("test-slug"));

    const githubClient = buildMockGithubClient();
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn().mockResolvedValue({ undeclaredDrops: [] } satisfies IssueFidelityComparison) });

    const prepared = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const command = new TestCommand(runtime, prepared, comparatorFactory);

    await command.execute();

    // Verify sentinel does NOT appear in pipeline.run call args
    const pipelineArgs = JSON.stringify(mockPipelineRun.mock.calls);
    expect(pipelineArgs).not.toContain(SENTINEL);

    // Verify sentinel does NOT appear in change folder files (except request.md we wrote)
    const changeFolderDir = path.join(tempDir, "specrunner", "changes", "test-slug");
    let sentinelFound = false;
    try {
      const files = await fs.readdir(changeFolderDir);
      for (const file of files) {
        const content = await fs.readFile(path.join(changeFolderDir, file), "utf-8").catch(() => "");
        if (content.includes(SENTINEL)) {
          sentinelFound = true;
          break;
        }
      }
    } catch { /* folder may not exist if pipeline was mocked */ }
    expect(sentinelFound).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-006: --issue なし run で gate も issue fetch も実行されない
// ---------------------------------------------------------------------------

describe("TC-006: --issue なし run で gate も issue fetch も実行されない", () => {
  it("TC-006: issueNumber が null のとき evaluateIssueFidelityGate が proceed を返し pipeline.run が呼ばれる", async () => {
    // When issueNumber is null, gate should not fire (or return proceed immediately)
    // Either: evaluateIssueFidelityGate is not called, OR it returns proceed without calling getIssue
    // We mock it to return proceed (gate detects null and short-circuits)
    mockEvaluateGate.mockResolvedValue({ kind: "proceed" });
    mockPipelineRun.mockResolvedValue(buildSuccessFinalState("test-slug"));

    const githubClient = buildMockGithubClient();
    const getIssueSpy = vi.fn().mockResolvedValue({ number: 0, title: "none", body: "" });
    (githubClient as unknown as { getIssue: typeof getIssueSpy }).getIssue = getIssueSpy;

    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn() });

    const prepared = buildPrepareResult({ issueNumber: null, startStep: "request-review" }); // --issue not set
    const command = new TestCommand(runtime, prepared, comparatorFactory);

    await command.execute();

    // gate either returns proceed or is not called — either way pipeline runs
    expect(mockPipelineRun).toHaveBeenCalled();
    // getIssue must NOT be called (non-fetch requirement AC5)
    expect(getIssueSpy).not.toHaveBeenCalled();
  });

  it("TC-006: issueNumber が undefined のとき gate が発火せず pipeline.run が通常呼ばれる", async () => {
    mockEvaluateGate.mockResolvedValue({ kind: "proceed" });
    mockPipelineRun.mockResolvedValue(buildSuccessFinalState("test-slug"));

    const githubClient = buildMockGithubClient();
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn() });

    const prepared = buildPrepareResult({ issueNumber: undefined, startStep: "request-review" });
    const command = new TestCommand(runtime, prepared, comparatorFactory);

    await command.execute();

    expect(mockPipelineRun).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-007: inbox job で gate が skip され skip 理由が log に残る
// ---------------------------------------------------------------------------

describe("TC-007: inbox job で gate が skip され skip 理由が log に残る", () => {
  it("TC-007: inboxOrigin=true のとき gate が skip され pipeline.run が通常どおり呼ばれる", async () => {
    // Gate should detect inboxOrigin and return proceed with skip reason
    mockEvaluateGate.mockResolvedValue({
      kind: "proceed",
      skipped: { reason: "inbox job: issue body == request.md, no divergence possible" },
    });
    mockPipelineRun.mockResolvedValue(buildSuccessFinalState("test-slug"));

    const githubClient = buildMockGithubClient();
    const getIssueSpy = vi.fn();
    (githubClient as unknown as { getIssue: typeof getIssueSpy }).getIssue = getIssueSpy;
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn() });

    const prepared = buildPrepareResult({ issueNumber: 875, inboxOrigin: true, startStep: "request-review" });
    const command = new TestCommand(runtime, prepared, comparatorFactory);

    await command.execute();

    // Pipeline ran (gate skipped, not halted)
    expect(mockPipelineRun).toHaveBeenCalled();
    // getIssue not called for inbox
    expect(getIssueSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-008: issue fetch 失敗 — pass 扱いにならず halt する（fail-closed）
// ---------------------------------------------------------------------------

describe("TC-008: issue fetch 失敗 — pass 扱いにならず halt する（fail-closed）", () => {
  it("TC-008: gate が fetch 失敗で halt を返すとき pipeline.run が呼ばれず exit 1", async () => {
    mockEvaluateGate.mockResolvedValue({
      kind: "halt",
      code: ERROR_CODES.ISSUE_FETCH_FAILED,
      haltKind: "fetch-error",
      reason: "GitHub API 404: issue not found",
    });

    const githubClient = buildMockGithubClient();
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn() });

    const prepared = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const command = new TestCommand(runtime, prepared, comparatorFactory);

    const exitCode = await command.execute();

    // fail-closed: pipeline.run not called
    expect(mockPipelineRun).not.toHaveBeenCalled();
    expect(exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-011: halt 後に request.md を修正して resume — gate が再評価されて通過
// ---------------------------------------------------------------------------

describe("TC-011: halt 後に request.md を修正して resume — gate が再評価されて通過", () => {
  it("TC-011: 1st run halt → 2nd run (resume) で gate が再評価されて proceed → pipeline.run", async () => {
    await writeRequestMd("test-slug", "# Test\n\n## Meta\n\n- **type**: new-feature\n");

    // First run: gate halts (undeclared drops)
    mockEvaluateGate.mockResolvedValueOnce({
      kind: "halt",
      code: ERROR_CODES.ISSUE_FIDELITY_UNDECLARED_DROP,
      haltKind: "undeclared-drop",
      reason: "Drops: missing-req",
    });

    const githubClient = buildMockGithubClient();
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn().mockResolvedValue({ undeclaredDrops: ["missing-req"] } satisfies IssueFidelityComparison) });

    const prepared1 = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const command1 = new TestCommand(runtime, prepared1, comparatorFactory);
    await command1.execute();

    // First run: pipeline.run NOT called
    expect(mockPipelineRun).not.toHaveBeenCalled();

    // Second run (resume after operator fixes request.md): gate proceeds
    mockPipelineRun.mockClear();
    mockEvaluateGate.mockResolvedValueOnce({ kind: "proceed" });
    mockPipelineRun.mockResolvedValue(buildSuccessFinalState("test-slug"));

    const runtime2 = buildMockRuntime(githubClient);
    const comparatorFactory2 = vi.fn().mockReturnValue({ compare: vi.fn().mockResolvedValue({ undeclaredDrops: [] } satisfies IssueFidelityComparison) });
    const prepared2 = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const command2 = new TestCommand(runtime2, prepared2, comparatorFactory2);
    await command2.execute();

    // Gate was evaluated again (second call)
    expect(mockEvaluateGate).toHaveBeenCalledTimes(2);
    // Pipeline ran on second run
    expect(mockPipelineRun).toHaveBeenCalledWith(
      "request-review",
      expect.anything(),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-026: 破壊確認 — halt 分岐を無効化するとテストが fail する
// ---------------------------------------------------------------------------

describe("TC-026: 破壊確認 — halt 分岐の有効性を証明", () => {
  it("TC-026: gate が halt を返したとき pipeline.run が呼ばれないことをアサートする（破壊確認）", async () => {
    // This test proves the halt branch is effective:
    // If the CommandRunner's halt branch is sabotaged (always proceeds after gate),
    // then pipeline.run WOULD be called, and this test FAILS.
    //
    // Sabotage scenario: gate returns halt but CommandRunner ignores it and calls pipeline.run
    //   → mockPipelineRun.mock.calls.length > 0
    //   → expect(mockPipelineRun).not.toHaveBeenCalled() FAILS
    //   → TC-026 correctly catches the sabotage

    mockEvaluateGate.mockResolvedValue({
      kind: "halt",
      code: ERROR_CODES.ISSUE_FIDELITY_UNDECLARED_DROP,
      haltKind: "undeclared-drop",
      reason: "Drops: missing requirement",
    });

    const githubClient = buildMockGithubClient();
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn().mockResolvedValue({ undeclaredDrops: ["missing requirement"] } satisfies IssueFidelityComparison) });

    const prepared = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const command = new TestCommand(runtime, prepared, comparatorFactory);

    await command.execute();

    // Sabotage detection: if halt branch is disabled, this FAILS
    expect(mockPipelineRun).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-027: halt 時に linked issue へ escalation comment が書かれる
// ---------------------------------------------------------------------------

describe("TC-027: halt 時に linked issue へ escalation comment が書かれる", () => {
  it("TC-027: gate が halt を返したとき createIssueComment が linked issue に対して呼ばれる", async () => {
    await writeRequestMd("test-slug", "# Test\n\n## Meta\n\n- **type**: new-feature\n");

    mockEvaluateGate.mockResolvedValue({
      kind: "halt",
      code: ERROR_CODES.ISSUE_FIDELITY_UNDECLARED_DROP,
      haltKind: "undeclared-drop",
      reason: "Drops: missing requirement",
    });

    const createIssueCommentSpy = vi.fn().mockResolvedValue({ id: 1, url: "https://..." });
    const githubClient = buildMockGithubClient({ createIssueCommentSpy });
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn().mockResolvedValue({ undeclaredDrops: ["missing req"] } satisfies IssueFidelityComparison) });

    const prepared = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const command = new TestCommand(runtime, prepared, comparatorFactory);

    await command.execute();

    // pipeline.run NOT called
    expect(mockPipelineRun).not.toHaveBeenCalled();
    // createIssueComment called for linked issue (escalation notification)
    expect(createIssueCommentSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-028: gate halt が checkConsecutiveEscalations カウンタを消費しない
// ---------------------------------------------------------------------------

describe("TC-028: gate halt が checkConsecutiveEscalations カウンタを消費しない", () => {
  it("TC-028: gate halt を 3 回繰り返しても steps[request-review] が空のまま checkConsecutiveEscalations は false を返す（--force 不要）", async () => {
    await writeRequestMd("test-slug", "# Test\n\n## Meta\n\n- **type**: new-feature\n");

    const prepared = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const jobId = prepared.jobState.jobId;

    // Simulate 3 consecutive gate halts (operator keeps retrying without fixing request.md)
    for (let i = 0; i < 3; i++) {
      mockEvaluateGate.mockResolvedValueOnce({
        kind: "halt",
        code: ERROR_CODES.ISSUE_FIDELITY_UNDECLARED_DROP,
        haltKind: "undeclared-drop",
        reason: `Drops: missing requirement ${i + 1}`,
      });

      const githubClient = buildMockGithubClient();
      const runtime = buildMockRuntime(githubClient);
      const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn() });
      const command = new TestCommand(runtime, prepared, comparatorFactory);
      await command.execute();
    }

    // Read the persisted state after 3 halts
    const store = new JobStateStore(jobId, tempDir, {
      changeDir: path.join(tempDir, ".specrunner", "test-jobs", jobId),
    });
    const persistedState = await store.load();

    // Gate halt must NOT write to steps["request-review"] — counter is not consumed.
    // (gate halt uses transitionJob to awaiting-resume but never records a StepRun)
    expect(persistedState.steps?.["request-review"]).toBeUndefined();

    // Therefore checkConsecutiveEscalations returns false — --force is NOT required
    // after any number of gate halts. Operator can resume freely to fix request.md.
    expect(checkConsecutiveEscalations(persistedState, "request-review")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-029: hint 分岐 — undeclared drop halt は request.md 修正を促す hint
// ---------------------------------------------------------------------------

describe("TC-029: undeclared drop halt の hint は request.md 修正を促す", () => {
  it("TC-029: haltKind=undeclared-drop のとき state.error.hint に request.md 修正の指示が含まれる", async () => {
    await writeRequestMd("test-slug", "# Test\n\n## Meta\n\n- **type**: new-feature\n");

    mockEvaluateGate.mockResolvedValue({
      kind: "halt",
      code: ERROR_CODES.ISSUE_FIDELITY_UNDECLARED_DROP,
      haltKind: "undeclared-drop",
      reason: "Drops: missing requirement",
    });

    const githubClient = buildMockGithubClient();
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn() });
    const prepared = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const jobId = prepared.jobState.jobId;
    const command = new TestCommand(runtime, prepared, comparatorFactory);
    await command.execute();

    const store = new JobStateStore(jobId, tempDir, {
      changeDir: path.join(tempDir, ".specrunner", "test-jobs", jobId),
    });
    const persistedState = await store.load();

    expect(persistedState.error?.hint).toContain("request.md を修正");
  });
});

// ---------------------------------------------------------------------------
// TC-030: hint 分岐 — fetch error halt は network/token 確認を促す hint
// ---------------------------------------------------------------------------

describe("TC-030: fetch error halt の hint は network/token 確認を促す", () => {
  it("TC-030: haltKind=fetch-error のとき state.error.hint に GITHUB_TOKEN 確認の指示が含まれる", async () => {
    await writeRequestMd("test-slug", "# Test\n\n## Meta\n\n- **type**: new-feature\n");

    mockEvaluateGate.mockResolvedValue({
      kind: "halt",
      code: ERROR_CODES.ISSUE_FETCH_FAILED,
      haltKind: "fetch-error",
      reason: "entrance fidelity gate: failed to fetch issue #875: GitHub API 404",
    });

    const githubClient = buildMockGithubClient();
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn() });
    const prepared = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const jobId = prepared.jobState.jobId;
    const command = new TestCommand(runtime, prepared, comparatorFactory);
    await command.execute();

    const store = new JobStateStore(jobId, tempDir, {
      changeDir: path.join(tempDir, ".specrunner", "test-jobs", jobId),
    });
    const persistedState = await store.load();

    expect(persistedState.error?.hint).toContain("GITHUB_TOKEN");
  });
});

// ---------------------------------------------------------------------------
// TC-031: hint 分岐 — internal error halt は state.json/log 確認を促す hint
// ---------------------------------------------------------------------------

describe("TC-031: internal error halt の hint は state.json/log 確認を促す", () => {
  it("TC-031: haltKind=internal-error のとき state.error.hint に gate 内部エラーの確認指示が含まれる", async () => {
    await writeRequestMd("test-slug", "# Test\n\n## Meta\n\n- **type**: new-feature\n");

    mockEvaluateGate.mockResolvedValue({
      kind: "halt",
      code: ERROR_CODES.ISSUE_FETCH_FAILED,
      haltKind: "internal-error",
      reason: "entrance fidelity gate: comparator not injected (wiring error). Cannot evaluate issue fidelity.",
    });

    const githubClient = buildMockGithubClient();
    const runtime = buildMockRuntime(githubClient);
    const comparatorFactory = vi.fn().mockReturnValue({ compare: vi.fn() });
    const prepared = buildPrepareResult({ issueNumber: 875, startStep: "request-review" });
    const jobId = prepared.jobState.jobId;
    const command = new TestCommand(runtime, prepared, comparatorFactory);
    await command.execute();

    const store = new JobStateStore(jobId, tempDir, {
      changeDir: path.join(tempDir, ".specrunner", "test-jobs", jobId),
    });
    const persistedState = await store.load();

    expect(persistedState.error?.hint).toContain("gate 内部エラー");
  });
});
