/**
 * Unit tests for the StepExecutor output contract gate.
 *
 * TC-OG-001: halt violation → STEP_OUTPUT_MISSING thrown, finalizeStepArtifacts not called
 * TC-OG-002: follow-up violation after runner → STEP_OUTPUT_MISSING thrown
 * TC-OG-003: no violations → finalizeStepArtifacts is called (gate passes)
 * TC-OG-004: no runtimeStrategy → gate skipped, step succeeds
 * TC-OG-005: no contracts (empty writes, no outputContracts) → validateStepOutputs not called
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
import type { AgentRunner, AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { OutputCheckResult, OutputContract } from "../../../src/core/port/output-contract.js";
import { ERROR_CODES } from "../../../src/errors.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { noopRoundGitEffects, noopStepArtifact, noopStepIo, noopTerminalState } from "../../../src/core/step/noop-capabilities.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-output-gate-test-"));
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
    step: "implementer",
    status: "running",
    branch: "change/test-slug-abc123",
    history: [],
    error: null,
    steps: {},
  };
}

function makeSuccessRunner(): AgentRunner {
  return {
    async run(): Promise<AgentRunResult> {
      return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
    },
  };
}

/**
 * Build a RuntimeStrategy where:
 * - validateStepOutputs returns the injected result
 * - finalizeStepArtifacts is a spy (so we can assert it was/was not called)
 */
function makeRuntimeStrategy(
  validateFn: () => Promise<OutputCheckResult>,
) {
  const finalizeSpy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const strategy = {
    async captureHeadSha(): Promise<string | null> { return null; },
    async prepareStepArtifacts(): Promise<void> {},
    finalizeStepArtifacts: finalizeSpy,
    async snapshotMainCheckoutGuard(): Promise<null> { return null; },
    async validateStepInputs(): Promise<void> {},
    async verifyFindingRefs() { return [] as never; },
    async digestArtifacts(refs: { path: string }[]) {
      return refs.map((r) => ({ path: r.path, hash: null as null }));
    },
    validateStepOutputs: validateFn,
    async listChangedFiles() { return { kind: "success" as const, files: [] as never[] }; },
  };
  return { strategy, finalizeSpy };
}

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });
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
      getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
    createLinkedBranch: vi.fn().mockResolvedValue(undefined),
    listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
    },
    owner: "testowner",
    repo: "testrepo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
    stepArtifact: noopStepArtifact,
    stepIo: noopStepIo,
    terminalState: noopTerminalState,
    roundGitEffects: noopRoundGitEffects,
    ...overrides,
  };
}

/** Build a minimal AgentStep with an outputContracts factory. */
function makeStepWithContracts(contracts: OutputContract[]): AgentStep {
  return {
    kind: "agent",
    name: "implementer",
    agent: {
      name: "specrunner-implementer",
      role: "implementer",
      model: "claude-sonnet-4-5",
      system: "implement",
      tools: [],
    },
    toolHandlers: undefined,
    buildMessage: () => "implement this",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    outputContracts: () => contracts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-OG-001: halt violation → STEP_OUTPUT_MISSING, finalizeStepArtifacts not called
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-OG-001: halt violation → STEP_OUTPUT_MISSING, finalize not called", () => {
  it("throws STEP_OUTPUT_MISSING when halt violation is returned", async () => {
    const jobId = "tc-og-001";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { strategy, finalizeSpy } = makeRuntimeStrategy(async () => ({
      violations: [
        { kind: "produced", path: "specrunner/changes/test-slug/spec.md", policy: "halt", detail: [] },
      ],
    }));

    const step = makeStepWithContracts([
      { kind: "produced", path: "specrunner/changes/test-slug/spec.md", policy: "halt" },
    ]);

    const events = new EventBus();
    const executor = new StepExecutor(events, makeSuccessRunner(), makeStoreFactory(tempDir));

    await expect(executor.execute(step, state, makeDeps({ stepArtifact: strategy as never, stepIo: strategy as never }))).rejects.toMatchObject({
      code: ERROR_CODES.STEP_OUTPUT_MISSING,
    });

    expect(finalizeSpy).not.toHaveBeenCalled();
  });

  it("error message contains the violating path", async () => {
    const jobId = "tc-og-001b";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { strategy } = makeRuntimeStrategy(async () => ({
      violations: [
        { kind: "produced", path: "specrunner/changes/test-slug/design.md", policy: "halt", detail: [] },
      ],
    }));

    const step = makeStepWithContracts([
      { kind: "produced", path: "specrunner/changes/test-slug/design.md", policy: "halt" },
    ]);

    const events = new EventBus();
    const executor = new StepExecutor(events, makeSuccessRunner(), makeStoreFactory(tempDir));

    let thrown: unknown;
    try {
      await executor.execute(step, state, makeDeps({ stepArtifact: strategy as never, stepIo: strategy as never }));
    } catch (err) {
      thrown = err;
    }

    expect((thrown as Error).message).toContain("design.md");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-OG-002: follow-up violation after runner → STEP_OUTPUT_MISSING
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-OG-002: follow-up violation after runner completes → STEP_OUTPUT_MISSING", () => {
  it("residual follow-up violation triggers gate failure", async () => {
    const jobId = "tc-og-002";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { strategy } = makeRuntimeStrategy(async () => ({
      violations: [
        {
          kind: "tasks-complete",
          path: "specrunner/changes/test-slug/tasks.md",
          policy: "follow-up",
          detail: ["Write tests"],
        },
      ],
    }));

    const step = makeStepWithContracts([
      { kind: "tasks-complete", path: "specrunner/changes/test-slug/tasks.md", policy: "follow-up" },
    ]);

    const events = new EventBus();
    const executor = new StepExecutor(events, makeSuccessRunner(), makeStoreFactory(tempDir));

    await expect(executor.execute(step, state, makeDeps({ stepArtifact: strategy as never, stepIo: strategy as never }))).rejects.toMatchObject({
      code: ERROR_CODES.STEP_OUTPUT_MISSING,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-OG-003: no violations → finalizeStepArtifacts is called
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-OG-003: no violations → gate passes, finalizeStepArtifacts called", () => {
  it("finalizeStepArtifacts is called when all contracts satisfied", async () => {
    const jobId = "tc-og-003";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { strategy, finalizeSpy } = makeRuntimeStrategy(async () => ({ violations: [] }));

    const step = makeStepWithContracts([
      { kind: "produced", path: "specrunner/changes/test-slug/spec.md", policy: "halt" },
    ]);

    const events = new EventBus();
    const executor = new StepExecutor(events, makeSuccessRunner(), makeStoreFactory(tempDir));

    await executor.execute(step, state, makeDeps({ stepArtifact: strategy as never, stepIo: strategy as never }));

    expect(finalizeSpy).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-OG-004: no runtimeStrategy → gate skipped
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-OG-004: no runtimeStrategy → gate skipped, step succeeds", () => {
  it("step succeeds without runtimeStrategy even if outputContracts declared", async () => {
    const jobId = "tc-og-004";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const step = makeStepWithContracts([
      { kind: "produced", path: "specrunner/changes/test-slug/spec.md", policy: "halt" },
    ]);

    const events = new EventBus();
    const executor = new StepExecutor(events, makeSuccessRunner(), makeStoreFactory(tempDir));

    // No runtimeStrategy — gate is skipped
    const resultState = await executor.execute(step, state, makeDeps());
    const runs = resultState.steps?.["implementer"];
    expect(runs).toBeDefined();
    const lastRun = runs?.[runs.length - 1];
    expect(lastRun?.outcome.error).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-OG-005: no contracts → validateStepOutputs not called
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-OG-005: no contracts → validateStepOutputs not called", () => {
  it("validateStepOutputs is not called when step has no writes and no outputContracts", async () => {
    const jobId = "tc-og-005";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const validateSpy = vi.fn<() => Promise<OutputCheckResult>>().mockResolvedValue({ violations: [] });
    const { strategy } = makeRuntimeStrategy(validateSpy);
    // Override the validateStepOutputs spy on the strategy
    strategy.validateStepOutputs = validateSpy;

    const step: AgentStep = {
      kind: "agent",
      name: "implementer",
      agent: {
        name: "specrunner-implementer",
        role: "implementer",
        model: "claude-sonnet-4-5",
        system: "implement",
        tools: [],
      },
      toolHandlers: undefined,
      buildMessage: () => "implement this",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
      // No writes, no outputContracts → zero contracts
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, makeSuccessRunner(), makeStoreFactory(tempDir));

    await executor.execute(step, state, makeDeps({ stepArtifact: strategy as never, stepIo: strategy as never }));

    expect(validateSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-OG-006: gate state — failed StepRun recorded when halt violation thrown
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-OG-006: failed StepRun recorded in attached state on gate failure", () => {
  it("attached state on thrown error has StepRun with STEP_OUTPUT_MISSING code", async () => {
    const jobId = "tc-og-006";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const { strategy } = makeRuntimeStrategy(async () => ({
      violations: [
        { kind: "produced", path: "specrunner/changes/test-slug/spec.md", policy: "halt", detail: [] },
      ],
    }));

    const step = makeStepWithContracts([
      { kind: "produced", path: "specrunner/changes/test-slug/spec.md", policy: "halt" },
    ]);

    const events = new EventBus();
    const executor = new StepExecutor(events, makeSuccessRunner(), makeStoreFactory(tempDir));

    let thrown: unknown;
    try {
      await executor.execute(step, state, makeDeps({ stepArtifact: strategy as never, stepIo: strategy as never }));
    } catch (err) {
      thrown = err;
    }

    const attachedState = (thrown as Error & { state?: JobState }).state;
    expect(attachedState).toBeDefined();
    const runs = attachedState!.steps?.["implementer"];
    expect(runs).toBeDefined();
    const lastRun = runs![runs!.length - 1]!;
    expect(lastRun.outcome.error?.code).toBe(ERROR_CODES.STEP_OUTPUT_MISSING);
    expect(lastRun.outcome.verdict).toBeNull();
  });
});
