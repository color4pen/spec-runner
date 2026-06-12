/**
 * Pipeline episode-reset regression tests.
 *
 * TC-070: Conformance re-entry gives verification a fresh convergence budget
 *         (regression for observed bug: loop-iteration-budget-reset)
 * TC-071: Conformance (no paired fixer) retains lifetime counter and exhausts at maxIterations
 *         (termination guarantee: episode reset does NOT apply to conformance)
 * TC-072: Single-episode exhaustion within a fixer-pair loop is unchanged
 *         (within-episode budget continuity)
 * TC-073: Shared-fixer forward entry gives the next reviewer a fresh fixer budget
 *         (regression: code-fixer iterations consumed by reviewer N leaked into
 *          reviewer N+1's episode when the chain advanced via the fixer forward row)
 * TC-074: Same-reviewer fallback returns keep the fixer counter (no reset within
 *         one reviewer's episode — termination guarantee for the reviewer loop)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Pipeline } from "../../../../src/core/pipeline/pipeline.js";
import { STANDARD_TRANSITIONS } from "../../../../src/core/pipeline/types.js";
import { buildReviewerChainTransitions } from "../../../../src/core/pipeline/reviewer-chain.js";
import { STANDARD_LOOP_NAMES, STANDARD_LOOP_FIXER_PAIRS } from "../../../../src/core/pipeline/run.js";
import { EventBus } from "../../../../src/core/event/event-bus.js";
import { StepExecutor } from "../../../../src/core/step/executor.js";
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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-episode-reset-test-"));
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
    jobId: "test-episode-reset-job",
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

/** Append a StepRun with the given verdict to state.steps[stepName]. */
function appendStepResult(
  state: JobState,
  stepName: string,
  verdict: string,
  fixableFindings = 0,
): JobState {
  const existing = state.steps?.[stepName] ?? [];
  const findings = Array.from({ length: fixableFindings }, (_, i) => ({
    id: `F-${i + 1}`,
    title: `finding ${i + 1}`,
    severity: "medium",
    resolution: "fixable",
    refs: [],
  }));
  const run: StepRun = {
    attempt: existing.length + 1,
    sessionId: null,
    outcome: {
      verdict: verdict as import("../../../../src/state/schema.js").Verdict,
      findingsPath: null,
      error: null,
      ...(fixableFindings > 0
        ? { toolResult: { ok: true, verdict, findings } as unknown as StepRun["outcome"]["toolResult"] }
        : {}),
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

function makeAgentStep(
  name: string,
  completionVerdict?: string,
): Step {
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

// ---------------------------------------------------------------------------
// TC-070: Conformance re-entry gives verification a fresh convergence budget
// Observed bug: implementer→verification episode 1 depleted verification's
// loopIters + fixerIters[build-fixer]. conformance(needs-fix)→implementer→
// verification reentry had zero budget left and immediately exhausted.
// ---------------------------------------------------------------------------
describe("TC-070: conformance re-entry gives verification fresh budget (regression)", () => {
  it("build-fixer is invoked 3 times: 2 in episode 1, 1 in re-entry episode 2", async () => {
    const maxIterations = 2;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let verificationCallCount = 0;
    let buildFixerCallCount = 0;
    let conformanceCallCount = 0;

    // driver sequence (call-count indexed)
    // episode 1: verification(fail) → build-fixer(ok) → verification(fail) → build-fixer(ok) → verification(pass/bypass)
    // → code-review(approved) → conformance(needs-fix)
    // → implementer(2nd) → verification(fail, reentry) → build-fixer(ok, 3rd) → verification(pass)
    // → code-review(approved) → conformance(approved) → adr-gen → pr-create → end
    const verificationVerdicts = ["failed", "failed", "passed", "failed", "passed"] as const;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "implementer") {
        return appendStepResult(currentState, "implementer", "success");
      }
      if (step.name === "verification") {
        const verdict = verificationVerdicts[verificationCallCount] ?? "passed";
        verificationCallCount++;
        return appendStepResult(currentState, "verification", verdict);
      }
      if (step.name === "build-fixer") {
        buildFixerCallCount++;
        return appendStepResult(currentState, "build-fixer", "success");
      }
      if (step.name === "code-review") {
        // approved with no fixable findings → routes to conformance (not code-fixer)
        return appendStepResult(currentState, "code-review", "approved");
      }
      if (step.name === "code-fixer") {
        return appendStepResult(currentState, "code-fixer", "approved");
      }
      if (step.name === "conformance") {
        conformanceCallCount++;
        const verdict = conformanceCallCount === 1 ? "needs-fix" : "approved";
        return appendStepResult(currentState, "conformance", verdict);
      }
      if (step.name === "adr-gen") {
        return appendStepResult(currentState, "adr-gen", "success");
      }
      if (step.name === "pr-create") {
        return appendStepResult(currentState, "pr-create", "success");
      }
      throw new Error(`Unexpected step in TC-070: ${step.name}`);
    });

    const steps = new Map<string, Step>([
      ["implementer",  makeAgentStep("implementer", "success")],
      ["verification", {
        kind: "cli",
        name: "verification",
        run: async () => {},
        resultFilePath: () => "/tmp/verification-result.md",
        parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
      }],
      ["build-fixer",  makeAgentStep("build-fixer", "success")],
      ["code-review",  makeAgentStep("code-review")],
      ["code-fixer",   makeAgentStep("code-fixer", "approved")],
      ["conformance",  makeAgentStep("conformance")],
      ["adr-gen",      makeAgentStep("adr-gen", "success")],
      ["pr-create",    {
        kind: "cli",
        name: "pr-create",
        run: async () => {},
        resultFilePath: () => "/tmp/pr-create-result.md",
        parseResult: () => ({ verdict: "success" as const, findingsPath: null }),
      }],
    ]);

    const events = new EventBus();
    const pipeline = new Pipeline({
      steps,
      transitions: STANDARD_TRANSITIONS,
      maxIterations,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: [...STANDARD_LOOP_NAMES],
      loopFixerPairs: { ...STANDARD_LOOP_FIXER_PAIRS },
    });

    const result = await pipeline.run("implementer", state, deps);

    // build-fixer must be invoked in re-entry episode (3rd call), not skipped
    expect(buildFixerCallCount).toBe(3);
    // pipeline completes normally — not escalated
    expect(result.status).toBe("awaiting-archive");
    // no verification exhaustion error
    expect(result.error?.code).not.toBe("VERIFICATION_RETRIES_EXHAUSTED");
  });
});

// ---------------------------------------------------------------------------
// TC-071: Conformance retains its lifetime counter and exhausts at maxIterations
// Ensures the episode-reset logic does NOT apply to conformance (which has no
// paired fixer), preserving the termination guarantee for the outer impl loop.
// ---------------------------------------------------------------------------
describe("TC-071: conformance lifetime counter bounds impl-phase re-execution", () => {
  it("escalates with CONFORMANCE_RETRIES_EXHAUSTED after exactly maxIterations conformance calls", async () => {
    const maxIterations = 2;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let conformanceCallCount = 0;

    // verification always passes, code-review always approves (no fixable),
    // conformance always needs-fix → should exhaust after maxIterations
    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "implementer") {
        return appendStepResult(currentState, "implementer", "success");
      }
      if (step.name === "verification") {
        return appendStepResult(currentState, "verification", "passed");
      }
      if (step.name === "code-review") {
        return appendStepResult(currentState, "code-review", "approved");
      }
      if (step.name === "conformance") {
        conformanceCallCount++;
        return appendStepResult(currentState, "conformance", "needs-fix");
      }
      throw new Error(`Unexpected step in TC-071: ${step.name}`);
    });

    const steps = new Map<string, Step>([
      ["implementer",  makeAgentStep("implementer", "success")],
      ["verification", {
        kind: "cli",
        name: "verification",
        run: async () => {},
        resultFilePath: () => "/tmp/verification-result.md",
        parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
      }],
      ["build-fixer",  makeAgentStep("build-fixer", "success")],
      ["code-review",  makeAgentStep("code-review")],
      ["code-fixer",   makeAgentStep("code-fixer", "approved")],
      ["conformance",  makeAgentStep("conformance")],
      ["adr-gen",      makeAgentStep("adr-gen", "success")],
      ["pr-create",    {
        kind: "cli",
        name: "pr-create",
        run: async () => {},
        resultFilePath: () => "/tmp/pr-create-result.md",
        parseResult: () => ({ verdict: "success" as const, findingsPath: null }),
      }],
    ]);

    const events = new EventBus();
    const pipeline = new Pipeline({
      steps,
      transitions: STANDARD_TRANSITIONS,
      maxIterations,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: [...STANDARD_LOOP_NAMES],
      loopFixerPairs: { ...STANDARD_LOOP_FIXER_PAIRS },
    });

    const result = await pipeline.run("implementer", state, deps);

    // conformance lifetime counter exhausts at exactly maxIterations
    expect(result.error?.code).toBe("CONFORMANCE_RETRIES_EXHAUSTED");
    expect(result.status).toBe("awaiting-resume");
    // conformance called exactly maxIterations times — no infinite loop
    expect(conformanceCallCount).toBe(maxIterations);
  });
});

// ---------------------------------------------------------------------------
// TC-072: Single-episode exhaustion within a fixer-pair loop is unchanged
// Verifies that within one convergence episode (no re-entry), verification's
// iteration counter still accumulates and triggers exhaustion at maxIterations.
// ---------------------------------------------------------------------------
describe("TC-072: single-episode exhaustion within verification loop is unchanged", () => {
  it("escalates with VERIFICATION_RETRIES_EXHAUSTED after the expected number of fixer cycles", async () => {
    const maxIterations = 2;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let verificationCallCount = 0;
    let buildFixerCallCount = 0;

    // implementer succeeds once; verification always fails; build-fixer always succeeds
    // Expected: verification(iter1,fail) → build-fixer(iter1) → verification(iter2,fail)
    //           → build-fixer(iter2) → verification(bypass,fail) → fixer-exhausted → escalate
    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "implementer") {
        return appendStepResult(currentState, "implementer", "success");
      }
      if (step.name === "verification") {
        verificationCallCount++;
        return appendStepResult(currentState, "verification", "failed");
      }
      if (step.name === "build-fixer") {
        buildFixerCallCount++;
        // build-fixer returns success but verification will fail again next iteration
        return appendStepResult(currentState, "build-fixer", "success");
      }
      throw new Error(`Unexpected step in TC-072: ${step.name}`);
    });

    const steps = new Map<string, Step>([
      ["implementer",  makeAgentStep("implementer", "success")],
      ["verification", {
        kind: "cli",
        name: "verification",
        run: async () => {},
        resultFilePath: () => "/tmp/verification-result.md",
        parseResult: () => ({ verdict: "failed" as const, findingsPath: null }),
      }],
      ["build-fixer",  makeAgentStep("build-fixer", "success")],
    ]);

    const events = new EventBus();
    const pipeline = new Pipeline({
      steps,
      transitions: STANDARD_TRANSITIONS,
      maxIterations,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: [...STANDARD_LOOP_NAMES],
      loopFixerPairs: { ...STANDARD_LOOP_FIXER_PAIRS },
    });

    const result = await pipeline.run("implementer", state, deps);

    // single-episode exhaustion: verification called 3 times (iter1, iter2, bypass),
    // build-fixer called 2 times (at max), then fixer-entry-guard fires
    expect(result.error?.code).toBe("VERIFICATION_RETRIES_EXHAUSTED");
    expect(result.status).toBe("awaiting-resume");
    expect(verificationCallCount).toBe(3);   // iter1 + iter2 + bypass
    expect(buildFixerCallCount).toBe(2);     // fixer exhausted at maxIterations
  });
});

// ---------------------------------------------------------------------------
// Shared helpers for the custom-reviewer chain tests (TC-073 / TC-074).
// Chain: code-review → sec (one custom reviewer sharing code-fixer).
// ---------------------------------------------------------------------------
const SEC_CHAIN = ["code-review", "sec"];

function makeChainPipelineParams() {
  const transitions = [
    ...STANDARD_TRANSITIONS.filter((t) => t.step !== "code-review" && t.step !== "code-fixer"),
    ...buildReviewerChainTransitions(SEC_CHAIN),
  ];
  return {
    transitions,
    loopNames: [...STANDARD_LOOP_NAMES, "sec"],
    loopFixerPairs: { ...STANDARD_LOOP_FIXER_PAIRS, sec: "code-fixer" },
    maxIterationsByStep: { sec: 2 },
  };
}

function makeChainSteps(): Map<string, Step> {
  return new Map<string, Step>([
    ["implementer",  makeAgentStep("implementer", "success")],
    ["verification", {
      kind: "cli",
      name: "verification",
      run: async () => {},
      resultFilePath: () => "/tmp/verification-result.md",
      parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
    }],
    ["build-fixer",  makeAgentStep("build-fixer", "success")],
    ["code-review",  makeAgentStep("code-review")],
    ["code-fixer",   makeAgentStep("code-fixer", "approved")],
    ["sec",          makeAgentStep("sec")],
    ["conformance",  makeAgentStep("conformance")],
    ["adr-gen",      makeAgentStep("adr-gen", "success")],
    ["pr-create",    {
      kind: "cli",
      name: "pr-create",
      run: async () => {},
      resultFilePath: () => "/tmp/pr-create-result.md",
      parseResult: () => ({ verdict: "success" as const, findingsPath: null }),
    }],
  ]);
}

// ---------------------------------------------------------------------------
// TC-073: Shared-fixer forward entry gives the next reviewer a fresh fixer budget
// Regression: code-review consumed the shared code-fixer's full budget
// (needs-fix cycle + approved-with-fixable-findings observation fix), then the
// forward row advanced the chain to sec FROM code-fixer. The episode reset
// only fired for non-fixer entries, so sec inherited fixerIters=2 and its very
// first needs-fix exhausted immediately — escalation attributed to sec although
// sec's fixer never ran.
// ---------------------------------------------------------------------------
describe("TC-073: shared-fixer forward entry resets the next reviewer's fixer budget (regression)", () => {
  it("sec's needs-fix gets a fixer run after code-review consumed the shared budget", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let codeReviewCallCount = 0;
    let secCallCount = 0;
    let codeFixerCallCount = 0;

    // Sequence:
    //   code-review#1 needs-fix → code-fixer#1 → code-review#2 approved + fixable
    //   → code-fixer#2 (observation fix) → forward to sec
    //   sec#1 needs-fix → code-fixer#3 (MUST run: fresh episode) → sec#2 approved
    //   → conformance → adr-gen → pr-create → end
    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "implementer") return appendStepResult(currentState, "implementer", "success");
      if (step.name === "verification") return appendStepResult(currentState, "verification", "passed");
      if (step.name === "code-review") {
        codeReviewCallCount++;
        if (codeReviewCallCount === 1) return appendStepResult(currentState, "code-review", "needs-fix");
        return appendStepResult(currentState, "code-review", "approved", 1); // fixable finding
      }
      if (step.name === "sec") {
        secCallCount++;
        if (secCallCount === 1) return appendStepResult(currentState, "sec", "needs-fix");
        return appendStepResult(currentState, "sec", "approved");
      }
      if (step.name === "code-fixer") {
        codeFixerCallCount++;
        return appendStepResult(currentState, "code-fixer", "approved");
      }
      if (step.name === "conformance") return appendStepResult(currentState, "conformance", "approved");
      if (step.name === "adr-gen") return appendStepResult(currentState, "adr-gen", "success");
      if (step.name === "pr-create") return appendStepResult(currentState, "pr-create", "success");
      throw new Error(`Unexpected step in TC-073: ${step.name}`);
    });

    const chainParams = makeChainPipelineParams();
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: makeChainSteps(),
      transitions: chainParams.transitions,
      maxIterations: 2,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: chainParams.loopNames,
      loopFixerPairs: chainParams.loopFixerPairs,
      maxIterationsByStep: chainParams.maxIterationsByStep,
    });

    const result = await pipeline.run("implementer", state, deps);

    // sec's episode must get its own fixer run (3rd overall), not inherit
    // code-review's consumed budget and exhaust on entry.
    expect(codeFixerCallCount).toBe(3);
    expect(secCallCount).toBe(2);
    expect(result.error?.code).not.toBe("SEC_RETRIES_EXHAUSTED");
    expect(result.status).toBe("awaiting-archive");
  });
});

// ---------------------------------------------------------------------------
// TC-074: Same-reviewer fallback returns keep the fixer counter
// The widened reset condition (TC-073) must NOT reset when the fixer returns
// to the SAME reviewer (normal convergence loop) — otherwise the reviewer loop
// would never exhaust. sec alone repeatedly needs-fix: budget must run out at
// exactly maxIterationsByStep.sec fixer cycles.
// ---------------------------------------------------------------------------
describe("TC-074: same-reviewer fixer returns keep the counter (termination guarantee)", () => {
  it("sec exhausts after exactly its per-reviewer budget of fixer cycles", async () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let secCallCount = 0;
    let codeFixerCallCount = 0;

    // code-review approves cleanly (no findings) → sec entered from code-review.
    // sec always needs-fix; code-fixer always approves → must exhaust, not loop.
    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "implementer") return appendStepResult(currentState, "implementer", "success");
      if (step.name === "verification") return appendStepResult(currentState, "verification", "passed");
      if (step.name === "code-review") return appendStepResult(currentState, "code-review", "approved");
      if (step.name === "sec") {
        secCallCount++;
        return appendStepResult(currentState, "sec", "needs-fix");
      }
      if (step.name === "code-fixer") {
        codeFixerCallCount++;
        return appendStepResult(currentState, "code-fixer", "approved");
      }
      throw new Error(`Unexpected step in TC-074: ${step.name}`);
    });

    const chainParams = makeChainPipelineParams();
    const events = new EventBus();
    const pipeline = new Pipeline({
      steps: makeChainSteps(),
      transitions: chainParams.transitions,
      maxIterations: 2,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "spec-review",
      loopNames: chainParams.loopNames,
      loopFixerPairs: chainParams.loopFixerPairs,
      maxIterationsByStep: chainParams.maxIterationsByStep,
    });

    const result = await pipeline.run("implementer", state, deps);

    // Within one episode the counter accumulates: sec runs iter1 + iter2 + bypass,
    // the fixer runs exactly maxIterationsByStep.sec times, then exhaustion fires.
    expect(result.error?.code).toBe("SEC_RETRIES_EXHAUSTED");
    expect(result.status).toBe("awaiting-resume");
    expect(secCallCount).toBe(3);          // iter1 + iter2 + bypass
    expect(codeFixerCallCount).toBe(2);    // per-reviewer budget
  });
});
