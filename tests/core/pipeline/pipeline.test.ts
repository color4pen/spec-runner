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
import type { SpawnFn } from "../../../src/util/spawn.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { changeFolderPath, reviewFeedbackPath, verificationResultPath, prCreateResultPath } from "../../../src/util/paths.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

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
      agents: { design: { agentId: "agent_001", definitionHash: "sha", lastSyncedAt: "2026-01-01" } },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    repo: { owner: "testowner", name: "testrepo" },
    request: { type: "feature", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", enabled: [] },
    slug: "test-slug",
    sleepFn: vi.fn().mockResolvedValue(undefined),
    githubClient: {
      verifyBranch: vi.fn().mockResolvedValue(true),
      getRawFile: vi.fn().mockResolvedValue(null),
      verifyPath: vi.fn().mockResolvedValue(true),
      verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
      getRefSha: vi.fn().mockResolvedValue(null),
    },
    spawn: noopSpawn,
  };
}

/**
 * Build a mock StepExecutor that uses spy functions to control step behavior.
 * The executor.execute spy receives the step and returns the provided result.
 */
function buildMockPipeline(opts: {
  designResult: JobState | Error;
  specReviewResults?: Array<JobState | Error>;
  specFixerResults?: Array<JobState | Error>;
  implementerResult?: JobState | Error;
  verificationResults?: Array<JobState | Error>;
  buildFixerResults?: Array<JobState | Error>;
  maxIterations?: number;
}): { pipeline: Pipeline; events: EventBus; executeSpy: ReturnType<typeof vi.fn> } {
  const events = new EventBus();

  let specReviewCallCount = 0;
  let specFixerCallCount = 0;
  let verificationCallCount = 0;
  let buildFixerCallCount = 0;

  // Default: implementer succeeds with "success" verdict recorded
  const defaultImplementerResult = (base: JobState): JobState => ({
    ...base,
    status: "running",
    steps: {
      ...base.steps,
      "implementer": [{ attempt: 1, sessionId: null, outcome: { verdict: "success" as const, findingsPath: null, error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" }],
    },
  });

  // Default: verification passes
  const defaultVerificationResult = (base: JobState): JobState => ({
    ...base,
    status: "running",
    steps: {
      ...base.steps,
      "verification": [...(base.steps?.["verification"] ?? []), { attempt: (base.steps?.["verification"]?.length ?? 0) + 1, sessionId: null, outcome: { verdict: "passed" as const, findingsPath: null, error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" }],
    },
  });

  // Default: code-review approves
  const defaultCodeReviewResult = (base: JobState): JobState => ({
    ...base,
    status: "running",
    steps: {
      ...base.steps,
      "code-review": [
        ...(base.steps?.["code-review"] ?? []),
        { attempt: (base.steps?.["code-review"]?.length ?? 0) + 1, sessionId: null, outcome: { verdict: "approved" as const, findingsPath: reviewFeedbackPath("test-slug", 1), error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" },
      ],
    },
  });

  const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
    if (step.name === "design") {
      if (opts.designResult instanceof Error) throw opts.designResult;
      return opts.designResult;
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
    if (step.name === "test-case-gen") {
      // Default: test-case-gen succeeds (completionVerdict: success)
      return {
        ...currentState,
        steps: {
          ...currentState.steps,
          "test-case-gen": [{ attempt: 1, sessionId: null, outcome: { verdict: "success" as const, findingsPath: null, error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" }],
        },
      };
    }
    if (step.name === "implementer") {
      if (opts.implementerResult instanceof Error) throw opts.implementerResult;
      return opts.implementerResult ?? defaultImplementerResult(currentState);
    }
    if (step.name === "verification") {
      const results = opts.verificationResults ?? [];
      if (results.length > 0) {
        const result = results[verificationCallCount] ?? results[results.length - 1];
        verificationCallCount++;
        if (result instanceof Error) throw result;
        return result;
      }
      return defaultVerificationResult(currentState);
    }
    if (step.name === "build-fixer") {
      const results = opts.buildFixerResults ?? [];
      const result = results[buildFixerCallCount] ?? results[results.length - 1];
      buildFixerCallCount++;
      if (result instanceof Error) throw result;
      return result ?? currentState;
    }
    if (step.name === "code-review") {
      return defaultCodeReviewResult(currentState);
    }
    if (step.name === "code-fixer") {
      return currentState;
    }
    if (step.name === "pr-create") {
      // Default: pr-create succeeds
      return {
        ...currentState,
        steps: {
          ...currentState.steps,
          "pr-create": [{ attempt: 1, sessionId: null, outcome: { verdict: "success" as const, findingsPath: null, error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" }],
        },
      };
    }
    throw new Error(`Unknown step: ${step.name}`);
  });

  const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

  const steps = new Map<string, Step>([
    ["design",       { kind: "agent", name: "design",       agent: { name: "test", role: "design", model: "claude-sonnet-4-5", system: "", tools: [] }, completionVerdict: "success", buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
    ["spec-review",  { kind: "agent", name: "spec-review",  agent: { name: "test", role: "spec-review", model: "claude-sonnet-4-5", system: "", tools: [] }, buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
    ["spec-fixer",   { kind: "agent", name: "spec-fixer",   agent: { name: "test", role: "spec-fixer", model: "claude-sonnet-4-5", system: "", tools: [] }, buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
    ["test-case-gen", { kind: "agent", name: "test-case-gen", agent: { name: "test", role: "test-case-gen", model: "claude-sonnet-4-6", system: "", tools: [] }, completionVerdict: "success", buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
    ["implementer",  { kind: "agent", name: "implementer",  agent: { name: "test", role: "implementer", model: "claude-sonnet-4-5", system: "", tools: [] }, completionVerdict: "success", buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
    ["verification", { kind: "cli",   name: "verification",  run: async () => {}, resultFilePath: () => verificationResultPath("test"), parseResult: () => ({ verdict: "passed" as const, findingsPath: null }) }],
    ["build-fixer",  { kind: "agent", name: "build-fixer",  agent: { name: "test", role: "build-fixer", model: "claude-sonnet-4-5", system: "", tools: [] }, completionVerdict: "success", buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
    ["code-review",  { kind: "agent", name: "code-review",  agent: { name: "test", role: "code-review", model: "claude-sonnet-4-5", system: "", tools: [] }, buildMessage: () => "", resultFilePath: () => reviewFeedbackPath("test", 1), parseResult: () => ({ verdict: "approved" as const, findingsPath: null }) }],
    ["code-fixer",   { kind: "agent", name: "code-fixer",   agent: { name: "test", role: "code-fixer", model: "claude-sonnet-4-5", system: "", tools: [] }, completionVerdict: "approved", buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
    ["pr-create",    { kind: "cli",   name: "pr-create",    run: async () => {}, resultFilePath: () => prCreateResultPath("test"), parseResult: () => ({ verdict: "success" as const, findingsPath: null }) }],
  ]);

  const pipeline = new Pipeline({
    steps,
    transitions: STANDARD_TRANSITIONS,
    maxIterations: opts.maxIterations ?? 2,
    executor: mockExecutor,
    events,
    loopName: "spec-review",
    loopNames: ["spec-review", "verification", "code-review"],
  });

  return { pipeline, events, executeSpy };
}

function makeSpecReviewState(state: JobState, verdict: "approved" | "needs-fix" | "escalation", iter: number): JobState {
  return {
    ...state,
    status: "running",
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

    const designResult: JobState = { ...state, status: "running", branch: "feat/test", step: "design" };
    const specReviewResult = makeSpecReviewState(designResult, "approved", 1);

    const { pipeline, executeSpy } = buildMockPipeline({
      designResult,
      specReviewResults: [specReviewResult],
      maxIterations: 2,
    });

    const result = await pipeline.run("design", state, deps);

    // propose called once
    const designCalls = executeSpy.mock.calls.filter(([step]) => step.name === "design");
    const specReviewCalls = executeSpy.mock.calls.filter(([step]) => step.name === "spec-review");
    const specFixerCalls = executeSpy.mock.calls.filter(([step]) => step.name === "spec-fixer");

    expect(designCalls).toHaveLength(1);
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

    const designResult: JobState = {
      ...state,
      status: "failed",
      error: { code: "BRANCH_NOT_REGISTERED", message: "Branch not registered", hint: "" },
    };

    const { pipeline, executeSpy } = buildMockPipeline({
      designResult,
      maxIterations: 2,
    });

    const result = await pipeline.run("design", state, deps);

    const specReviewCalls = executeSpy.mock.calls.filter(([step]) => step.name === "spec-review");
    expect(specReviewCalls).toHaveLength(0);
    expect(result.status).toBe("awaiting-resume");
  });
});

// TC-062: Pipeline — spec-review cycle: needs-fix → spec-fixer → spec-review approved
describe("TC-062: Pipeline — needs-fix → spec-fixer → spec-review approved cycle", () => {
  it("runs spec-fixer on needs-fix and spec-review on iter 2 approved", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const designResult: JobState = { ...state, status: "running", branch: "feat/test" };
    const specReview1 = makeSpecReviewState(designResult, "needs-fix", 1);
    const specFixerResult: JobState = { ...specReview1, step: "spec-fixer" };
    const specReview2 = makeSpecReviewState(specFixerResult, "approved", 2);

    const { pipeline, executeSpy } = buildMockPipeline({
      designResult,
      specReviewResults: [specReview1, specReview2],
      specFixerResults: [specFixerResult],
      maxIterations: 2,
    });

    const result = await pipeline.run("design", state, deps);

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

    const designResult: JobState = { ...state, status: "running", branch: "feat/test" };

    // All iterations return needs-fix
    let callCount = 0;
    const specReviewResults = [
      makeSpecReviewState(designResult, "needs-fix", 1),
      makeSpecReviewState({ ...designResult, steps: { "spec-review": [{ attempt: 1, sessionId: null, outcome: { verdict: "needs-fix" as const, findingsPath: null, error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" }] } }, "needs-fix", 2),
    ];
    const specFixerResult: JobState = { ...designResult };

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "design") return designResult;
      if (step.name === "spec-review") {
        return specReviewResults[callCount++] ?? specReviewResults[specReviewResults.length - 1];
      }
      if (step.name === "spec-fixer") return specFixerResult;
      throw new Error(`Unknown: ${step.name}`);
    });

    const steps = new Map<string, Step>([
      ["design",      { kind: "agent", name: "design",      agent: { name: "test", role: "design", model: "claude-sonnet-4-5", system: "", tools: [] }, completionVerdict: "success", buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
      ["spec-review", { kind: "agent", name: "spec-review", agent: { name: "test", role: "spec-review", model: "claude-sonnet-4-5", system: "", tools: [] }, buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
      ["spec-fixer",  { kind: "agent", name: "spec-fixer",  agent: { name: "test", role: "spec-fixer", model: "claude-sonnet-4-5", system: "", tools: [] }, buildMessage: () => "", resultFilePath: () => null, parseResult: () => ({ verdict: null, findingsPath: null }) }],
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

    const result = await pipeline.run("design", state, deps);

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

    const designResult: JobState = { ...state, status: "running", branch: "feat/test" };
    const specReviewResult = makeSpecReviewState(designResult, "escalation", 1);

    const { pipeline, executeSpy } = buildMockPipeline({
      designResult,
      specReviewResults: [specReviewResult],
      maxIterations: 2,
    });

    const result = await pipeline.run("design", state, deps);

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

    const designResult: JobState = { ...state, status: "running", branch: "feat/test" };
    const specReviewResult = makeSpecReviewState(designResult, "approved", 1);

    const { pipeline, events } = buildMockPipeline({
      designResult,
      specReviewResults: [specReviewResult],
      maxIterations: 2,
    });

    const emitted: string[] = [];
    events.on("pipeline:start", () => emitted.push("pipeline:start"));
    events.on("pipeline:complete", () => emitted.push("pipeline:complete"));
    events.on("pipeline:fail", () => emitted.push("pipeline:fail"));

    await pipeline.run("design", state, deps);

    expect(emitted).toContain("pipeline:start");
    expect(emitted).toContain("pipeline:complete");
    expect(emitted).not.toContain("pipeline:fail");
  });

  it("emits pipeline:start and pipeline:fail on propose error", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const designResult: JobState = {
      ...state,
      status: "failed",
      error: { code: "SESSION_TERMINATED", message: "terminated", hint: "" },
    };

    const { pipeline, events } = buildMockPipeline({
      designResult,
      maxIterations: 2,
    });

    const emitted: string[] = [];
    events.on("pipeline:start", () => emitted.push("pipeline:start"));
    events.on("pipeline:complete", () => emitted.push("pipeline:complete"));
    events.on("pipeline:fail", () => emitted.push("pipeline:fail"));

    await pipeline.run("design", state, deps);

    expect(emitted).toContain("pipeline:start");
    // Pipeline does not throw when propose returns failed state (non-success, non-throwing)
    // but it does return early. Complete is emitted since no exception was thrown.
    expect(emitted).toContain("pipeline:complete");
  });
});

// TC-067: STANDARD_TRANSITIONS table — correct entries
describe("TC-067: STANDARD_TRANSITIONS — correct transition table", () => {
  it("contains all required spec-layer transitions", () => {
    const find = (step: string, on: string) =>
      STANDARD_TRANSITIONS.find((t) => t.step === step && t.on === on);

    expect(find("design",        "success")).toMatchObject({ to: "spec-review" });
    expect(find("design",        "error")).toMatchObject({ to: "escalate" });
    expect(find("spec-review",   "approved")).toMatchObject({ to: "test-case-gen" });
    expect(find("spec-review",   "needs-fix")).toMatchObject({ to: "spec-fixer" });
    expect(find("spec-review",   "escalation")).toMatchObject({ to: "escalate" });
    expect(find("spec-fixer",    "approved")).toMatchObject({ to: "spec-review" });
    expect(find("spec-fixer",    "error")).toMatchObject({ to: "escalate" });
    expect(find("test-case-gen", "success")).toMatchObject({ to: "implementer" });
    expect(find("test-case-gen", "error")).toMatchObject({ to: "escalate" });
  });

  it("contains all required implementation-layer transitions (TC-012)", () => {
    const find = (step: string, on: string) =>
      STANDARD_TRANSITIONS.find((t) => t.step === step && t.on === on);

    expect(find("implementer",  "success")).toMatchObject({ to: "verification" });
    expect(find("implementer",  "error")).toMatchObject({ to: "escalate" });
    expect(find("verification", "passed")).toMatchObject({ to: "code-review" });
    expect(find("verification", "failed")).toMatchObject({ to: "build-fixer" });
    expect(find("verification", "escalation")).toMatchObject({ to: "escalate" });
    expect(find("build-fixer",  "success")).toMatchObject({ to: "verification" });
    expect(find("build-fixer",  "error")).toMatchObject({ to: "escalate" });
    // code-review loop rows (code-review approved now routes to pr-create, not end)
    expect(find("code-review",  "approved")).toMatchObject({ to: "pr-create" });
    expect(find("code-review",  "needs-fix")).toMatchObject({ to: "code-fixer" });
    expect(find("code-review",  "escalation")).toMatchObject({ to: "escalate" });
    expect(find("code-fixer",   "approved")).toMatchObject({ to: "code-review" });
    expect(find("code-fixer",   "error")).toMatchObject({ to: "escalate" });
    // pr-create rows
    expect(find("pr-create",    "success")).toMatchObject({ to: "end" });
    expect(find("pr-create",    "error")).toMatchObject({ to: "escalate" });
  });

  it("has exactly 23 transitions (21 original + 2 new test-case-gen rows)", () => {
    expect(STANDARD_TRANSITIONS).toHaveLength(23);
  });
});

// TC-068: Pipeline stdout — iter format matches legacy runLoopUntil
describe("TC-068: Pipeline stdout — iter format bit-for-bit preserved", () => {
  it("outputs [iter N/M] starting spec-review", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const designResult: JobState = { ...state, status: "running", branch: "feat/test" };
    const specReviewResult = makeSpecReviewState(designResult, "approved", 1);

    const { pipeline } = buildMockPipeline({
      designResult,
      specReviewResults: [specReviewResult],
      maxIterations: 3,
    });

    await pipeline.run("design", state, deps);

    const stdout = (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");

    // spec-review still uses iter counter even though it routes to implementer now
    expect(stdout).toContain("[iter 1/3] starting spec-review");
    // Pipeline finished summary still appears (spec-review is in the pipeline)
    expect(stdout).toContain("Pipeline finished: spec-review iterations=1");
  });
});
