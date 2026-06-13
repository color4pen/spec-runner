/**
 * Unit tests for StepExecutor verdict derivation from findings.
 *
 * TC-VD-001: no-tool-call (null toolResult) → escalation for judge steps
 * TC-VD-002: ok=false report → escalation for judge steps
 * TC-VD-003: non-existent finding ref → verdict escalated to escalation
 * TC-VD-004: all findings exist → verdict not overridden
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { RuntimeStrategy, FindingRef } from "../../../src/core/port/runtime-strategy.js";
import { JUDGE_REPORT_TOOL, CODE_REVIEW_REPORT_TOOL } from "../../../src/core/step/report-tool.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { computeFindingKey } from "../../../src/core/decision/decision-ledger.js";
import type { Finding } from "../../../src/kernel/report-result.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-verdict-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  if (originalXdgDataHome !== undefined) {
    process.env["XDG_DATA_HOME"] = originalXdgDataHome;
  } else {
    delete process.env["XDG_DATA_HOME"];
  }
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function seedJobState(jobId: string, state: JobState): Promise<void> {
  const jobsDir = path.join(tempDir, "specrunner", "jobs");
  await fs.mkdir(jobsDir, { recursive: true });
  await fs.writeFile(path.join(jobsDir, `${jobId}.json`), JSON.stringify(state, null, 2));
}

function makeJobState(jobId: string): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
    status: "running",
    branch: "change/test-slug-abc123",
    history: [],
    error: null,
    steps: {},
  };
}

/**
 * Make a RuntimeStrategy fake with injectable verifyFindingRefs behavior.
 */
function makeRuntimeStrategy(
  verifyFindingRefsFn: (refs: FindingRef[], cwd: string, branch: string | null) => Promise<FindingRef[]>,
): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner(): AgentRunner {
      return {
        async run(): Promise<AgentRunResult> {
          return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
        },
      };
    },
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {}; },
    registerCleanup() { return {} as ReturnType<RuntimeStrategy["registerCleanup"]>; },
    async teardown() {},
    async captureHeadSha(): Promise<string | null> { return null; },
    async prepareStepArtifacts(): Promise<void> {},
    async finalizeStepArtifacts(): Promise<void> {},
    async validateStepInputs(): Promise<void> {},
    async commitFinalState(): Promise<void> {},
    async bootstrapJob(): Promise<JobState> { throw new Error("not implemented"); },
    async persistJobState(): Promise<void> {},
    verifyFindingRefs: verifyFindingRefsFn,
    async digestArtifacts(refs: { path: string }[]) { return refs.map((r) => ({ path: r.path, hash: null })); },
    async listChangedFiles(): Promise<string[]> { return []; },
    async validateStepOutputs(): Promise<import("../../../src/core/port/output-contract.js").OutputCheckResult> {
      return { violations: [] };
    },
  };
}

function makeJudgeStep(reportTool = JUDGE_REPORT_TOOL): AgentStep {
  return {
    kind: "agent",
    name: "spec-review",
    agent: {
      name: "specrunner-spec-review",
      role: "spec-review",
      model: "claude-sonnet-4-6",
      system: "review",
      tools: [],
    },
    toolHandlers: undefined,
    reportTool,
    buildMessage: () => "review this",
    resultFilePath: () => "specrunner/changes/slug/spec-review-result-001.md",
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

/**
 * Create an AgentRunner that returns a specific toolResult.
 */
function makeRunnerWithToolResult(toolResult: unknown): AgentRunner {
  return {
    async run(_ctx: AgentRunContext): Promise<AgentRunResult> {
      return {
        completionReason: "success",
        resultContent: null,
        toolResult: toolResult as AgentRunResult["toolResult"],
        followUpAttempts: 0,
      };
    },
  };
}

function makeDeps(
  overrides: Partial<PipelineDeps> = {},
  runtimeStrategy?: RuntimeStrategy,
): PipelineDeps {
  return {
    config: { version: 1, agents: {} },
    request: {
      type: "feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug: "test-slug",
    cwd: tempDir,
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
    listIssueComments: vi.fn().mockResolvedValue([]),
    removeLabel: vi.fn().mockResolvedValue(undefined),
    },
    owner: "testowner",
    repo: "testrepo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
    runtimeStrategy,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-VD-001: no-tool-call (null toolResult) → escalation for judge steps
// ---------------------------------------------------------------------------

describe("TC-VD-001: no-tool-call judge step → escalation", () => {
  it("judge step with null toolResult → verdict is escalation", async () => {
    const jobId = "tc-vd-001";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const runner: AgentRunner = {
      async run(): Promise<AgentRunResult> {
        return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
      },
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const step = makeJudgeStep();
    const resultState = await executor.execute(step, state, makeDeps());

    const runs = resultState.steps?.["spec-review"];
    expect(runs).toBeDefined();
    const lastRun = runs?.[runs.length - 1];
    expect(lastRun?.outcome.verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-VD-002: ok=false report → escalation for judge steps
// ---------------------------------------------------------------------------

describe("TC-VD-002: ok=false report → escalation for judge steps", () => {
  it("judge step with ok=false toolResult → verdict is escalation", async () => {
    const jobId = "tc-vd-002";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const runner = makeRunnerWithToolResult({ ok: false, reason: "cannot review" });
    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const step = makeJudgeStep();
    const resultState = await executor.execute(step, state, makeDeps());

    const runs = resultState.steps?.["spec-review"];
    const lastRun = runs?.[runs.length - 1];
    expect(lastRun?.outcome.verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-VD-003: non-existent finding ref → verdict escalated to escalation
// ---------------------------------------------------------------------------

describe("TC-VD-003: non-existent finding refs → verdict escalated to escalation", () => {
  it("blocking finding with non-existent file ref → escalation overrides needs-fix", async () => {
    const jobId = "tc-vd-003";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const nonExistentRef: FindingRef = { file: "src/does-not-exist.ts" };
    const runtimeStrategy = makeRuntimeStrategy(
      async (_refs, _cwd, _branch) => [nonExistentRef],
    );

    const runner = makeRunnerWithToolResult({
      ok: true,
      findings: [
        {
          severity: "high",
          resolution: "fixable",
          file: "src/does-not-exist.ts",
          title: "Missing file",
          rationale: "File does not exist",
        },
      ],
    });

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const step = makeJudgeStep();
    const resultState = await executor.execute(step, state, makeDeps({}, runtimeStrategy));

    const runs = resultState.steps?.["spec-review"];
    const lastRun = runs?.[runs.length - 1];
    // Would be needs-fix based on findings, but non-existent ref escalates
    expect(lastRun?.outcome.verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-VD-004: existing findings → verdict not overridden
// ---------------------------------------------------------------------------

describe("TC-VD-004: all finding refs exist → verdict is derived correctly", () => {
  it("high finding with existing ref → needs-fix (not escalated)", async () => {
    const jobId = "tc-vd-004";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    // All refs exist → verifyFindingRefs returns empty array
    const runtimeStrategy = makeRuntimeStrategy(
      async (_refs, _cwd, _branch) => [],
    );

    const runner = makeRunnerWithToolResult({
      ok: true,
      findings: [
        {
          severity: "high",
          resolution: "fixable",
          file: "src/exists.ts",
          title: "High finding",
          rationale: "Real issue",
        },
      ],
    });

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const step = makeJudgeStep();
    const resultState = await executor.execute(step, state, makeDeps({}, runtimeStrategy));

    const runs = resultState.steps?.["spec-review"];
    const lastRun = runs?.[runs.length - 1];
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });

  it("no findings → approved", async () => {
    const jobId = "tc-vd-004b";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const runtimeStrategy = makeRuntimeStrategy(async () => []);

    const runner = makeRunnerWithToolResult({
      ok: true,
      findings: [],
    });

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const step = makeJudgeStep();
    const resultState = await executor.execute(step, state, makeDeps({}, runtimeStrategy));

    const runs = resultState.steps?.["spec-review"];
    const lastRun = runs?.[runs.length - 1];
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  it("code-review with decision-needed finding → escalation", async () => {
    const jobId = "tc-vd-004c";
    const state = { ...makeJobState(jobId), step: "code-review" };
    await seedJobState(jobId, state);

    const runtimeStrategy = makeRuntimeStrategy(async () => []);

    const runner = makeRunnerWithToolResult({
      ok: true,
      findings: [
        {
          severity: "medium",
          resolution: "decision-needed",
          file: "src/foo.ts",
          title: "Architectural decision needed",
          rationale: "Requires design decision",
        },
      ],
    });

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const step: AgentStep = {
      ...makeJudgeStep(CODE_REVIEW_REPORT_TOOL),
      name: "code-review",
    };
    const resultState = await executor.execute(step, state, makeDeps({}, runtimeStrategy));

    const runs = resultState.steps?.["code-review"];
    const lastRun = runs?.[runs.length - 1];
    expect(lastRun?.outcome.verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-VD-005: T-14 — decision-needed finding → executor escalates → pipeline awaiting-resume
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TC-VD-006 through TC-VD-008: T-08 — decision ledger filtering in executor
// ---------------------------------------------------------------------------

describe("TC-VD-006: decided decision-needed finding → approved (not escalated)", () => {
  it("finding already in ledger is filtered out — verdict is approved", async () => {
    const jobId = "tc-vd-006";

    const finding: Finding = {
      severity: "medium",
      resolution: "decision-needed",
      file: "src/design.ts",
      title: "Architecture decision required",
      rationale: "Two valid approaches — pick one",
      options: [
        { label: "Option A", consequence: "Consequence A" },
        { label: "Option B", consequence: "Consequence B" },
      ],
    };

    const findingKey = computeFindingKey("spec-review", finding);

    const state: JobState = {
      ...makeJobState(jobId),
      decisions: [
        {
          id: "decision-2026-01-01T00:00:00.000Z-1",
          step: "spec-review",
          findingKey,
          finding: {
            title: finding.title,
            file: finding.file,
            rationale: finding.rationale,
            severity: finding.severity,
          },
          selectedOption: { number: 1, label: "Option A", consequence: "Consequence A" },
          decidedAt: "2026-01-01T00:00:00.000Z",
          source: "issue-comment",
        },
      ],
    };
    await seedJobState(jobId, state);

    const runtimeStrategy = makeRuntimeStrategy(async () => []);
    const runner = makeRunnerWithToolResult({
      ok: true,
      findings: [finding],
    });

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const step = makeJudgeStep();
    const resultState = await executor.execute(step, state, makeDeps({}, runtimeStrategy));

    const runs = resultState.steps?.["spec-review"];
    const lastRun = runs?.[runs.length - 1];
    // Finding was already decided → filtered out → no blocking findings → approved
    expect(lastRun?.outcome.verdict).toBe("approved");
    // Original toolResult still stored (auditability)
    expect(lastRun?.outcome.toolResult?.findings).toHaveLength(1);
  });
});

describe("TC-VD-007: undecided decision-needed finding → still escalates", () => {
  it("finding not in ledger → still triggers escalation", async () => {
    const jobId = "tc-vd-007";

    const decidedFinding: Finding = {
      severity: "low",
      resolution: "decision-needed",
      file: "src/other.ts",
      title: "Other decision",
      rationale: "Different rationale",
    };
    const undecidedFinding: Finding = {
      severity: "medium",
      resolution: "decision-needed",
      file: "src/design.ts",
      title: "Architecture decision required",
      rationale: "Two valid approaches — pick one",
    };

    // Ledger has decidedFinding but NOT undecidedFinding
    const state: JobState = {
      ...makeJobState(jobId),
      decisions: [
        {
          id: "decision-2026-01-01T00:00:00.000Z-1",
          step: "spec-review",
          findingKey: computeFindingKey("spec-review", decidedFinding),
          finding: {
            title: decidedFinding.title,
            file: decidedFinding.file,
            rationale: decidedFinding.rationale,
            severity: decidedFinding.severity,
          },
          selectedOption: { number: 1, label: "Option A", consequence: "Consequence A" },
          decidedAt: "2026-01-01T00:00:00.000Z",
          source: "issue-comment",
        },
      ],
    };
    await seedJobState(jobId, state);

    const runtimeStrategy = makeRuntimeStrategy(async () => []);
    const runner = makeRunnerWithToolResult({
      ok: true,
      findings: [undecidedFinding], // undecided finding is still returned
    });

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const step = makeJudgeStep();
    const resultState = await executor.execute(step, state, makeDeps({}, runtimeStrategy));

    const runs = resultState.steps?.["spec-review"];
    const lastRun = runs?.[runs.length - 1];
    // undecidedFinding not in ledger → still escalates
    expect(lastRun?.outcome.verdict).toBe("escalation");
  });
});

describe("TC-VD-008: fixable finding still routes to needs-fix even when ledger has entries", () => {
  it("fixable high finding + decided decision-needed → needs-fix (fixable not filtered)", async () => {
    const jobId = "tc-vd-008";

    const decidedFinding: Finding = {
      severity: "low",
      resolution: "decision-needed",
      file: "src/design.ts",
      title: "Architecture decision required",
      rationale: "Pick one",
      options: [
        { label: "Option A", consequence: "Consequence A" },
        { label: "Option B", consequence: "Consequence B" },
      ],
    };
    const fixableFinding: Finding = {
      severity: "high",
      resolution: "fixable",
      file: "src/critical.ts",
      title: "Critical bug",
      rationale: "Must be fixed",
    };

    const state: JobState = {
      ...makeJobState(jobId),
      decisions: [
        {
          id: "decision-2026-01-01T00:00:00.000Z-1",
          step: "spec-review",
          findingKey: computeFindingKey("spec-review", decidedFinding),
          finding: {
            title: decidedFinding.title,
            file: decidedFinding.file,
            rationale: decidedFinding.rationale,
            severity: decidedFinding.severity,
          },
          selectedOption: { number: 1, label: "Option A", consequence: "Consequence A" },
          decidedAt: "2026-01-01T00:00:00.000Z",
          source: "issue-comment",
        },
      ],
    };
    await seedJobState(jobId, state);

    const runtimeStrategy = makeRuntimeStrategy(async () => []);
    const runner = makeRunnerWithToolResult({
      ok: true,
      findings: [decidedFinding, fixableFinding],
    });

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const step = makeJudgeStep();
    const resultState = await executor.execute(step, state, makeDeps({}, runtimeStrategy));

    const runs = resultState.steps?.["spec-review"];
    const lastRun = runs?.[runs.length - 1];
    // decidedFinding filtered out; fixableFinding remains → needs-fix
    expect(lastRun?.outcome.verdict).toBe("needs-fix");
  });
});

describe("TC-VD-005: decision-needed finding → verdict escalated to escalation", () => {
  it("spec-review with decision-needed finding → escalation (pipeline awaiting-resume)", async () => {
    const jobId = "tc-vd-005";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    // All refs exist (verifyFindingRefs returns []) — verdict escalation comes from decision-needed
    const runtimeStrategy = makeRuntimeStrategy(async () => []);

    const runner = makeRunnerWithToolResult({
      ok: true,
      findings: [
        {
          severity: "medium",
          resolution: "decision-needed",
          file: "src/design.ts",
          title: "Architecture decision required",
          rationale: "Two valid approaches — pick one",
        },
      ],
    });

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));
    const step = makeJudgeStep();
    const resultState = await executor.execute(step, state, makeDeps({}, runtimeStrategy));

    const runs = resultState.steps?.["spec-review"];
    const lastRun = runs?.[runs.length - 1];
    // decision-needed → deriveJudgeVerdict → "escalation" → pipeline enters awaiting-resume
    expect(lastRun?.outcome.verdict).toBe("escalation");
  });
});
