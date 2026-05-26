/**
 * Behavior invariance tests: CLI stdout format pins.
 *
 * TC-027: [iter N/M] format — approved verdict matches bit-for-bit
 * TC-028: [iter N/M] format — needs-fix continuation matches bit-for-bit
 * TC-029: [iter N/M] format — retries exhausted matches bit-for-bit
 *
 * These tests pin the exact stdout strings produced by Pipeline.runSpecReviewLoop
 * to the legacy runLoopUntil format. Any change here is a behavior regression.
 *
 * Source: pipeline-orchestrator/spec.md — iteration progress format; tasks.md — 7.2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Pipeline } from "../src/core/pipeline/pipeline.js";
import { STANDARD_TRANSITIONS } from "../src/core/pipeline/types.js";
import { EventBus } from "../src/core/event/event-bus.js";
import { StepExecutor } from "../src/core/step/executor.js";
import type { Step } from "../src/core/step/types.js";
import type { JobState, StepRun } from "../src/state/schema.js";
import type { PipelineDeps } from "../src/core/types.js";
import type { SpawnFn } from "../src/util/spawn.js";
import { makeStoreFactory } from "./helpers/store-factory.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "stdout-snapshot-test-"));
  originalXdgDataHome = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = tempDir;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
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

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

const LOOP_NAME = "spec-review";

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "stdout-snapshot-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "design",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeMinimalDeps(): PipelineDeps {
  return {
    client: {} as PipelineDeps["client"],
    config: {
      version: 1,
      agents: {
        design: { agentId: "agent_001", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
        "spec-review": { agentId: "agent_spec_review", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
        "spec-fixer": { agentId: "agent_spec_fixer", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", adr: false },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
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
    },
    owner: "user",
    repo: "repo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
  };
}

function makeStepObject(name: string, extras?: Partial<import("../src/core/step/types.js").AgentStep>): Step {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name as import("../src/state/schema.js").AgentStepName,
      model: "claude-sonnet-4-5",
      system: `system for ${name}`,
      tools: [],
    },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    ...extras,
  };
}

function makeDesignStepObject(): Step {
  return makeStepObject("design", { completionVerdict: "success" });
}

function makeSpecReviewState(base: JobState, verdict: "approved" | "needs-fix" | "escalation", iter: number): JobState {
  return {
    ...base,
    status: "running",
    steps: {
      ...base.steps,
      "spec-review": [
        ...(base.steps?.["spec-review"] ?? []),
        { attempt: iter, sessionId: null, outcome: { verdict, findingsPath: null, error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" },
      ],
    },
  };
}

function getCapturedStdout(): string[] {
  return (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
    .flatMap((args: unknown[]) => String(args[0]).split("\n"))
    .filter((line: string) => line.length > 0);
}

// TC-027: [iter N/M] format — approved verdict matches bit-for-bit
// Note: STANDARD_TRANSITIONS routes spec-review approved → implementer (not end).
// "[iter N] spec-review verdict: approved → done" is only emitted when the transition
// is terminal (to "end" or "escalate"). This test uses a custom transition table that
// terminates at spec-review approved to verify the exact stdout format.
describe("TC-027: stdout [iter N/M] — approved verdict line is bit-for-bit exact", () => {
  it("emits '[iter 1/<max>] spec-review verdict: approved → done'", async () => {
    const maxIterations = 3;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const designResult: JobState = { ...state, status: "running", branch: "feat/test" };
    const specReviewResult = makeSpecReviewState(designResult, "approved", 1);

    const events = new EventBus();
    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "design") return designResult;
      if (step.name === "spec-review") return specReviewResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    // Use a custom transition table that terminates at spec-review approved
    // (to verify the exact stdout format without needing to mock implementer/verification)
    const testTransitions = [
      { step: "design",      on: "success",    to: "spec-review" },
      { step: "design",      on: "error",      to: "escalate" },
      { step: "spec-review", on: "approved",   to: "end" },       // terminal for this test
      { step: "spec-review", on: "needs-fix",  to: "spec-fixer" },
      { step: "spec-review", on: "escalation", to: "escalate" },
      { step: "spec-fixer",  on: "approved",   to: "spec-review" },
      { step: "spec-fixer",  on: "error",      to: "escalate" },
    ];

    const pipeline = new Pipeline({
      steps: new Map([
        ["design",      makeDesignStepObject()],
        ["spec-review", makeStepObject("spec-review")],
        ["spec-fixer",  makeStepObject("spec-fixer")],
      ]),
      transitions: testTransitions,
      maxIterations,
      executor: mockExecutor,
      events,
      loopName: LOOP_NAME,
    });

    await pipeline.run("design", state, deps);

    const stdout = getCapturedStdout();
    // Exact format pinned per pipeline.ts runSpecReviewLoop:
    // - iteration start: [iter N/M] starting <loopName>
    // - verdict: [iter N] <loopName> verdict: approved → done
    expect(stdout).toContain(`[iter 1/${maxIterations}] starting ${LOOP_NAME}`);
    expect(stdout).toContain(`[iter 1] ${LOOP_NAME} verdict: approved → done`);
  });
});

// TC-028: [iter N/M] format — needs-fix continuation matches bit-for-bit
describe("TC-028: stdout [iter N/M] — needs-fix continuation line is bit-for-bit exact", () => {
  it("emits '[iter 1/2] spec-review verdict: needs-fix → spawning fixer' when needs-fix and iter < max", async () => {
    const maxIterations = 2;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const designResult: JobState = { ...state, status: "running", branch: "feat/test" };
    const specReview1 = makeSpecReviewState(designResult, "needs-fix", 1);
    const specFixerResult: JobState = { ...specReview1, step: "spec-fixer" };
    const specReview2 = makeSpecReviewState(specFixerResult, "approved", 2);

    const events = new EventBus();
    let specReviewCall = 0;
    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "design") return designResult;
      if (step.name === "spec-fixer") return specFixerResult;
      if (step.name === "spec-review") {
        return specReviewCall++ === 0 ? specReview1 : specReview2;
      }
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    // Use a custom transition table that terminates at spec-review approved
    // (to verify the exact stdout format without needing to mock implementer/verification)
    const testTransitions = [
      { step: "design",      on: "success",    to: "spec-review" },
      { step: "design",      on: "error",      to: "escalate" },
      { step: "spec-review", on: "approved",   to: "end" },       // terminal for this test
      { step: "spec-review", on: "needs-fix",  to: "spec-fixer" },
      { step: "spec-review", on: "escalation", to: "escalate" },
      { step: "spec-fixer",  on: "approved",   to: "spec-review" },
      { step: "spec-fixer",  on: "error",      to: "escalate" },
    ];

    const pipeline = new Pipeline({
      steps: new Map([
        ["design",      makeDesignStepObject()],
        ["spec-review", makeStepObject("spec-review")],
        ["spec-fixer",  makeStepObject("spec-fixer")],
      ]),
      transitions: testTransitions,
      maxIterations,
      executor: mockExecutor,
      events,
      loopName: LOOP_NAME,
    });

    await pipeline.run("design", state, deps);

    const stdout = getCapturedStdout();
    // Exact format pinned per pipeline.ts runSpecReviewLoop:
    // - [iter N] <loopName> verdict: needs-fix → spawning fixer
    expect(stdout).toContain(`[iter 1] ${LOOP_NAME} verdict: needs-fix → spawning fixer`);
  });
});

// TC-029: [iter N/M] format — retries exhausted matches bit-for-bit
describe("TC-029: stdout [iter N/M] — retries exhausted line is bit-for-bit exact", () => {
  it("emits '[iter 2/2] retries exhausted, escalating' when maxIterations reached with needs-fix", async () => {
    const maxIterations = 2;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const designResult: JobState = { ...state, status: "running", branch: "feat/test" };

    let specReviewCall = 0;
    const specReview1 = makeSpecReviewState(designResult, "needs-fix", 1);
    const specReview2 = makeSpecReviewState(specReview1, "needs-fix", 2);

    const events = new EventBus();
    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "design") return designResult;
      if (step.name === "spec-fixer") return { ...designResult };
      if (step.name === "spec-review") {
        return specReviewCall++ === 0 ? specReview1 : specReview2;
      }
      // delta-spec-validation and delta-spec-fixer run freely (not in loopNames)
      if (step.name === "delta-spec-validation") return currentState;
      if (step.name === "delta-spec-fixer") return currentState;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const pipeline = new Pipeline({
      steps: new Map([
        ["design",                makeDesignStepObject()],
        ["spec-review",           makeStepObject("spec-review")],
        ["spec-fixer",            makeStepObject("spec-fixer")],
        ["delta-spec-validation", { kind: "cli" as const, name: "delta-spec-validation", run: async () => {}, resultFilePath: () => "dsv-result.md", parseResult: () => ({ verdict: "approved" as const, findingsPath: null }) }],
        ["delta-spec-fixer",      makeStepObject("delta-spec-fixer")],
      ]),
      transitions: STANDARD_TRANSITIONS,
      maxIterations,
      executor: mockExecutor,
      events,
      loopName: LOOP_NAME,
      // delta-spec-validation is NOT in loopNames — spec-review is the only loop here
    });

    await pipeline.run("design", state, deps);

    const stdout = getCapturedStdout();
    // Exact format pinned: [iter 2/2] retries exhausted, escalating
    expect(stdout).toContain(`[iter ${maxIterations}/${maxIterations}] retries exhausted on spec-review, escalating`);
  });
});
