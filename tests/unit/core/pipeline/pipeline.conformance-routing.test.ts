/**
 * Pipeline conformance routing tests (T-11)
 *
 * TC-CONFRT-01: conformance needs-fix:implementer → implementer
 * TC-CONFRT-02: conformance needs-fix:code-fixer → code-fixer
 * TC-CONFRT-03: conformance needs-fix:spec-fixer → spec-fixer
 * TC-CONFRT-04: conformance needs-fix (plain/legacy) → implementer (backward compat)
 * TC-CONFRT-05: 3 directions — CONFORMANCE_RETRIES_EXHAUSTED halts after maxIterations
 * TC-CONFRT-06: conformance → code-fixer fixer budget resets (no immediate exhaust)
 * TC-CONFRT-07: conformance → spec-fixer fixer budget resets (no immediate exhaust)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Pipeline } from "../../../../src/core/pipeline/pipeline.js";
import { STANDARD_TRANSITIONS } from "../../../../src/core/pipeline/types.js";
import { STANDARD_LOOP_NAMES, STANDARD_LOOP_FIXER_PAIRS } from "../../../../src/core/pipeline/run.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import type { StepExecutor } from "../../../../src/core/step/executor.js";
import type { Step } from "../../../../src/core/step/types.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";
import type { PipelineDeps } from "../../../../src/core/types.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import { makeStoreFactory } from "../../../helpers/store-factory.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-conf-routing-test-"));
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
    jobId: "test-conf-routing-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "fix/test-branch",
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
    request: { type: "bug-fix", title: "Test", slug: "test-slug", baseBranch: "main", content: "content", adr: false },
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

function appendStepResult(state: JobState, stepName: string, verdict: string): JobState {
  const existing = state.steps?.[stepName] ?? [];
  const run: StepRun = {
    attempt: existing.length + 1,
    sessionId: null,
    outcome: {
      verdict: verdict as import("../../../../src/state/schema.js").Verdict,
      findingsPath: null,
      error: null,
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:00.000Z",
  };
  return {
    ...state,
    status: "running",
    steps: { ...state.steps, [stepName]: [...existing, run] },
  };
}

function makeAgentStep(name: string, completionVerdict?: string): Step {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name as import("../../../../src/state/schema.js").AgentStepName,
      model: "claude-sonnet-4-5",
      system: "",
      tools: [],
    },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    ...(completionVerdict !== undefined
      ? { completionVerdict: completionVerdict as import("../../../../src/state/schema.js").Verdict }
      : {}),
  };
}

function makeStandardSteps(): Map<string, Step> {
  return new Map<string, Step>([
    ["implementer",   makeAgentStep("implementer", "success")],
    ["verification",  {
      kind: "cli",
      name: "verification",
      run: async () => {},
      resultFilePath: () => "/tmp/verification-result.md",
      parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
    }],
    ["build-fixer",   makeAgentStep("build-fixer", "success")],
    ["code-review",   makeAgentStep("code-review")],
    ["code-fixer",    makeAgentStep("code-fixer", "approved")],
    ["spec-fixer",    makeAgentStep("spec-fixer", "approved")],
    ["spec-review",   makeAgentStep("spec-review")],
    ["test-case-gen",    makeAgentStep("test-case-gen", "success")],
    ["test-materialize", makeAgentStep("test-materialize", "success")],
    ["conformance",      makeAgentStep("conformance")],
    ["adr-gen",       makeAgentStep("adr-gen", "success")],
    ["pr-create",     {
      kind: "cli",
      name: "pr-create",
      run: async () => {},
      resultFilePath: () => "/tmp/pr-create-result.md",
      parseResult: () => ({ verdict: "success" as const, findingsPath: null }),
    }],
  ]);
}

function makePipeline(executeSpy: ReturnType<typeof vi.fn>, maxIterations = 3): Pipeline {
  return new Pipeline({
    steps: makeStandardSteps(),
    transitions: STANDARD_TRANSITIONS,
    maxIterations,
    executor: { execute: executeSpy } as unknown as StepExecutor,
    events: new EventBus(),
    loopName: "spec-review",
    loopNames: [...STANDARD_LOOP_NAMES],
    loopFixerPairs: { ...STANDARD_LOOP_FIXER_PAIRS },
  });
}

// ---------------------------------------------------------------------------
// TC-CONFRT-01: conformance needs-fix:implementer → implementer
// ---------------------------------------------------------------------------
describe("TC-CONFRT-01: conformance needs-fix:implementer → implementer", () => {
  it("routes to implementer when conformance verdict is needs-fix:implementer", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const stepsVisited: string[] = [];

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      stepsVisited.push(step.name);
      if (step.name === "implementer") return appendStepResult(currentState, "implementer", "success");
      if (step.name === "verification") return appendStepResult(currentState, "verification", "passed");
      if (step.name === "code-review") return appendStepResult(currentState, "code-review", "approved");
      if (step.name === "conformance") {
        if (stepsVisited.filter(n => n === "conformance").length === 1) {
          return appendStepResult(currentState, "conformance", "needs-fix:implementer");
        }
        return appendStepResult(currentState, "conformance", "approved");
      }
      if (step.name === "adr-gen") return appendStepResult(currentState, "adr-gen", "success");
      if (step.name === "pr-create") return appendStepResult(currentState, "pr-create", "success");
      throw new Error(`Unexpected step in TC-CONFRT-01: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy);
    const result = await pipeline.run("implementer", state, deps);

    // implementer must be visited twice (once initially, once via conformance routing)
    expect(stepsVisited.filter(n => n === "implementer")).toHaveLength(2);
    expect(result.status).toBe("awaiting-archive");
  });
});

// ---------------------------------------------------------------------------
// TC-CONFRT-02: conformance needs-fix:code-fixer → code-fixer
// ---------------------------------------------------------------------------
describe("TC-CONFRT-02: conformance needs-fix:code-fixer → code-fixer", () => {
  it("routes to code-fixer when conformance verdict is needs-fix:code-fixer", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const stepsVisited: string[] = [];
    let codeFixerCallCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      stepsVisited.push(step.name);
      if (step.name === "implementer") return appendStepResult(currentState, "implementer", "success");
      if (step.name === "verification") return appendStepResult(currentState, "verification", "passed");
      if (step.name === "code-review") return appendStepResult(currentState, "code-review", "approved");
      if (step.name === "code-fixer") {
        codeFixerCallCount++;
        return appendStepResult(currentState, "code-fixer", "approved");
      }
      if (step.name === "conformance") {
        if (stepsVisited.filter(n => n === "conformance").length === 1) {
          return appendStepResult(currentState, "conformance", "needs-fix:code-fixer");
        }
        return appendStepResult(currentState, "conformance", "approved");
      }
      if (step.name === "adr-gen") return appendStepResult(currentState, "adr-gen", "success");
      if (step.name === "pr-create") return appendStepResult(currentState, "pr-create", "success");
      throw new Error(`Unexpected step in TC-CONFRT-02: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy);
    const result = await pipeline.run("implementer", state, deps);

    // code-fixer must have been called via conformance routing
    expect(codeFixerCallCount).toBeGreaterThanOrEqual(1);
    expect(result.status).toBe("awaiting-archive");
  });
});

// ---------------------------------------------------------------------------
// TC-CONFRT-03: conformance needs-fix:spec-fixer → spec-fixer
// ---------------------------------------------------------------------------
describe("TC-CONFRT-03: conformance needs-fix:spec-fixer → spec-fixer", () => {
  it("routes to spec-fixer when conformance verdict is needs-fix:spec-fixer", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const stepsVisited: string[] = [];
    let specFixerCallCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      stepsVisited.push(step.name);
      if (step.name === "implementer") return appendStepResult(currentState, "implementer", "success");
      if (step.name === "verification") return appendStepResult(currentState, "verification", "passed");
      if (step.name === "code-review") return appendStepResult(currentState, "code-review", "approved");
      if (step.name === "test-case-gen") return appendStepResult(currentState, "test-case-gen", "success");
      if (step.name === "test-materialize") return appendStepResult(currentState, "test-materialize", "success");
      if (step.name === "spec-fixer") {
        specFixerCallCount++;
        return appendStepResult(currentState, "spec-fixer", "approved");
      }
      if (step.name === "spec-review") return appendStepResult(currentState, "spec-review", "approved");
      if (step.name === "conformance") {
        if (stepsVisited.filter(n => n === "conformance").length === 1) {
          return appendStepResult(currentState, "conformance", "needs-fix:spec-fixer");
        }
        return appendStepResult(currentState, "conformance", "approved");
      }
      if (step.name === "adr-gen") return appendStepResult(currentState, "adr-gen", "success");
      if (step.name === "pr-create") return appendStepResult(currentState, "pr-create", "success");
      throw new Error(`Unexpected step in TC-CONFRT-03: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy);
    const result = await pipeline.run("implementer", state, deps);

    // spec-fixer must have been called via conformance routing
    expect(specFixerCallCount).toBeGreaterThanOrEqual(1);
    expect(result.status).toBe("awaiting-archive");
  });
});

// ---------------------------------------------------------------------------
// TC-CONFRT-04: plain needs-fix (legacy) → implementer
// ---------------------------------------------------------------------------
describe("TC-CONFRT-04: conformance plain needs-fix → implementer (backward compat)", () => {
  it("routes to implementer when conformance verdict is plain needs-fix", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();
    const stepsVisited: string[] = [];

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      stepsVisited.push(step.name);
      if (step.name === "implementer") return appendStepResult(currentState, "implementer", "success");
      if (step.name === "verification") return appendStepResult(currentState, "verification", "passed");
      if (step.name === "code-review") return appendStepResult(currentState, "code-review", "approved");
      if (step.name === "conformance") {
        if (stepsVisited.filter(n => n === "conformance").length === 1) {
          return appendStepResult(currentState, "conformance", "needs-fix"); // plain legacy
        }
        return appendStepResult(currentState, "conformance", "approved");
      }
      if (step.name === "adr-gen") return appendStepResult(currentState, "adr-gen", "success");
      if (step.name === "pr-create") return appendStepResult(currentState, "pr-create", "success");
      throw new Error(`Unexpected step in TC-CONFRT-04: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy);
    const result = await pipeline.run("implementer", state, deps);

    // implementer must be visited twice (once initially, once via plain needs-fix routing)
    expect(stepsVisited.filter(n => n === "implementer")).toHaveLength(2);
    expect(result.status).toBe("awaiting-archive");
  });
});

// ---------------------------------------------------------------------------
// TC-CONFRT-05: CONFORMANCE_RETRIES_EXHAUSTED in all 3 directions
// ---------------------------------------------------------------------------
describe("TC-CONFRT-05: CONFORMANCE_RETRIES_EXHAUSTED fires for all routing directions", () => {
  it("via needs-fix:implementer — exhausts with CONFORMANCE_RETRIES_EXHAUSTED", async () => {
    const maxIterations = 2;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "implementer") return appendStepResult(currentState, "implementer", "success");
      if (step.name === "verification") return appendStepResult(currentState, "verification", "passed");
      if (step.name === "code-review") return appendStepResult(currentState, "code-review", "approved");
      if (step.name === "conformance") return appendStepResult(currentState, "conformance", "needs-fix:implementer");
      throw new Error(`Unexpected: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy, maxIterations);
    const result = await pipeline.run("implementer", state, deps);

    expect(result.error?.code).toBe("CONFORMANCE_RETRIES_EXHAUSTED");
    expect(result.error?.code).not.toBe("CODE_REVIEW_RETRIES_EXHAUSTED");
    expect(result.status).toBe("awaiting-resume");
  });

  it("via needs-fix:code-fixer — exhausts with CONFORMANCE_RETRIES_EXHAUSTED", async () => {
    const maxIterations = 2;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "implementer") return appendStepResult(currentState, "implementer", "success");
      if (step.name === "verification") return appendStepResult(currentState, "verification", "passed");
      if (step.name === "code-review") return appendStepResult(currentState, "code-review", "approved");
      if (step.name === "code-fixer") return appendStepResult(currentState, "code-fixer", "approved");
      if (step.name === "conformance") return appendStepResult(currentState, "conformance", "needs-fix:code-fixer");
      throw new Error(`Unexpected: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy, maxIterations);
    const result = await pipeline.run("implementer", state, deps);

    expect(result.error?.code).toBe("CONFORMANCE_RETRIES_EXHAUSTED");
    expect(result.error?.code).not.toBe("CODE_REVIEW_RETRIES_EXHAUSTED");
    expect(result.status).toBe("awaiting-resume");
  });

  it("via needs-fix:spec-fixer — exhausts with CONFORMANCE_RETRIES_EXHAUSTED", async () => {
    const maxIterations = 2;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "implementer") return appendStepResult(currentState, "implementer", "success");
      if (step.name === "verification") return appendStepResult(currentState, "verification", "passed");
      if (step.name === "code-review") return appendStepResult(currentState, "code-review", "approved");
      if (step.name === "test-case-gen") return appendStepResult(currentState, "test-case-gen", "success");
      if (step.name === "test-materialize") return appendStepResult(currentState, "test-materialize", "success");
      if (step.name === "spec-fixer") return appendStepResult(currentState, "spec-fixer", "approved");
      if (step.name === "spec-review") return appendStepResult(currentState, "spec-review", "approved");
      if (step.name === "conformance") return appendStepResult(currentState, "conformance", "needs-fix:spec-fixer");
      throw new Error(`Unexpected: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy, maxIterations);
    const result = await pipeline.run("implementer", state, deps);

    expect(result.error?.code).toBe("CONFORMANCE_RETRIES_EXHAUSTED");
    expect(result.error?.code).not.toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");
    expect(result.status).toBe("awaiting-resume");
  });
});

// ---------------------------------------------------------------------------
// TC-CONFRT-06: conformance → code-fixer episode reset (no immediate exhaust)
// ---------------------------------------------------------------------------
describe("TC-CONFRT-06: conformance → code-fixer budget resets (no immediate exhaust)", () => {
  it("code-fixer gets a fresh budget after conformance routing", async () => {
    const maxIterations = 2;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let codeFixerCallCount = 0;
    let codeReviewCallCount = 0;
    let conformanceCallCount = 0;

    // Sequence:
    // implementer → verification(pass) → code-review(needs-fix) → code-fixer#1
    // → code-review(needs-fix) → code-fixer#2 → code-review(bypass→approved)
    // → conformance(needs-fix:code-fixer) → code-fixer#3 (MUST get budget)
    // → code-review(approved) → conformance(approved) → adr-gen → pr-create → end
    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "implementer") return appendStepResult(currentState, "implementer", "success");
      if (step.name === "verification") return appendStepResult(currentState, "verification", "passed");
      if (step.name === "code-review") {
        codeReviewCallCount++;
        // First 2 calls: needs-fix; 3rd (bypass): approved; 4th (after conformance reset): approved
        if (codeReviewCallCount <= 2) return appendStepResult(currentState, "code-review", "needs-fix");
        return appendStepResult(currentState, "code-review", "approved");
      }
      if (step.name === "code-fixer") {
        codeFixerCallCount++;
        return appendStepResult(currentState, "code-fixer", "approved");
      }
      if (step.name === "conformance") {
        conformanceCallCount++;
        if (conformanceCallCount === 1) return appendStepResult(currentState, "conformance", "needs-fix:code-fixer");
        return appendStepResult(currentState, "conformance", "approved");
      }
      if (step.name === "adr-gen") return appendStepResult(currentState, "adr-gen", "success");
      if (step.name === "pr-create") return appendStepResult(currentState, "pr-create", "success");
      throw new Error(`Unexpected step in TC-CONFRT-06: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy, maxIterations);
    const result = await pipeline.run("implementer", state, deps);

    // code-fixer was called 3 times: 2 for code-review loop + 1 for conformance routing
    expect(codeFixerCallCount).toBe(3);
    // pipeline completes normally
    expect(result.status).toBe("awaiting-archive");
    expect(result.error?.code).not.toBe("CODE_REVIEW_RETRIES_EXHAUSTED");
  });
});

// ---------------------------------------------------------------------------
// TC-CONFRT-07: conformance → spec-fixer budget resets (no immediate exhaust)
// ---------------------------------------------------------------------------
describe("TC-CONFRT-07: conformance → spec-fixer budget resets (no immediate exhaust)", () => {
  it("spec-fixer gets a fresh budget after conformance routing", async () => {
    const maxIterations = 2;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let specFixerCallCount = 0;
    let specReviewCallCount = 0;
    let conformanceCallCount = 0;

    // Spec phase: spec-review(needs-fix) → spec-fixer#1 → spec-review(needs-fix, bypass)
    // → spec-fixer#2 → spec-review(approved via bypass) → … → conformance(needs-fix:spec-fixer)
    // → spec-fixer#3 (MUST get fresh budget)
    // → spec-review(approved) → … → conformance(approved) → end
    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "implementer") return appendStepResult(currentState, "implementer", "success");
      if (step.name === "verification") return appendStepResult(currentState, "verification", "passed");
      if (step.name === "code-review") return appendStepResult(currentState, "code-review", "approved");
      if (step.name === "spec-review") {
        specReviewCallCount++;
        // First 2 calls: needs-fix (to exhaust spec-fixer budget); 3rd: bypass; 4th+: approved
        if (specReviewCallCount <= 2) return appendStepResult(currentState, "spec-review", "needs-fix");
        return appendStepResult(currentState, "spec-review", "approved");
      }
      if (step.name === "spec-fixer") {
        specFixerCallCount++;
        return appendStepResult(currentState, "spec-fixer", "approved");
      }
      if (step.name === "test-case-gen") return appendStepResult(currentState, "test-case-gen", "success");
      if (step.name === "test-materialize") return appendStepResult(currentState, "test-materialize", "success");
      if (step.name === "implementer") return appendStepResult(currentState, "implementer", "success");
      if (step.name === "verification") return appendStepResult(currentState, "verification", "passed");
      if (step.name === "code-review") return appendStepResult(currentState, "code-review", "approved");
      if (step.name === "conformance") {
        conformanceCallCount++;
        if (conformanceCallCount === 1) return appendStepResult(currentState, "conformance", "needs-fix:spec-fixer");
        return appendStepResult(currentState, "conformance", "approved");
      }
      if (step.name === "adr-gen") return appendStepResult(currentState, "adr-gen", "success");
      if (step.name === "pr-create") return appendStepResult(currentState, "pr-create", "success");
      throw new Error(`Unexpected step in TC-CONFRT-07: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy, maxIterations);

    // Start from spec-review so spec-review budget exhausts before conformance
    const result = await pipeline.run("spec-review", state, deps);

    // spec-fixer was called 3 times: 2 for spec-review loop + 1 for conformance routing
    expect(specFixerCallCount).toBe(3);
    expect(result.status).toBe("awaiting-archive");
    expect(result.error?.code).not.toBe("SPEC_REVIEW_RETRIES_EXHAUSTED");
  });
});
