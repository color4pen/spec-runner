/**
 * Tests for no-op detection in StepExecutor.
 *
 * TC-NOP-001: step.noOpDetect + no source changes → verdict "needs-fix"
 * TC-NOP-002: step.noOpDetect + source changes present → verdict unchanged ("success")
 * TC-NOP-003: step.noOpDetect not set → no-op detection skipped
 * TC-NOP-004: headBeforeStep null (no strategy captureHeadSha) → no-op detection skipped
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { AgentStep } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/core/step/../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";
import { PRODUCER_REPORT_TOOL } from "../../../src/core/step/report-tool.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-noop-test-"));
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

async function seedJobState(jobId: string, state: JobState): Promise<void> {
  const dir = path.join(tempDir, ".specrunner", "test-jobs", jobId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "state.json"), JSON.stringify(state, null, 2));
}

function makeJobState(jobId: string): JobState {
  return {
    version: 2,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "test-slug", baseBranch: "main" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "code-fixer",
    status: "running",
    branch: "change/test-slug-abc123",
    history: [],
    error: null,
    steps: {},
  };
}

function makeConfig(): SpecRunnerConfig {
  return { version: 1, runtime: "local", agents: {} };
}

/**
 * Make a RuntimeStrategy that returns:
 * - headSha from captureHeadSha
 * - changedSourceFiles from listChangedFiles (simulates git diff between head and HEAD)
 */
function makeStrategy(opts: {
  headSha: string | null;
  changedSourceFiles: string[];
}): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner() { return { async run(): Promise<AgentRunResult> { return { completionReason: "success", resultContent: null, toolResult: { ok: true }, followUpAttempts: 0 }; } }; },
    async setupWorkspace() { return { cwd: "" }; },
    buildDeps() { return {} as PipelineDeps; },
    registerCleanup() { return {} as ReturnType<RuntimeStrategy["registerCleanup"]>; },
    async teardown() {},
    async captureHeadSha(): Promise<string | null> { return opts.headSha; },
    async prepareStepArtifacts(): Promise<void> {},
    async finalizeStepArtifacts(): Promise<void> {},
    async validateStepInputs(): Promise<void> {},
    async commitFinalState(): Promise<void> {},
    async bootstrapJob(): Promise<JobState> { throw new Error("not implemented"); },
    async persistJobState(): Promise<void> {},
    async verifyFindingRefs() { return []; },
    async digestArtifacts(refs: { path: string }[]) { return refs.map((r) => ({ path: r.path, hash: null })); },
    async validateStepOutputs() { return { violations: [] }; },
    async listChangedFiles(_base, _cwd, _branch) { return { kind: "success" as const, files: opts.changedSourceFiles }; },
  };
}

function makeDeps(runtimeStrategy?: RuntimeStrategy): PipelineDeps {
  return {
    config: makeConfig(),
    request: {
      type: "bug-fix",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr: false,
    },
    slug: "test-slug",
    cwd: tempDir,
    githubClient: {
      verifyBranch: vi.fn(),
      getRawFile: vi.fn(),
      verifyPath: vi.fn(),
      verifyTokenScopes: vi.fn(),
      getRefSha: vi.fn(),
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
  };
}

/** A code-fixer step with noOpDetect: true and PRODUCER_REPORT_TOOL. */
function makeCodeFixerStep(): AgentStep {
  return {
    kind: "agent",
    name: "code-fixer",
    agent: { name: "specrunner-code-fixer", role: "code-fixer", model: "claude-sonnet-4-5", system: "fix", tools: [] },
    buildMessage: () => "fix",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    reportTool: PRODUCER_REPORT_TOOL,
    completionVerdict: "success",
    noOpDetect: true,
  };
}

/** An implementer step with noOpDetect NOT set. */
function makeImplementerStep(): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: { name: "specrunner-implementer", role: "implementer", model: "claude-sonnet-4-5", system: "impl", tools: [] },
    buildMessage: () => "implement",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    reportTool: PRODUCER_REPORT_TOOL,
    completionVerdict: "success",
    // noOpDetect NOT set
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-NOP-001: noOpDetect + no source changes → verdict "needs-fix"
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-NOP-001: no-op detected → verdict overridden to needs-fix", () => {
  it("overrides verdict to needs-fix when code-fixer produces no source changes", async () => {
    const jobId = "tc-nop-001";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    // captureHeadSha returns a sha (enabling no-op detection), listChangedFiles returns []
    const strategy = makeStrategy({ headSha: "abc123def", changedSourceFiles: [] });

    const events = new EventBus();
    const verdicts: string[] = [];
    events.on("verdict:parsed", (payload) => {
      verdicts.push((payload as { outcome: { verdict: string } }).outcome.verdict);
    });

    const executor = new StepExecutor(events, { async run(): Promise<AgentRunResult> {
      return { completionReason: "success", resultContent: null, toolResult: { ok: true }, followUpAttempts: 0 };
    } }, makeStoreFactory(tempDir));

    const result = await executor.execute(makeCodeFixerStep(), state, makeDeps(strategy));
    expect(result.steps?.["code-fixer"]?.at(-1)?.outcome.verdict).toBe("needs-fix");
    expect(verdicts).toContain("needs-fix");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-NOP-002: noOpDetect + source changes → verdict unchanged
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-NOP-002: source changes present → verdict not overridden", () => {
  it("does not override verdict when source files changed", async () => {
    const jobId = "tc-nop-002";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const strategy = makeStrategy({ headSha: "abc123def", changedSourceFiles: ["src/core/step/executor.ts"] });

    const executor = new StepExecutor(new EventBus(), { async run(): Promise<AgentRunResult> {
      return { completionReason: "success", resultContent: null, toolResult: { ok: true }, followUpAttempts: 0 };
    } }, makeStoreFactory(tempDir));

    const result = await executor.execute(makeCodeFixerStep(), state, makeDeps(strategy));
    expect(result.steps?.["code-fixer"]?.at(-1)?.outcome.verdict).toBe("success");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-NOP-003: noOpDetect not set → no-op detection skipped
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-NOP-003: noOpDetect not set → detection skipped", () => {
  it("does not override verdict for steps without noOpDetect", async () => {
    const jobId = "tc-nop-003";
    const state = { ...makeJobState(jobId), step: "implementer" };
    await seedJobState(jobId, state);

    const strategy = makeStrategy({ headSha: "abc123def", changedSourceFiles: [] });

    const executor = new StepExecutor(new EventBus(), { async run(): Promise<AgentRunResult> {
      return { completionReason: "success", resultContent: null, toolResult: { ok: true }, followUpAttempts: 0 };
    } }, makeStoreFactory(tempDir));

    const result = await executor.execute(makeImplementerStep(), state, makeDeps(strategy));
    // implementer without noOpDetect → should be "success", not "needs-fix"
    expect(result.steps?.["implementer"]?.at(-1)?.outcome.verdict).toBe("success");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-NOP-004: no strategy → no-op detection skipped
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-NOP-004: no runtimeStrategy → no-op detection skipped", () => {
  it("does not trigger no-op detection when runtimeStrategy absent", async () => {
    const jobId = "tc-nop-004";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const executor = new StepExecutor(new EventBus(), { async run(): Promise<AgentRunResult> {
      return { completionReason: "success", resultContent: null, toolResult: { ok: true }, followUpAttempts: 0 };
    } }, makeStoreFactory(tempDir));

    const result = await executor.execute(makeCodeFixerStep(), state, makeDeps(undefined));
    // Without runtimeStrategy, no-op detection is skipped → verdict is "success"
    expect(result.steps?.["code-fixer"]?.at(-1)?.outcome.verdict).toBe("success");
  });
});
