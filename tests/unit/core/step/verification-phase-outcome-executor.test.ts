/**
 * Unit tests for verification phase outcome threading through the executor (T-04 / T-06).
 *
 * TC-013: 既存 void 返し CliStep が戻り型 widen 後も型エラーにならない (must)
 *         CliStep.run returns void → StepRun.outcome has no verificationPhases (invariant)
 * TC-016: executor が run() の verificationPhases を success StepExecutionResult に thread し
 *         verdict 導出は不変 (must)
 *         CliStep.run returns { verificationPhases:[...] } → stored in StepRun.outcome
 * TC-017: void を返す CliStep の success 結果に verificationPhases が含まれない (should)
 *
 * ⚠ RED TESTS: TC-016 is RED.
 *   StepExecutor.runCliStep currently ignores the return value of step.run().
 *   TC-016 will FAIL because StepRun.outcome.verificationPhases is undefined instead of
 *   the expected array — until T-05 + T-06 are implemented.
 *
 * TC-013 and TC-017 are GREEN (void-returning steps work both before and after T-04 widening).
 *
 * Source: specrunner/changes/verification-phase-outcome-record/test-cases.md
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import type { CliStep } from "../../../../src/core/step/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { AgentRunner, AgentRunResult } from "../../../../src/core/port/agent-runner.js";
import type { RuntimeStrategy, FindingRef } from "../../../../src/core/port/runtime-strategy.js";
import { makeStoreFactory } from "../../../helpers/store-factory.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

/** Minimal AgentRunner — never invoked for CLI steps but required by StepExecutor constructor. */
const noopRunner: AgentRunner = {
  async run(): Promise<AgentRunResult> {
    return { completionReason: "success", resultContent: null, toolResult: null, followUpAttempts: 0 };
  },
};

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "verification-phase-outcome-exec-test-"));
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

function makeJobState(jobId: string): JobState {
  return {
    version: 1,
    jobId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "verification",
    status: "running",
    branch: "feat/test-branch",
    history: [],
    error: null,
    steps: {},
  };
}

function makeRuntimeStrategy(overrides: Partial<RuntimeStrategy> = {}): RuntimeStrategy {
  return {
    async *query() {},
    createAgentRunner(): AgentRunner { return noopRunner; },
    async setupWorkspace() { return { cwd: tempDir }; },
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
    verifyFindingRefs: async (_refs: FindingRef[], _cwd: string, _branch: string | null) => [],
    async digestArtifacts(refs: { path: string }[], _cwd: string, _branch: string | null) {
      return refs.map((r) => ({ path: r.path, hash: null }));
    },
    async listChangedFiles() { return { kind: "success" as const, files: [] }; },
    async validateStepOutputs() { return { violations: [] }; },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    config: { version: 1, agents: {} },
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
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
      listPullRequests: vi.fn().mockResolvedValue([]),
      createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
      getPullRequest: vi.fn().mockResolvedValue({
        state: "OPEN",
        mergeStateStatus: "CLEAN",
        headRefName: "",
        mergeable: "MERGEABLE",
      }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({
        state: "success",
        total: 0,
        failing: [],
        pending: [],
      }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({
        id: 1,
        url: "https://github.com/o/r/issues/1#issuecomment-1",
      }),
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue([]),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    },
    owner: "testowner",
    repo: "testrepo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
    runtimeStrategy: makeRuntimeStrategy(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-016: executor が run() の verificationPhases を success StepExecutionResult に thread し
//         verdict 導出は不変 (must)
//
// RED: StepExecutor.runCliStep currently ignores the return value of step.run().
//      After T-05 + T-06: verificationPhases from run() is captured and stored in
//      StepRun.outcome via StepExecutionResult → projectSuccess → pushStepResult.
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-016: executor threads verificationPhases from run() to StepRun.outcome (must)", () => {
  it("StepRun.outcome.verificationPhases contains the array returned by run()", async () => {
    const jobId = "tc-016-phases-thread";
    const state = makeJobState(jobId);

    const resultFile = path.join(tempDir, "verification-result-tc016.md");
    // Create a result file so the executor can read it and call parseResult
    await fs.writeFile(resultFile, "## Verdict: failed\n", "utf-8");

    const expectedPhases = [{ phase: "lint", status: "failed" as const, exitCode: 2 }];

    const verificationStep: CliStep = {
      kind: "cli",
      name: "verification",
      // @ts-expect-error — CliStep.run returns Promise<void> currently; widened to Promise<CliStepRunOutcome | void> by T-04
      run: async () => ({ verificationPhases: expectedPhases }),
      resultFilePath: () => resultFile,
      parseResult: () => ({ verdict: "failed" as const, findingsPath: null }),
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, noopRunner, makeStoreFactory(tempDir));
    const resultState = await executor.execute(
      verificationStep,
      state,
      makeDeps(),
    );

    const runs = resultState.steps?.["verification"];
    expect(runs).toBeDefined();
    const lastRun = runs?.[runs.length - 1];
    expect(lastRun).toBeDefined();

    // After T-05 + T-06: verificationPhases from run() is stored in outcome
    // Before T-05 + T-06: outcome.verificationPhases is undefined → FAIL (RED)
    expect(lastRun?.outcome).toHaveProperty("verificationPhases");
    expect((lastRun?.outcome as unknown as Record<string, unknown>)["verificationPhases"]).toEqual(expectedPhases);
  });

  it("verdict derivation is unchanged — failed verdict still routes to build-fixer path", async () => {
    const jobId = "tc-016-verdict-unchanged";
    const state = makeJobState(jobId);

    const resultFile = path.join(tempDir, "verification-result-tc016-verdict.md");
    await fs.writeFile(resultFile, "## Verdict: failed\n", "utf-8");

    const verificationStep: CliStep = {
      kind: "cli",
      name: "verification",
      // @ts-expect-error — CliStep.run returns Promise<void> currently; widened to Promise<CliStepRunOutcome | void> by T-04
      run: async () => ({ verificationPhases: [{ phase: "build", status: "failed" as const, exitCode: 1 }] }),
      resultFilePath: () => resultFile,
      // parseResult derives verdict independently of verificationPhases
      parseResult: (_content, _deps) => ({ verdict: "failed" as const, findingsPath: null }),
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, noopRunner, makeStoreFactory(tempDir));
    const resultState = await executor.execute(verificationStep, state, makeDeps());

    const runs = resultState.steps?.["verification"];
    const lastRun = runs?.[runs.length - 1];

    // Verdict is derived from parseResult — not from verificationPhases
    // Both before and after T-06, the verdict comes from parseResult (no routing change)
    expect(lastRun?.outcome.verdict).toBe("failed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-013: 既存 void 返し CliStep が戻り型 widen 後も型エラーにならない (must)
//
// GREEN: void-returning CliStep.run works correctly both before and after T-04 widening.
// Documents that existing void steps (bite-evidence, pr-create) are not broken.
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-013: void-returning CliStep is valid after CliStep.run type widening (must)", () => {
  it("void-returning run() produces a valid success StepRun without verificationPhases", async () => {
    const jobId = "tc-013-void-step";
    const state = makeJobState(jobId);

    const resultFile = path.join(tempDir, "verification-result-void.md");
    await fs.writeFile(resultFile, "## Verdict: passed\n", "utf-8");

    // Simulates bite-evidence or pr-create: run: async () => {} (void return)
    const voidStep: CliStep = {
      kind: "cli",
      name: "verification",
      run: async () => {}, // void — valid both before and after T-04 widening
      resultFilePath: () => resultFile,
      parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, noopRunner, makeStoreFactory(tempDir));
    const resultState = await executor.execute(voidStep, state, makeDeps());

    const runs = resultState.steps?.["verification"];
    expect(runs).toBeDefined();
    const lastRun = runs?.[runs.length - 1];
    expect(lastRun).toBeDefined();

    // void run → no verificationPhases in outcome (TC-017 invariant)
    expect((lastRun?.outcome as unknown as Record<string, unknown>)["verificationPhases"]).toBeUndefined();
    // Verdict is still derived correctly from parseResult
    expect(lastRun?.outcome.verdict).toBe("passed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-017: void を返す CliStep の success 結果に verificationPhases が含まれない (should)
//
// GREEN: void run() returns undefined, so verificationPhases is never set.
// Verifies the negative invariant: non-verification CliSteps don't accidentally
// get verificationPhases in their outcome.
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-017: void-returning CliStep produces success result without verificationPhases (should)", () => {
  it("StepRun.outcome does not have verificationPhases key when run() returns void", async () => {
    const jobId = "tc-017-void-no-phases";
    const state = makeJobState(jobId);

    const resultFile = path.join(tempDir, "verification-result-tc017.md");
    await fs.writeFile(resultFile, "## Verdict: passed\n", "utf-8");

    const voidStep: CliStep = {
      kind: "cli",
      name: "verification",
      run: async () => {
        // returns void (undefined) — no CliStepRunOutcome
        return;
      },
      resultFilePath: () => resultFile,
      parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, noopRunner, makeStoreFactory(tempDir));
    const resultState = await executor.execute(voidStep, state, makeDeps());

    const runs = resultState.steps?.["verification"];
    const lastRun = runs?.[runs.length - 1];

    // void return → verificationPhases must not be set in outcome (not null, not [])
    expect(Object.prototype.hasOwnProperty.call(lastRun?.outcome, "verificationPhases")).toBe(false);
  });
});
