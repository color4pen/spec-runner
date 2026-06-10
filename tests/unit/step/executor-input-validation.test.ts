/**
 * Unit tests for StepExecutor pre-execution input validation (step-io-contracts).
 *
 * TC-021: AgentStep — validateStepInputs failure halts before runner.run()
 *   GIVEN  an AgentStep whose required reads are absent
 *   WHEN   StepExecutor.execute() is called with a RuntimeStrategy that rejects validateStepInputs
 *   THEN   runner.run() is NOT called, recordFailedStepResult + store.fail happen,
 *          and step:error is emitted
 *
 * TC-022: CliStep — validateStepInputs failure halts before step.run()
 *   GIVEN  a CliStep whose required reads are absent
 *   WHEN   StepExecutor.execute() is called with a RuntimeStrategy that rejects validateStepInputs
 *   THEN   step.run() is NOT called and STEP_INPUT_MISSING is thrown
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { EventBus } from "../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../src/core/step/executor.js";
import type { AgentStep, CliStep } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../../src/core/port/agent-runner.js";
import type { RuntimeStrategy } from "../../../src/core/port/runtime-strategy.js";
import { SpecRunnerError, ERROR_CODES } from "../../../src/errors.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";
import type { SpawnFn as PipelineSpawnFn } from "../../../src/util/spawn.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-input-validation-test-"));
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
    step: "code-review",
    status: "running",
    branch: "change/test-slug-abc123",
    history: [],
    error: null,
    steps: {},
  };
}

/**
 * Build a RuntimeStrategy mock where validateStepInputs always rejects with
 * the given error. All other methods are no-ops or return safe defaults.
 */
function makeFailingValidationStrategy(errorToThrow: Error): RuntimeStrategy {
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
    async validateStepInputs(): Promise<void> {
      throw errorToThrow;
    },
    async commitFinalState(): Promise<void> {},
    async bootstrapJob(): Promise<import("../../../src/state/schema.js").JobState> { throw new Error("not implemented in test"); },
    async persistJobState(): Promise<void> {},
    async verifyFindingRefs(): Promise<import("../../../src/core/port/runtime-strategy.js").FindingRef[]> { return []; },
    async digestArtifacts(refs: { path: string }[]): Promise<import("../../../src/store/event-journal.js").ArtifactRef[]> {
      return refs.map((r) => ({ path: r.path, hash: null }));
    },
  };
}

function makeStepInputMissingError(missingPath: string): SpecRunnerError {
  return new SpecRunnerError(
    ERROR_CODES.STEP_INPUT_MISSING,
    `Required step input(s) not found: ${missingPath}`,
    `Required step input(s) not found. Missing:\n  - ${missingPath}`,
  );
}

function makeBaseDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  const noopSpawn: PipelineSpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });
  return {
    config: {
      version: 1,
      runtime: "local",
      agents: {},
    },
    request: {
      type: "feature",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "# Test request",
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
    },
    owner: "testowner",
    repo: "testrepo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-021: AgentStep — pre-execution validation failure halts before runner.run()
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-021: AgentStep — validateStepInputs failure halts before runner.run()", () => {
  it("does not call runner.run() when validateStepInputs rejects", async () => {
    const jobId = "tc-021-agent-halt-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const missingPath = "specrunner/changes/test-slug/review-feedback-001.md";
    const validationError = makeStepInputMissingError(missingPath);
    const runtimeStrategy = makeFailingValidationStrategy(validationError);

    const runSpy = vi.fn<(ctx: AgentRunContext) => Promise<AgentRunResult>>().mockResolvedValue({
      completionReason: "success",
      resultContent: null,
      toolResult: null,
      followUpAttempts: 0,
    });
    const runner: AgentRunner = { run: runSpy };

    const events = new EventBus();
    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const step: AgentStep = {
      kind: "agent",
      name: "code-fixer",
      agent: {
        name: "specrunner-code-fixer",
        role: "code-fixer",
        model: "claude-sonnet-4-6",
        system: "fix code",
        tools: [],
      },
      toolHandlers: undefined,
      reads: () => [{ path: missingPath }],
      writes: () => [],
      buildMessage: () => "fix this",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };

    const deps = makeBaseDeps({ runtimeStrategy });

    await expect(executor.execute(step, state, deps)).rejects.toMatchObject({
      code: ERROR_CODES.STEP_INPUT_MISSING,
    });

    expect(runSpy).not.toHaveBeenCalled();
  });

  it("records failed StepRun in state and emits step:error when validateStepInputs rejects", async () => {
    const jobId = "tc-021-agent-state-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const missingPath = "specrunner/changes/test-slug/review-feedback-001.md";
    const validationError = makeStepInputMissingError(missingPath);
    const runtimeStrategy = makeFailingValidationStrategy(validationError);

    const runner: AgentRunner = {
      run: vi.fn<(ctx: AgentRunContext) => Promise<AgentRunResult>>().mockResolvedValue({
        completionReason: "success",
        resultContent: null,
        toolResult: null,
        followUpAttempts: 0,
      }),
    };

    const events = new EventBus();
    const stepErrorEvents: Array<{ step: string; error: Error }> = [];
    events.on("step:error" as never, (payload: { step: string; error: Error }) => {
      stepErrorEvents.push(payload);
    });

    const executor = new StepExecutor(events, runner, makeStoreFactory(tempDir));

    const step: AgentStep = {
      kind: "agent",
      name: "code-fixer",
      agent: {
        name: "specrunner-code-fixer",
        role: "code-fixer",
        model: "claude-sonnet-4-6",
        system: "fix code",
        tools: [],
      },
      toolHandlers: undefined,
      reads: () => [{ path: missingPath }],
      writes: () => [],
      buildMessage: () => "fix this",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: null, findingsPath: null }),
    };

    const deps = makeBaseDeps({ runtimeStrategy });

    let thrownErr: unknown;
    try {
      await executor.execute(step, state, deps);
    } catch (err) {
      thrownErr = err;
    }

    // step:error must have been emitted
    expect(stepErrorEvents.length).toBe(1);
    expect(stepErrorEvents[0]!.step).toBe("code-fixer");
    expect((stepErrorEvents[0]!.error as Error & { code?: string }).code).toBe(ERROR_CODES.STEP_INPUT_MISSING);

    // The thrown error carries attached state with the failed StepRun
    const attachedState = (thrownErr as Error & { state?: JobState }).state;
    expect(attachedState).toBeDefined();
    const stepRuns = attachedState!.steps?.["code-fixer"];
    expect(stepRuns).toBeDefined();
    expect(stepRuns!.length).toBeGreaterThan(0);
    const lastRun = stepRuns![stepRuns!.length - 1]!;
    expect(lastRun.outcome.error?.code).toBe(ERROR_CODES.STEP_INPUT_MISSING);
    expect(lastRun.outcome.verdict).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-022: CliStep — pre-execution validation failure halts before step.run()
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-022: CliStep — validateStepInputs failure halts before step.run()", () => {
  it("does not call step.run() when validateStepInputs rejects", async () => {
    const jobId = "tc-022-cli-halt-job";
    const state = makeJobState(jobId);
    await seedJobState(jobId, state);

    const missingPath = "specrunner/changes/test-slug/verification-result.md";
    const validationError = makeStepInputMissingError(missingPath);
    const runtimeStrategy = makeFailingValidationStrategy(validationError);

    const noopRunner: AgentRunner = {
      async run(): Promise<AgentRunResult> {
        return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
      },
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, noopRunner, makeStoreFactory(tempDir));

    const runSpy = vi.fn<(state: JobState, deps: unknown) => Promise<void>>().mockResolvedValue(undefined);

    const step: CliStep = {
      kind: "cli",
      name: "build-fixer",
      reads: () => [{ path: missingPath }],
      writes: () => [],
      run: runSpy,
      resultFilePath: () => "specrunner/changes/test-slug/build-fixer-result.md",
      parseResult: () => ({ verdict: "success" as const, findingsPath: null }),
    };

    const deps = makeBaseDeps({ runtimeStrategy });

    await expect(executor.execute(step, state, deps)).rejects.toMatchObject({
      code: ERROR_CODES.STEP_INPUT_MISSING,
    });

    expect(runSpy).not.toHaveBeenCalled();
  });
});
