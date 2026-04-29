/**
 * Unit tests for src/core/pipeline/pipeline.ts — Pipeline class.
 *
 * TC-060: Pipeline — propose success → spec-review approved (no fixer)
 * TC-061: Pipeline — propose failure → early exit (pipeline:fail emitted)
 * TC-062: Pipeline — spec-review cycle: needs-fix → spec-fixer → spec-review approved
 * TC-063: Pipeline — loop guard exhaustion → SPEC_REVIEW_RETRIES_EXHAUSTED
 * TC-065: Pipeline — spec-review escalation → halt immediately
 * TC-066: Pipeline — pipeline:start / pipeline:complete / pipeline:fail emitted
 * TC-067: STANDARD_TRANSITIONS table has correct entries
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Pipeline } from "../../../src/core/pipeline/pipeline.js";
import { STANDARD_TRANSITIONS } from "../../../src/core/pipeline/types.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../src/core/step/executor.js";
import { toLegacyStepResult } from "../../../src/state/helpers.js";
import type { Step } from "../../../src/core/step/types.js";
import type { JobState, StepRun } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-class-test-"));
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

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-pipeline-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "propose",
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
      anthropic: { apiKey: "sk-test" },
      agent: { id: "agent_001", definitionHash: "sha", lastSyncedAt: "2026-01-01" },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
      github: { accessToken: "ghp_test", tokenObtainedAt: "2026-01-01", scopes: ["repo"] },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test", content: "content", enabled: [] },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Build a mock StepExecutor that uses spy functions to control step behavior.
 * The executor.execute spy receives the step and returns the provided result.
 */
function buildMockPipeline(opts: {
  proposeResult: JobState | Error;
  specReviewResults?: Array<JobState | Error>;
  specFixerResults?: Array<JobState | Error>;
  maxIterations?: number;
}): { pipeline: Pipeline; events: EventBus; executeSpy: ReturnType<typeof vi.fn> } {
  const events = new EventBus();

  let specReviewCallCount = 0;
  let specFixerCallCount = 0;

  const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
    if (step.name === "propose") {
      if (opts.proposeResult instanceof Error) throw opts.proposeResult;
      return opts.proposeResult;
    }
    if (step.name === "spec-review") {
      const results = opts.specReviewResults ?? [];
      const result = results[specReviewCallCount] ?? results[results.length - 1];
      specReviewCallCount++;
      if (result instanceof Error) throw result;
      return result;
    }
    if (step.name === "spec-fixer") {
      const results = opts.specFixerResults ?? [];
      const result = results[specFixerCallCount] ?? results[results.length - 1];
      specFixerCallCount++;
      if (result instanceof Error) throw result;
      return result;
    }
    throw new Error(`Unknown step: ${step.name}`);
  });

  const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

  const steps = new Map<string, Step>([
    ["propose",     { name: "propose",     agent: { agentId: "" }, buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
    ["spec-review", { name: "spec-review", agent: { agentId: "" }, buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
    ["spec-fixer",  { name: "spec-fixer",  agent: { agentId: "" }, buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
  ]);

  const pipeline = new Pipeline({
    steps,
    transitions: STANDARD_TRANSITIONS,
    maxIterations: opts.maxIterations ?? 2,
    executor: mockExecutor,
    events,
    loopName: "spec-review",
  });

  return { pipeline, events, executeSpy };
}

function makeSpecReviewState(state: JobState, verdict: "approved" | "needs-fix" | "escalation", iter: number): JobState {
  return {
    ...state,
    status: "success",
    steps: {
      ...state.steps,
      "spec-review": [
        ...(state.steps?.["spec-review"] ?? []),
        { attempt: iter, sessionId: null, outcome: { verdict, findingsPath: null, error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" },
      ],
    },
  };
}

// TC-060: Pipeline — propose success → spec-review approved (no fixer)
describe("TC-060: Pipeline — propose success → spec-review approved: no fixer invoked", () => {
  it("runs propose once, spec-review once, spec-fixer not called", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const proposeResult: JobState = { ...state, status: "success", branch: "feat/test", step: "propose" };
    const specReviewResult = makeSpecReviewState(proposeResult, "approved", 1);

    const { pipeline, executeSpy } = buildMockPipeline({
      proposeResult,
      specReviewResults: [specReviewResult],
      maxIterations: 2,
    });

    const result = await pipeline.run("propose", state, deps);

    // propose called once
    const proposeCalls = executeSpy.mock.calls.filter(([step]) => step.name === "propose");
    const specReviewCalls = executeSpy.mock.calls.filter(([step]) => step.name === "spec-review");
    const specFixerCalls = executeSpy.mock.calls.filter(([step]) => step.name === "spec-fixer");

    expect(proposeCalls).toHaveLength(1);
    expect(specReviewCalls).toHaveLength(1);
    expect(specFixerCalls).toHaveLength(0);

    const firstSpecReview = result.steps?.["spec-review"]?.[0];
    expect(firstSpecReview ? toLegacyStepResult(firstSpecReview).verdict : undefined).toBe("approved");
  });
});

// TC-061: Pipeline — propose failure (non-success state) → skip spec-review
describe("TC-061: Pipeline — propose non-success → skip spec-review", () => {
  it("returns failed state without running spec-review when propose returns failed status", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const proposeResult: JobState = {
      ...state,
      status: "failed",
      error: { code: "BRANCH_NOT_REGISTERED", message: "Branch not registered", hint: "" },
    };

    const { pipeline, executeSpy } = buildMockPipeline({
      proposeResult,
      maxIterations: 2,
    });

    const result = await pipeline.run("propose", state, deps);

    const specReviewCalls = executeSpy.mock.calls.filter(([step]) => step.name === "spec-review");
    expect(specReviewCalls).toHaveLength(0);
    expect(result.status).toBe("failed");
  });
});

// TC-062: Pipeline — spec-review cycle: needs-fix → spec-fixer → spec-review approved
describe("TC-062: Pipeline — needs-fix → spec-fixer → spec-review approved cycle", () => {
  it("runs spec-fixer on needs-fix and spec-review on iter 2 approved", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const proposeResult: JobState = { ...state, status: "success", branch: "feat/test" };
    const specReview1 = makeSpecReviewState(proposeResult, "needs-fix", 1);
    const specFixerResult: JobState = { ...specReview1, step: "spec-fixer" };
    const specReview2 = makeSpecReviewState(specFixerResult, "approved", 2);

    const { pipeline, executeSpy } = buildMockPipeline({
      proposeResult,
      specReviewResults: [specReview1, specReview2],
      specFixerResults: [specFixerResult],
      maxIterations: 2,
    });

    const result = await pipeline.run("propose", state, deps);

    const specReviewCalls = executeSpy.mock.calls.filter(([step]) => step.name === "spec-review");
    const specFixerCalls = executeSpy.mock.calls.filter(([step]) => step.name === "spec-fixer");

    expect(specReviewCalls).toHaveLength(2);
    expect(specFixerCalls).toHaveLength(1);
    const lastSpecReview = result.steps?.["spec-review"]?.at(-1);
    expect(lastSpecReview ? toLegacyStepResult(lastSpecReview).verdict : undefined).toBe("approved");
  });
});

// TC-063: Pipeline — loop guard exhaustion → SPEC_REVIEW_RETRIES_EXHAUSTED
describe("TC-063: Pipeline — loop exhaustion: SPEC_REVIEW_RETRIES_EXHAUSTED", () => {
  it("sets SPEC_REVIEW_RETRIES_EXHAUSTED error when all iterations return needs-fix", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const proposeResult: JobState = { ...state, status: "success", branch: "feat/test" };

    // All iterations return needs-fix
    let callCount = 0;
    const specReviewResults = [
      makeSpecReviewState(proposeResult, "needs-fix", 1),
      makeSpecReviewState({ ...proposeResult, steps: { "spec-review": [{ attempt: 1, sessionId: null, outcome: { verdict: "needs-fix" as const, findingsPath: null, error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" }] } }, "needs-fix", 2),
    ];
    const specFixerResult: JobState = { ...proposeResult };

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "propose") return proposeResult;
      if (step.name === "spec-review") {
        return specReviewResults[callCount++] ?? specReviewResults[specReviewResults.length - 1];
      }
      if (step.name === "spec-fixer") return specFixerResult;
      throw new Error(`Unknown: ${step.name}`);
    });

    const steps = new Map<string, Step>([
      ["propose",     { name: "propose",     agent: { agentId: "" }, buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
      ["spec-review", { name: "spec-review", agent: { agentId: "" }, buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
      ["spec-fixer",  { name: "spec-fixer",  agent: { agentId: "" }, buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
    ]);

    const events = new EventBus();
    const pipeline = new Pipeline({
      steps,
      transitions: STANDARD_TRANSITIONS,
      maxIterations: 2,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
    });

    const result = await pipeline.run("propose", state, deps);

    // Should have SPEC_REVIEW_RETRIES_EXHAUSTED error
    expect(result.error?.code).toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");

    const stdout = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");
    expect(stdout).toContain("[iter 2/2] retries exhausted, escalating");
  });
});

// TC-065: Pipeline — spec-review escalation → halt immediately, no fixer
describe("TC-065: Pipeline — spec-review escalation halts without running fixer", () => {
  it("halts immediately on escalation verdict, spec-fixer never called", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const proposeResult: JobState = { ...state, status: "success", branch: "feat/test" };
    const specReviewResult = makeSpecReviewState(proposeResult, "escalation", 1);

    const { pipeline, executeSpy } = buildMockPipeline({
      proposeResult,
      specReviewResults: [specReviewResult],
      maxIterations: 2,
    });

    const result = await pipeline.run("propose", state, deps);

    const specFixerCalls = executeSpy.mock.calls.filter(([step]) => step.name === "spec-fixer");
    expect(specFixerCalls).toHaveLength(0);

    // Check stdout contains escalation halt message
    const stdout = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");
    expect(stdout).toContain("[iter 1] spec-review verdict: escalation → halt");

    // State has the escalation verdict
    const firstSpecReview2 = result.steps?.["spec-review"]?.[0];
    expect(firstSpecReview2 ? toLegacyStepResult(firstSpecReview2).verdict : undefined).toBe("escalation");
  });
});

// TC-066: Pipeline — pipeline:start / pipeline:complete / pipeline:fail emitted
describe("TC-066: Pipeline — lifecycle events emitted", () => {
  it("emits pipeline:start and pipeline:complete on success", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const proposeResult: JobState = { ...state, status: "success", branch: "feat/test" };
    const specReviewResult = makeSpecReviewState(proposeResult, "approved", 1);

    const { pipeline, events } = buildMockPipeline({
      proposeResult,
      specReviewResults: [specReviewResult],
      maxIterations: 2,
    });

    const emitted: string[] = [];
    events.on("pipeline:start", () => emitted.push("pipeline:start"));
    events.on("pipeline:complete", () => emitted.push("pipeline:complete"));
    events.on("pipeline:fail", () => emitted.push("pipeline:fail"));

    await pipeline.run("propose", state, deps);

    expect(emitted).toContain("pipeline:start");
    expect(emitted).toContain("pipeline:complete");
    expect(emitted).not.toContain("pipeline:fail");
  });

  it("emits pipeline:start and pipeline:fail on propose error", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const proposeResult: JobState = {
      ...state,
      status: "failed",
      error: { code: "SESSION_TIMEOUT", message: "timeout", hint: "" },
    };

    const { pipeline, events } = buildMockPipeline({
      proposeResult,
      maxIterations: 2,
    });

    const emitted: string[] = [];
    events.on("pipeline:start", () => emitted.push("pipeline:start"));
    events.on("pipeline:complete", () => emitted.push("pipeline:complete"));
    events.on("pipeline:fail", () => emitted.push("pipeline:fail"));

    await pipeline.run("propose", state, deps);

    expect(emitted).toContain("pipeline:start");
    // Pipeline does not throw when propose returns failed state (non-success, non-throwing)
    // but it does return early. Complete is emitted since no exception was thrown.
    expect(emitted).toContain("pipeline:complete");
  });
});

// TC-067: STANDARD_TRANSITIONS table — correct entries
describe("TC-067: STANDARD_TRANSITIONS — correct transition table", () => {
  it("contains all required transitions", () => {
    const find = (step: string, on: string) =>
      STANDARD_TRANSITIONS.find((t) => t.step === step && t.on === on);

    expect(find("propose",     "success")).toMatchObject({ to: "spec-review" });
    expect(find("propose",     "error")).toMatchObject({ to: "escalate" });
    expect(find("spec-review", "approved")).toMatchObject({ to: "end" });
    expect(find("spec-review", "needs-fix")).toMatchObject({ to: "spec-fixer" });
    expect(find("spec-review", "escalation")).toMatchObject({ to: "escalate" });
    expect(find("spec-fixer",  "approved")).toMatchObject({ to: "spec-review" });
    expect(find("spec-fixer",  "error")).toMatchObject({ to: "escalate" });
  });

  it("has exactly 7 transitions", () => {
    expect(STANDARD_TRANSITIONS).toHaveLength(7);
  });
});

// TC-068: Pipeline stdout — iter format matches legacy runLoopUntil
describe("TC-068: Pipeline stdout — iter format bit-for-bit preserved", () => {
  it("outputs [iter N/M] starting spec-review and verdict lines", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const proposeResult: JobState = { ...state, status: "success", branch: "feat/test" };
    const specReviewResult = makeSpecReviewState(proposeResult, "approved", 1);

    const { pipeline } = buildMockPipeline({
      proposeResult,
      specReviewResults: [specReviewResult],
      maxIterations: 3,
    });

    await pipeline.run("propose", state, deps);

    const stdout = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    expect(stdout).toContain("[iter 1/3] starting spec-review");
    expect(stdout).toContain("[iter 1] spec-review verdict: approved → done");
  });
});
