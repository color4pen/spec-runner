/**
 * Unit tests for guard-halt(awaiting-resume) terminal control exit in pipeline.ts.
 *
 * T-02 acceptance criteria:
 *   TC-GH-001: sequential guard-halt → pipeline breaks immediately, subsequent steps not run
 *   TC-GH-002: sequential guard-halt → returned state.status === "awaiting-resume"
 *   TC-GH-003: coordinator/round guard-halt (escalation) → subsequent step (conformance) not run
 *   TC-GH-004: coordinator/round guard-halt (escalation) → state.status === "awaiting-resume" (escalation terminal)
 *   TC-GH-005: escalation terminal (sequential failed step) → subsequent steps not run (regression)
 *   TC-GH-006: exhaustion terminal → subsequent steps not run (regression)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { Pipeline } from "../../../src/core/pipeline/pipeline.js";
import { CUSTOM_REVIEWERS_STEP_NAME } from "../../../src/core/pipeline/types.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../src/core/step/executor.js";
import type { Step } from "../../../src/core/step/types.js";
import type { JobState } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import type { ParallelReviewConfig } from "../../../src/core/pipeline/types.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-guard-halt-test-"));
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
    jobId: "guard-halt-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/test-branch",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeAwaitingResumeState(base: JobState, stepName: string): JobState {
  return {
    ...base,
    status: "awaiting-resume",
    resumePoint: {
      step: stepName,
      reason: "timeout: guard-halt",
      iterationsExhausted: 0,
    },
    error: {
      code: "STEP_TIMEOUT",
      message: "timeout: guard-halt",
      hint: "",
    },
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
    request: { type: "feature", title: "Test", slug: "guard-halt-test", baseBranch: "main", content: "content", adr: false },
    slug: "guard-halt-test",
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
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue([]),
      removeLabel: vi.fn().mockResolvedValue(undefined),
    },
    owner: "user",
    repo: "repo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
  };
}

/** Make a minimal agent step. */
function makeAgentStep(name: string, completionVerdict?: string): Step {
  return {
    kind: "agent",
    name,
    agent: { name: "test", role: name as import("../../../src/kernel/agent-definition.js").AgentStepName, model: "claude-sonnet-4-5", system: "", tools: [] },
    ...(completionVerdict !== undefined ? { completionVerdict: completionVerdict as import("../../../src/state/schema.js").Verdict } : {}),
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

// ---------------------------------------------------------------------------
// TC-GH-001 + TC-GH-002: sequential guard-halt → pipeline breaks, awaiting-resume
// ---------------------------------------------------------------------------
describe("TC-GH-001/002: sequential guard-halt → break immediately, awaiting-resume returned", () => {
  it("does NOT run verification when implementer guard-halts with awaiting-resume", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    // Persist initial state so the store can read/write it
    await deps.storeFactory(state.jobId).persist(state);

    const awaitingResumeState = makeAwaitingResumeState(state, "implementer");

    const implementerCallSpy = vi.fn();
    const verificationCallSpy = vi.fn();
    const conformanceCallSpy = vi.fn();

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "implementer") {
        implementerCallSpy();
        // Simulate guard-halt: throw with state.status="awaiting-resume" attached
        // (mirrors commitHalt → attachStateAndRethrow behavior)
        const err = Object.assign(new Error("timeout: guard-halt"), {
          state: awaitingResumeState,
        });
        throw err;
      }
      if (step.name === "verification") {
        verificationCallSpy();
        return { ...state, status: "running" as const };
      }
      if (step.name === "conformance") {
        conformanceCallSpy();
        return { ...state, status: "running" as const };
      }
      // Any other step: return running state
      return { ...state, status: "running" as const };
    });

    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;
    const events = new EventBus();

    // Minimal steps map with implementer, verification, conformance
    const steps = new Map<string, Step>([
      ["implementer",  makeAgentStep("implementer", "success")],
      ["verification", makeAgentStep("verification", "passed")],
      ["conformance",  makeAgentStep("conformance")],
    ]);

    // Minimal transition table: implementer → verification (on success), verification → end
    const transitions = [
      { step: "implementer",  on: "success", to: "verification" },
      { step: "implementer",  on: "error",   to: "escalate" },
      { step: "verification", on: "passed",  to: "end" },
      { step: "verification", on: "failed",  to: "escalate" },
    ];

    const pipeline = new Pipeline({
      steps,
      transitions,
      maxIterations: 3,
      executor: mockExecutor,
      events,
      loopName: "spec-review",
    });

    const result = await pipeline.run("implementer", state, deps);

    // TC-GH-001: verification was NOT called (guard-halt stopped the pipeline)
    expect(verificationCallSpy).not.toHaveBeenCalled();
    // TC-GH-001: conformance was NOT called
    expect(conformanceCallSpy).not.toHaveBeenCalled();
    // TC-GH-001: implementer was called exactly once
    expect(implementerCallSpy).toHaveBeenCalledTimes(1);

    // TC-GH-002: returned state is awaiting-resume
    expect(result.status).toBe("awaiting-resume");
    expect(result.resumePoint?.step).toBe("implementer");
  });

  it("does NOT run code-review or pr-create when design guard-halts", async () => {
    const state = makeMinimalState({ step: "design" });
    const deps = makeMinimalDeps();
    await deps.storeFactory(state.jobId).persist(state);

    const awaitingResumeState = makeAwaitingResumeState(state, "design");
    const codeReviewSpy = vi.fn();
    const prCreateSpy = vi.fn();

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "design") {
        const err = Object.assign(new Error("drift: guard-halt"), { state: awaitingResumeState });
        throw err;
      }
      if (step.name === "code-review") { codeReviewSpy(); return { ...state, status: "running" as const }; }
      if (step.name === "pr-create") { prCreateSpy(); return { ...state, status: "running" as const }; }
      return { ...state, status: "running" as const };
    });

    const steps = new Map<string, Step>([
      ["design",      makeAgentStep("design", "success")],
      ["code-review", makeAgentStep("code-review")],
      ["pr-create",   makeAgentStep("pr-create", "success")],
    ]);
    const transitions = [
      { step: "design",      on: "success", to: "code-review" },
      { step: "design",      on: "error",   to: "escalate" },
      { step: "code-review", on: "approved", to: "pr-create" },
      { step: "pr-create",   on: "success", to: "end" },
    ];

    const pipeline = new Pipeline({
      steps,
      transitions,
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events: new EventBus(),
      loopName: "spec-review",
    });

    const result = await pipeline.run("design", state, deps);

    expect(codeReviewSpy).not.toHaveBeenCalled();
    expect(prCreateSpy).not.toHaveBeenCalled();
    expect(result.status).toBe("awaiting-resume");
  });
});

// ---------------------------------------------------------------------------
// TC-GH-003 + TC-GH-004: coordinator/round guard-halt (escalation) → conformance not run, awaiting-resume
// ---------------------------------------------------------------------------
describe("TC-GH-003/004: coordinator/round guard-halt via escalation terminal → conformance not run, awaiting-resume", () => {
  it("does NOT run conformance when coordinator round returns escalation from guard-halt member", async () => {
    const state = makeMinimalState({ step: "implementer" });
    const deps = makeMinimalDeps();
    await deps.storeFactory(state.jobId).persist(state);

    const conformanceSpy = vi.fn();

    // The coordinator is virtual — NOT in the steps map.
    // When a member's produceResult returns a halt, verdictOfResult → "escalation",
    // aggregateVerdict(["escalation"]) → "escalation", coordinator outcome = "escalation".
    // Pipeline's escalation terminal then transitions state → awaiting-resume.
    //
    // Mock executor.produceResult to return a halt (guard-halt simulated).
    const produceSpy = vi.fn().mockResolvedValue({
      kind: "halt" as const,
      halt: {
        kind: "awaiting-resume" as const,
        error: { code: "STEP_TIMEOUT", message: "timeout", hint: "" },
        thrownErr: new Error("timeout"),
        resumePoint: { step: "reviewer1", reason: "timeout", iterationsExhausted: 0 },
        interruption: { type: "interruption" as const, reason: "timeout" as const },
        recordOpts: {},
      },
    });

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "conformance") {
        conformanceSpy();
        return { ...state, status: "running" as const };
      }
      return { ...state, status: "running" as const };
    });

    const mockExecutor = {
      execute: executeSpy,
      produceResult: produceSpy,
    } as unknown as StepExecutor;

    const coordinatorName = CUSTOM_REVIEWERS_STEP_NAME;
    const memberName = "reviewer1";

    const steps = new Map<string, Step>([
      [memberName,    makeAgentStep(memberName)],
      ["conformance", makeAgentStep("conformance")],
    ]);

    // Minimal coordinator-aware transitions
    const transitions = [
      { step: coordinatorName, on: "approved",   to: "conformance" },
      { step: coordinatorName, on: "needs-fix",  to: "escalate" },
      { step: coordinatorName, on: "escalation", to: "escalate" },
      { step: "conformance",   on: "approved",   to: "end" },
      { step: "conformance",   on: "needs-fix",  to: "escalate" },
    ];

    const parallelReview: ParallelReviewConfig = {
      coordinator: coordinatorName,
      members: [memberName],
    };

    const events = new EventBus();
    const pipeline = new Pipeline({
      steps,
      transitions,
      maxIterations: 3,
      executor: mockExecutor,
      events,
      loopName: "spec-review",
      loopNames: [coordinatorName],
      loopFixerPairs: {},
      parallelReview,
    });

    const result = await pipeline.run(coordinatorName, state, deps);

    // TC-GH-003: conformance was NOT called (escalation terminal stops the pipeline)
    expect(conformanceSpy).not.toHaveBeenCalled();
    // TC-GH-004: state is awaiting-resume (via escalation terminal)
    expect(result.status).toBe("awaiting-resume");
  });
});

// ---------------------------------------------------------------------------
// TC-GH-005: escalation terminal regression — failed step escalates correctly
// ---------------------------------------------------------------------------
describe("TC-GH-005: escalation terminal regression — sequential step failure stops pipeline", () => {
  it("does NOT run verification when implementer fails (state.status=failed), transitions to awaiting-resume", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    await deps.storeFactory(state.jobId).persist(state);

    const failedState: JobState = {
      ...state,
      status: "failed",
      error: { code: "SESSION_TERMINATED", message: "terminated", hint: "" },
    };

    const verificationSpy = vi.fn();

    const executeSpy = vi.fn().mockImplementation(async (step: Step) => {
      if (step.name === "implementer") return failedState;
      if (step.name === "verification") {
        verificationSpy();
        return { ...state, status: "running" as const };
      }
      return { ...state, status: "running" as const };
    });

    const steps = new Map<string, Step>([
      ["implementer",  makeAgentStep("implementer", "success")],
      ["verification", makeAgentStep("verification", "passed")],
    ]);
    const transitions = [
      { step: "implementer",  on: "success", to: "verification" },
      { step: "implementer",  on: "error",   to: "escalate" },
      { step: "verification", on: "passed",  to: "end" },
    ];

    const pipeline = new Pipeline({
      steps,
      transitions,
      maxIterations: 3,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events: new EventBus(),
      loopName: "spec-review",
    });

    const result = await pipeline.run("implementer", state, deps);

    expect(verificationSpy).not.toHaveBeenCalled();
    // failed → non-fatal error → escalation terminal → awaiting-resume
    expect(result.status).toBe("awaiting-resume");
  });
});

// ---------------------------------------------------------------------------
// TC-GH-006: exhaustion terminal regression — loop exhaustion stops pipeline
// ---------------------------------------------------------------------------
describe("TC-GH-006: exhaustion terminal regression — loop exhaustion stops pipeline", () => {
  it("does NOT run downstream steps after loop exhaustion", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    await deps.storeFactory(state.jobId).persist(state);

    const downstreamSpy = vi.fn();
    let iter = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "spec-review") {
        iter++;
        return {
          ...currentState,
          status: "running" as const,
          steps: {
            ...currentState.steps,
            "spec-review": [
              ...(currentState.steps?.["spec-review"] ?? []),
              {
                attempt: iter,
                sessionId: null,
                outcome: { verdict: "needs-fix" as const, findingsPath: null, error: null },
                startedAt: "2026-01-01",
                endedAt: "2026-01-01",
              },
            ],
          },
        };
      }
      if (step.name === "spec-fixer") return { ...currentState, status: "running" as const };
      if (step.name === "downstream") {
        downstreamSpy();
        return { ...currentState, status: "running" as const };
      }
      return { ...currentState, status: "running" as const };
    });

    const steps = new Map<string, Step>([
      ["spec-review",  makeAgentStep("spec-review")],
      ["spec-fixer",   makeAgentStep("spec-fixer")],
      ["downstream",   makeAgentStep("downstream", "success")],
    ]);
    const transitions = [
      { step: "spec-review",  on: "needs-fix",  to: "spec-fixer" },
      { step: "spec-review",  on: "approved",   to: "downstream" },
      { step: "spec-review",  on: "error",      to: "escalate" },
      { step: "spec-fixer",   on: "approved",   to: "spec-review" },
      { step: "spec-fixer",   on: "error",      to: "escalate" },
      { step: "downstream",   on: "success",    to: "end" },
    ];

    const pipeline = new Pipeline({
      steps,
      transitions,
      maxIterations: 2,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events: new EventBus(),
      loopName: "spec-review",
      loopNames: ["spec-review"],
      loopFixerPairs: { "spec-review": "spec-fixer" },
    });

    const result = await pipeline.run("spec-review", state, deps);

    // Downstream was NOT called (loop exhaustion terminated the pipeline)
    expect(downstreamSpy).not.toHaveBeenCalled();
    // State is awaiting-resume (exhaustion → awaiting-resume)
    expect(result.status).toBe("awaiting-resume");
  });
});
