/**
 * Unit tests for CLI step entry-HEAD commitOid capture (T-01).
 *
 * TC-005: verification の commitOid は評価した revision（entry HEAD）（must）
 * TC-006: runtimeStrategy 不在時は commitOid 未設定（should）
 *
 * ⚠ RED TESTS: TC-005 is written in RED state.
 * T-01 is not implemented yet: runCliStep does not call captureHeadSha before step.run().
 * TC-005 will FAIL because StepRun.commitOid is undefined instead of "entry-sha".
 *
 * TC-006 is GREEN: without runtimeStrategy, commitOid remains undefined both before
 * and after T-01 (no capture when runtimeStrategy absent).
 *
 * Source: specrunner/changes/approval-revision-binding/test-cases.md
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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "executor-cli-oid-test-"));
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
    branch: "fix/test-branch",
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
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-005: verification の commitOid は評価した revision（entry HEAD）（must）
//
// T-01 adds captureHeadSha() BEFORE step.run(). The CLI step's run() simulates
// propagateVerificationResult committing HEAD (advancing from "entry-sha" to "exit-sha").
// After T-01: StepRun.commitOid === "entry-sha" (captured before run).
// Before T-01 (current): StepRun.commitOid === undefined → FAIL → RED.
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-005: verification CLI step records entry HEAD commitOid (must)", () => {
  it("StepRun.commitOid is entry HEAD (captured before step.run), not exit HEAD and not undefined", async () => {
    const jobId = "tc-005-entry-oid";
    const state = makeJobState(jobId);

    // Stateful captureHeadSha: entry-sha before step.run(), exit-sha after.
    // T-01 must call captureHeadSha BEFORE step.run() → must capture "entry-sha".
    let headSha = "entry-sha";

    const runtimeStrategy = makeRuntimeStrategy({
      captureHeadSha: async () => headSha,
    });

    // The CLI step simulates propagateVerificationResult advancing HEAD during run().
    const verificationStep: CliStep = {
      kind: "cli",
      name: "verification",
      run: async () => {
        // Simulate HEAD advancing after verification-result commit.
        headSha = "exit-sha";
      },
      resultFilePath: (_state, _deps) => path.join(tempDir, "verification-result.md"),
      parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, noopRunner, makeStoreFactory(tempDir));
    const resultState = await executor.execute(
      verificationStep,
      state,
      makeDeps({ runtimeStrategy }),
    );

    const runs = resultState.steps?.["verification"];
    expect(runs).toBeDefined();
    const lastRun = runs?.[runs.length - 1];

    // After T-01: expects "entry-sha" (captured before step.run())
    // Before T-01 (current): commitOid is undefined → FAIL → RED
    expect(lastRun?.commitOid).toBe("entry-sha");

    // Confirm exit-sha is NOT stored (entry HEAD, not exit HEAD)
    expect(lastRun?.commitOid).not.toBe("exit-sha");
  });

  it("StepRun.commitOid is entry HEAD even when captureHeadSha returns same value on first call", async () => {
    const jobId = "tc-005-entry-oid-same";
    const state = makeJobState(jobId);

    // captureHeadSha always returns "sha-c" — but T-01 must call it BEFORE step.run()
    // so the value doesn't change. The key is it's captured, not that it differs.
    const runtimeStrategy = makeRuntimeStrategy({
      captureHeadSha: async () => "sha-c",
    });

    const verificationStep: CliStep = {
      kind: "cli",
      name: "verification",
      run: async () => {},
      resultFilePath: () => path.join(tempDir, "verification-result-same.md"),
      parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, noopRunner, makeStoreFactory(tempDir));
    const resultState = await executor.execute(
      verificationStep,
      state,
      makeDeps({ runtimeStrategy }),
    );

    const runs = resultState.steps?.["verification"];
    const lastRun = runs?.[runs.length - 1];

    // After T-01: "sha-c" stored; Before T-01: undefined → FAIL → RED
    expect(lastRun?.commitOid).toBe("sha-c");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-006: runtimeStrategy 不在時は commitOid 未設定（should）
//
// When no runtimeStrategy is provided, captureHeadSha cannot be called.
// StepRun.commitOid must remain undefined (fail-safe).
// This is GREEN both before and after T-01 (current behavior preserved).
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-006: no runtimeStrategy → commitOid undefined (should)", () => {
  it("StepRun.commitOid is undefined when runtimeStrategy is absent", async () => {
    const jobId = "tc-006-no-strategy";
    const state = makeJobState(jobId);

    const verificationStep: CliStep = {
      kind: "cli",
      name: "verification",
      run: async () => {},
      resultFilePath: () => path.join(tempDir, "verification-result-no-strategy.md"),
      parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, noopRunner, makeStoreFactory(tempDir));
    // No runtimeStrategy in deps
    const resultState = await executor.execute(
      verificationStep,
      state,
      makeDeps({ runtimeStrategy: undefined }),
    );

    const runs = resultState.steps?.["verification"];
    const lastRun = runs?.[runs.length - 1];

    // No runtimeStrategy → no captureHeadSha call → commitOid undefined
    expect(lastRun?.commitOid).toBeUndefined();
  });

  it("StepRun.commitOid is undefined when captureHeadSha returns null", async () => {
    const jobId = "tc-006-null-sha";
    const state = makeJobState(jobId);

    // captureHeadSha returns null (e.g. managed runtime, git not available)
    const runtimeStrategy = makeRuntimeStrategy({
      captureHeadSha: async () => null,
    });

    const verificationStep: CliStep = {
      kind: "cli",
      name: "verification",
      run: async () => {},
      resultFilePath: () => path.join(tempDir, "verification-result-null.md"),
      parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
    };

    const events = new EventBus();
    const executor = new StepExecutor(events, noopRunner, makeStoreFactory(tempDir));
    const resultState = await executor.execute(
      verificationStep,
      state,
      makeDeps({ runtimeStrategy }),
    );

    const runs = resultState.steps?.["verification"];
    const lastRun = runs?.[runs.length - 1];

    // null SHA → should not set commitOid (undefined, not "null")
    // After T-01: undefined (null treated as absent)
    expect(lastRun?.commitOid).toBeUndefined();
  });
});
