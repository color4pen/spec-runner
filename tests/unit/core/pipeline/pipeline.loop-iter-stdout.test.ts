/**
 * Tests for loop iteration stdout output (cli-step-observable-progress)
 *
 * TC-L01: spec-review iteration emits [iter 1/M] starting spec-review (existing behavior)
 * TC-L02: verification iteration emits [iter 1/M] starting verification (bug-fix)
 * TC-L03: code-review iteration emits [iter 1/M] starting code-review (bug-fix)
 * TC-L04: loopNames step verdict display uses currentStep name (approved + needs-fix)
 * TC-L05: TC-068 regression guard — [iter 1/3] starting spec-review still passes
 *
 * These tests verify that all loopNames steps emit [iter N/M] progress lines,
 * not just the primary loopName (spec-review). Fixes bug where isLoopStep checked
 * only the primary loop name.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Pipeline } from "../../../../src/core/pipeline/pipeline.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../../src/core/step/executor.js";
import type { Step } from "../../../../src/core/step/types.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import { defaultStoreFactory } from "../../../helpers/store-factory.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-loop-iter-stdout-test-"));
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

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-loop-iter-stdout-job",
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
      agents: {},
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
    storeFactory: defaultStoreFactory,
  };
}

function makeAgentStep(name: string, completionVerdict?: string): Step {
  return {
    kind: "agent",
    name,
    agent: { name: `specrunner-${name}`, role: name as import("../../../../src/state/schema.js").AgentStepName, model: "claude-sonnet-4-5", system: "", tools: [] },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    ...(completionVerdict !== undefined ? { completionVerdict: completionVerdict as import("../../../../src/state/schema.js").Verdict } : {}),
  };
}

function getCapturedStdout(): string {
  return (process.stdout.write as ReturnType<typeof vi.fn>).mock.calls
    .map((args: unknown[]) => String(args[0]))
    .join("");
}

function makeStateWithVerdict(base: JobState, stepName: string, verdict: string, iter: number): JobState {
  return {
    ...base,
    status: "running",
    steps: {
      ...base.steps,
      [stepName]: [
        ...(base.steps?.[stepName] ?? []),
        { attempt: iter, sessionId: null, outcome: { verdict: verdict as import("../../../../src/state/schema.js").Verdict, findingsPath: null, error: null }, startedAt: "2026-01-01", endedAt: "2026-01-01" },
      ],
    },
  };
}

// TC-L01: spec-review iteration emits [iter 1/M] starting spec-review (existing behavior)
describe("TC-L01: spec-review iter start uses currentStep name", () => {
  it("emits [iter 1/3] starting spec-review when spec-review is entered", async () => {
    const maxIterations = 3;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const specReviewResult = makeStateWithVerdict(state, "spec-review", "approved", 1);

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "spec-review") return specReviewResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([["spec-review", makeAgentStep("spec-review")]]),
      transitions: [
        { step: "spec-review", on: "approved", to: "end" },
        { step: "spec-review", on: "needs-fix", to: "spec-review" },
        { step: "spec-review", on: "escalation", to: "escalate" },
      ],
      maxIterations,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review", "verification", "code-review"],
    });

    await pipeline.run("spec-review", state, deps);

    const stdout = getCapturedStdout();
    expect(stdout).toContain(`[iter 1/${maxIterations}] starting spec-review`);
  });
});

// TC-L02: verification iteration emits [iter 1/M] starting verification (bug-fix)
describe("TC-L02: verification iter start uses currentStep name", () => {
  it("emits [iter 1/3] starting verification when verification is entered", async () => {
    const maxIterations = 3;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const verificationResult = makeStateWithVerdict(state, "verification", "passed", 1);

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "verification") return verificationResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([
        ["verification", {
          kind: "cli",
          name: "verification",
          run: async () => {},
          resultFilePath: () => "/tmp/verification-result.md",
          parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
        }],
      ]),
      transitions: [
        { step: "verification", on: "passed", to: "end" },
        { step: "verification", on: "failed", to: "escalate" },
        { step: "verification", on: "escalation", to: "escalate" },
      ],
      maxIterations,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review", "verification", "code-review"],
    });

    await pipeline.run("verification", state, deps);

    const stdout = getCapturedStdout();
    expect(stdout).toContain(`[iter 1/${maxIterations}] starting verification`);
  });
});

// TC-L03: code-review iteration emits [iter 1/M] starting code-review (bug-fix)
describe("TC-L03: code-review iter start uses currentStep name", () => {
  it("emits [iter 1/3] starting code-review when code-review is entered", async () => {
    const maxIterations = 3;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const codeReviewResult = makeStateWithVerdict(state, "code-review", "approved", 1);

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "code-review") return codeReviewResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([["code-review", makeAgentStep("code-review")]]),
      transitions: [
        { step: "code-review", on: "approved", to: "end" },
        { step: "code-review", on: "needs-fix", to: "code-fixer" },
        { step: "code-review", on: "escalation", to: "escalate" },
      ],
      maxIterations,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review", "verification", "code-review"],
    });

    await pipeline.run("code-review", state, deps);

    const stdout = getCapturedStdout();
    expect(stdout).toContain(`[iter 1/${maxIterations}] starting code-review`);
  });
});

// TC-L04: loopNames step verdict display uses currentStep name
describe("TC-L04: verdict display uses currentStep name for all loopNames steps", () => {
  it("emits 'spec-review verdict: approved → done' on approved terminal", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const specReviewResult = makeStateWithVerdict(state, "spec-review", "approved", 1);

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "spec-review") return specReviewResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([["spec-review", makeAgentStep("spec-review")]]),
      transitions: [
        { step: "spec-review", on: "approved", to: "end" },   // terminal → verdict line emitted
        { step: "spec-review", on: "needs-fix", to: "escalate" },
        { step: "spec-review", on: "escalation", to: "escalate" },
      ],
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review", "verification", "code-review"],
    });

    await pipeline.run("spec-review", state, deps);

    const stdout = getCapturedStdout();
    expect(stdout).toContain("spec-review verdict: approved → done");
  });

  it("emits 'spec-review verdict: needs-fix → spawning fixer' on needs-fix (non-terminal)", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const specReview1 = makeStateWithVerdict(state, "spec-review", "needs-fix", 1);
    const specReview2 = makeStateWithVerdict(specReview1, "spec-review", "approved", 2);
    let callCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "spec-review") {
        return callCount++ === 0 ? specReview1 : specReview2;
      }
      if (step.name === "spec-fixer") return state;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([
        ["spec-review", makeAgentStep("spec-review")],
        ["spec-fixer",  makeAgentStep("spec-fixer", "approved")],
      ]),
      transitions: [
        { step: "spec-review", on: "approved",   to: "end" },
        { step: "spec-review", on: "needs-fix",  to: "spec-fixer" },
        { step: "spec-review", on: "escalation", to: "escalate" },
        { step: "spec-fixer",  on: "approved",   to: "spec-review" },
        { step: "spec-fixer",  on: "error",      to: "escalate" },
      ],
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review", "verification", "code-review"],
      loopFixerPairs: { "spec-review": "spec-fixer" },
    });

    await pipeline.run("spec-review", state, deps);

    const stdout = getCapturedStdout();
    expect(stdout).toContain("spec-review verdict: needs-fix → spawning fixer");
  });

  // TC-A06: code-review escalation → halt
  it("emits 'code-review verdict: escalation → halt' when code-review returns escalation", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const codeReviewResult = makeStateWithVerdict(state, "code-review", "escalation", 1);

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "code-review") return codeReviewResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([["code-review", makeAgentStep("code-review")]]),
      transitions: [
        { step: "code-review", on: "approved",   to: "end" },
        { step: "code-review", on: "needs-fix",  to: "code-fixer" },
        { step: "code-review", on: "escalation", to: "escalate" },
      ],
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review", "verification", "code-review"],
    });

    await pipeline.run("code-review", state, deps);

    const stdout = getCapturedStdout();
    expect(stdout).toContain("code-review verdict: escalation → halt");
  });

  it("emits 'verification verdict: needs-fix → spawning fixer' using verification as currentStep", async () => {
    // Synthetic scenario: verification returns "needs-fix" verdict (not its normal "failed"),
    // to verify that the needs-fix stdout message uses currentStep not this.loopName.
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const verificationNeedsFix = makeStateWithVerdict(state, "verification", "needs-fix", 1);
    const verificationPassed = makeStateWithVerdict(verificationNeedsFix, "verification", "passed", 2);
    let callCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "verification") {
        return callCount++ === 0 ? verificationNeedsFix : verificationPassed;
      }
      if (step.name === "build-fixer") return state;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([
        ["verification", {
          kind: "cli",
          name: "verification",
          run: async () => {},
          resultFilePath: () => "/tmp/verification-result.md",
          parseResult: () => ({ verdict: "needs-fix" as const, findingsPath: null }),
        }],
        ["build-fixer", makeAgentStep("build-fixer", "success")],
      ]),
      transitions: [
        { step: "verification", on: "passed",    to: "end" },
        { step: "verification", on: "needs-fix", to: "build-fixer" },
        { step: "verification", on: "failed",    to: "escalate" },
        { step: "build-fixer",  on: "success",   to: "verification" },
        { step: "build-fixer",  on: "error",     to: "escalate" },
      ],
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review", "verification", "code-review"],
      loopFixerPairs: { "verification": "build-fixer" },
    });

    await pipeline.run("verification", state, deps);

    const stdout = getCapturedStdout();
    // Bug-fix: should say "verification" not "spec-review" (old loopName)
    expect(stdout).toContain("verification verdict: needs-fix → spawning fixer");
    expect(stdout).not.toContain("spec-review verdict: needs-fix → spawning fixer");
  });
});

// TC-C02: fixer exhaustion stdout uses review name not fixer name (L330 path)
describe("TC-C02: fixer exhaustion stdout uses review name not fixer name (L330 path)", () => {
  it("emits 'retries exhausted on spec-review' (not 'spec-fixer') when fixer iterations are exhausted", async () => {
    // Scenario: spec-review always needs-fix → spec-fixer always approved.
    // After maxIterations review+fixer cycles, the fixer exhaustion path (L330) fires.
    // stdout must say "retries exhausted on spec-review" (the review name),
    // NOT "retries exhausted on spec-fixer" (the fixer name). This validates that
    // exhaustedLoopName is derived from loopFixerPairs lookup, not from nextStep directly.
    const maxIterations = 2;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let specReviewCallCount = 0;
    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "spec-review") {
        specReviewCallCount++;
        // Each call returns a state with needs-fix verdict recorded
        return makeStateWithVerdict(state, "spec-review", "needs-fix", specReviewCallCount);
      }
      if (step.name === "spec-fixer") {
        // Returns state unchanged — getStepOutcome falls through to completionVerdict="approved"
        return state;
      }
      throw new Error(`Unexpected step: ${step.name}`);
    });

    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([
        ["spec-review", makeAgentStep("spec-review")],
        ["spec-fixer",  makeAgentStep("spec-fixer", "approved")],
      ]),
      transitions: [
        { step: "spec-review", on: "approved",   to: "end" },
        { step: "spec-review", on: "needs-fix",  to: "spec-fixer" },
        { step: "spec-review", on: "escalation", to: "escalate" },
        { step: "spec-fixer",  on: "approved",   to: "spec-review" },
        { step: "spec-fixer",  on: "error",      to: "escalate" },
      ],
      maxIterations,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review", "verification", "code-review"],
      loopFixerPairs: { "spec-review": "spec-fixer" },
    });

    await pipeline.run("spec-review", state, deps);

    const stdout = getCapturedStdout();
    // L330 path: fixer exhausted → exhaustedLoopName = "spec-review" (the paired review)
    expect(stdout).toContain("retries exhausted on spec-review");
    // Must NOT use the fixer name
    expect(stdout).not.toContain("retries exhausted on spec-fixer");
  });
});

// TC-L05: TC-068 regression guard
// TC-068 in tests/core/pipeline/pipeline.test.ts asserts "[iter 1/3] starting spec-review".
// This test verifies the same invariant in the new test file to act as a cross-check.
// The canonical TC-068 remains in pipeline.test.ts and passes via `bun run test`.
describe("TC-L05: TC-068 regression guard — spec-review iter start preserved", () => {
  it("[iter 1/3] starting spec-review is still emitted after loopNames bug-fix", async () => {
    // This mirrors TC-068 behavior: spec-review is in loopNames and its iter start is preserved.
    const maxIterations = 3;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const specReviewResult = makeStateWithVerdict(state, "spec-review", "approved", 1);

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "spec-review") return specReviewResult;
      throw new Error(`Unexpected step: ${step.name}`);
    });
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: new Map([["spec-review", makeAgentStep("spec-review")]]),
      transitions: [
        { step: "spec-review", on: "approved",   to: "end" },
        { step: "spec-review", on: "needs-fix",  to: "spec-review" },
        { step: "spec-review", on: "escalation", to: "escalate" },
      ],
      maxIterations,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: ["spec-review", "verification", "code-review"],
    });

    await pipeline.run("spec-review", state, deps);

    const stdout = getCapturedStdout();
    expect(stdout).toContain(`[iter 1/${maxIterations}] starting spec-review`);
  });
});
