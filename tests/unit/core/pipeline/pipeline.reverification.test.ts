/**
 * E2E pipeline tests for the post-fixer reverification chokepoint.
 *
 * TC-001: code-fixer の変更が pr-create 前に再検証される（再検証あり経路）
 * TC-002: conformance needs-fix:code-fixer 経由の変更も再検証される
 * TC-003: 再検証 failed は build-fixer へ流れる
 * TC-004: build-fixer 回復後に再検証が通過して pr-create へ向かう
 * TC-005: fixer が走らない clean run では verification が一度だけ走る
 * TC-006: 初回 verification passed は code-review へ向かう
 * TC-019: conformance → verification 入場で episode-reset が発火し budget が fresh になる
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
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-reverification-test-"));
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
    jobId: "test-reverification-e2e",
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

/** Returns a monotonically increasing ISO 8601 timestamp factory per test. */
function makeTick() {
  let t = 0;
  return (): string => {
    t++;
    const mins = String(Math.floor(t / 60)).padStart(2, "0");
    const secs = String(t % 60).padStart(2, "0");
    return `2026-01-01T00:${mins}:${secs}.000Z`;
  };
}

/** Append a StepRun with the given verdict and timestamp to state.steps[stepName]. */
function appendRun(
  state: JobState,
  stepName: string,
  verdict: string,
  ts: string,
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
    startedAt: ts,
    endedAt: ts,
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
}

function makePipeline(executeSpy: ReturnType<typeof vi.fn>, maxIterations = 5): Pipeline {
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

// ─────────────────────────────────────────────────────────────────────────────
// TC-001: code-fixer の変更が pr-create 前に再検証される
//
// Sequence:
//   implementer(T1) → verification(pass,T2) →
//   code-review(approved+1fixable,T3) → code-fixer(approved,T4) →
//   [code-review.verdict=approved → forward to conformance]
//   conformance(approved,T5) → [codeChangedSince: T4>T2 → true] →
//   verification(pass,T6) → [conformanceApproved → true] →
//   adr-gen → pr-create
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-001: code-fixer ran after verification → re-verification before pr-create", () => {
  it("verification is executed a 2nd time before adr-gen when code-fixer ran after verification", async () => {
    const tick = makeTick();
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const stepsOrder: string[] = [];
    let verificationCallCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState) => {
      const ts = tick();
      stepsOrder.push(step.name);
      if (step.name === "implementer") return appendRun(s, "implementer", "success", ts);
      if (step.name === "verification") {
        verificationCallCount++;
        return appendRun(s, "verification", "passed", ts);
      }
      // code-review: approved with 1 fixable finding → routes to code-fixer
      if (step.name === "code-review") return appendRun(s, "code-review", "approved", ts, 1);
      // code-fixer: approved → routes to conformance (forward row: code-review.verdict=approved)
      if (step.name === "code-fixer") return appendRun(s, "code-fixer", "approved", ts);
      if (step.name === "conformance") return appendRun(s, "conformance", "approved", ts);
      if (step.name === "adr-gen") return appendRun(s, "adr-gen", "success", ts);
      if (step.name === "pr-create") return appendRun(s, "pr-create", "success", ts);
      throw new Error(`Unexpected step: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy);
    const result = await pipeline.run("implementer", state, deps);

    // Pipeline completes successfully
    expect(result.status).toBe("awaiting-archive");
    expect(result.error).toBeNull();

    // verification was called twice: once after implementer (T2), once as re-verification (T6)
    expect(verificationCallCount).toBe(2);

    // The 2nd verification must come after code-fixer
    const verificationIndices = stepsOrder
      .map((name, idx) => (name === "verification" ? idx : -1))
      .filter((idx) => idx !== -1);
    const codeFixerIdx = stepsOrder.lastIndexOf("code-fixer");
    expect(verificationIndices).toHaveLength(2);
    expect(verificationIndices[1]).toBeGreaterThan(codeFixerIdx);

    // pr-create comes after the 2nd verification
    const prCreateIdx = stepsOrder.indexOf("pr-create");
    expect(prCreateIdx).toBeGreaterThan(verificationIndices[1]!);

    // adr-gen comes before pr-create and after 2nd verification
    const adrGenIdx = stepsOrder.lastIndexOf("adr-gen");
    expect(adrGenIdx).toBeGreaterThan(verificationIndices[1]!);
    expect(prCreateIdx).toBeGreaterThan(adrGenIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-002: conformance needs-fix:code-fixer 経由の変更も再検証される
//
// Sequence:
//   implementer → verification(pass,T2) → code-review(approved,no fixable) →
//   conformance(1st: needs-fix:code-fixer) → code-fixer(T4) →
//   code-review(approved, forward) → conformance(2nd: approved) →
//   [codeChangedSince: code-fixer.T4 > verification.T2 → true] →
//   verification(pass,T6) → adr-gen → pr-create
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-002: conformance needs-fix:code-fixer path also triggers re-verification", () => {
  it("code-fixer via conformance routing is also re-verified before pr-create", async () => {
    const tick = makeTick();
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let verificationCallCount = 0;
    let conformanceCallCount = 0;
    const stepsOrder: string[] = [];

    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState) => {
      const ts = tick();
      stepsOrder.push(step.name);
      if (step.name === "implementer") return appendRun(s, "implementer", "success", ts);
      if (step.name === "verification") {
        verificationCallCount++;
        return appendRun(s, "verification", "passed", ts);
      }
      // code-review: no fixable findings → routes to conformance
      if (step.name === "code-review") return appendRun(s, "code-review", "approved", ts);
      // code-fixer runs when conformance issues needs-fix:code-fixer
      if (step.name === "code-fixer") return appendRun(s, "code-fixer", "approved", ts);
      if (step.name === "conformance") {
        conformanceCallCount++;
        // 1st: needs-fix:code-fixer → code-fixer runs
        // 2nd: approved → triggers re-verification (code-fixer ran after verification)
        const verdict = conformanceCallCount === 1 ? "needs-fix:code-fixer" : "approved";
        return appendRun(s, "conformance", verdict, ts);
      }
      if (step.name === "adr-gen") return appendRun(s, "adr-gen", "success", ts);
      if (step.name === "pr-create") return appendRun(s, "pr-create", "success", ts);
      throw new Error(`Unexpected step: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy);
    const result = await pipeline.run("implementer", state, deps);

    expect(result.status).toBe("awaiting-archive");

    // verification was called at least twice: initial + re-verification
    expect(verificationCallCount).toBeGreaterThanOrEqual(2);

    // The last verification must come after the last code-fixer
    const verificationIndices = stepsOrder
      .map((name, idx) => (name === "verification" ? idx : -1))
      .filter((idx) => idx !== -1);
    const lastCodeFixerIdx = stepsOrder.lastIndexOf("code-fixer");
    const lastVerificationIdx = verificationIndices[verificationIndices.length - 1]!;
    expect(lastVerificationIdx).toBeGreaterThan(lastCodeFixerIdx);

    // pr-create comes after the last verification
    const prCreateIdx = stepsOrder.indexOf("pr-create");
    expect(prCreateIdx).toBeGreaterThan(lastVerificationIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-003: 再検証 failed は build-fixer へ流れる
//
// Sequence:
//   implementer → verification(pass,T2) → code-review(approved+fixable) →
//   code-fixer(T4) → conformance(approved) →
//   verification(fail,T6) → build-fixer →
//   verification(pass,T8) → adr-gen → pr-create
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-003: re-verification failed → build-fixer (not pr-create)", () => {
  it("when re-verification fails, pipeline routes to build-fixer and eventually pr-create", async () => {
    const tick = makeTick();
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let verificationCallCount = 0;
    let buildFixerCallCount = 0;
    const stepsOrder: string[] = [];

    // verification: initial pass (T2), re-verify fail (T6), recovery pass (T8)
    const verificationVerdicts = ["passed", "failed", "passed"];

    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState) => {
      const ts = tick();
      stepsOrder.push(step.name);
      if (step.name === "implementer") return appendRun(s, "implementer", "success", ts);
      if (step.name === "verification") {
        const verdict = verificationVerdicts[verificationCallCount] ?? "passed";
        verificationCallCount++;
        return appendRun(s, "verification", verdict, ts);
      }
      if (step.name === "build-fixer") {
        buildFixerCallCount++;
        return appendRun(s, "build-fixer", "success", ts);
      }
      if (step.name === "code-review") return appendRun(s, "code-review", "approved", ts, 1);
      if (step.name === "code-fixer") return appendRun(s, "code-fixer", "approved", ts);
      if (step.name === "conformance") return appendRun(s, "conformance", "approved", ts);
      if (step.name === "adr-gen") return appendRun(s, "adr-gen", "success", ts);
      if (step.name === "pr-create") return appendRun(s, "pr-create", "success", ts);
      throw new Error(`Unexpected step: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy);
    const result = await pipeline.run("implementer", state, deps);

    expect(result.status).toBe("awaiting-archive");

    // build-fixer was called (re-verification failed → build-fixer)
    expect(buildFixerCallCount).toBeGreaterThanOrEqual(1);

    // build-fixer must appear after the re-verification failure
    const verificationIndices = stepsOrder
      .map((name, idx) => (name === "verification" ? idx : -1))
      .filter((idx) => idx !== -1);
    // 2nd verification is the re-verify failure
    const reVerifyIdx = verificationIndices[1]!;
    const buildFixerIndices = stepsOrder
      .map((name, idx) => (name === "build-fixer" ? idx : -1))
      .filter((idx) => idx !== -1);
    expect(buildFixerIndices[0]).toBeGreaterThan(reVerifyIdx);

    // pr-create comes after all build-fixer calls
    const prCreateIdx = stepsOrder.indexOf("pr-create");
    const lastBuildFixerIdx = buildFixerIndices[buildFixerIndices.length - 1]!;
    expect(prCreateIdx).toBeGreaterThan(lastBuildFixerIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-004: build-fixer 回復後に再検証が通過して adr-gen へ向かう（code-review を経由しない）
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-004: build-fixer recovery → re-verification passes → adr-gen (not code-review again)", () => {
  it("after re-verify-fail → build-fixer recovery, routes to adr-gen (conformance still approved)", async () => {
    const tick = makeTick();
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let verificationCallCount = 0;
    const stepsOrder: string[] = [];

    // verification: initial pass, re-verify fail, recovery pass
    const verificationVerdicts = ["passed", "failed", "passed"];

    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState) => {
      const ts = tick();
      stepsOrder.push(step.name);
      if (step.name === "implementer") return appendRun(s, "implementer", "success", ts);
      if (step.name === "verification") {
        const verdict = verificationVerdicts[verificationCallCount] ?? "passed";
        verificationCallCount++;
        return appendRun(s, "verification", verdict, ts);
      }
      if (step.name === "build-fixer") return appendRun(s, "build-fixer", "success", ts);
      if (step.name === "code-review") return appendRun(s, "code-review", "approved", ts, 1);
      if (step.name === "code-fixer") return appendRun(s, "code-fixer", "approved", ts);
      if (step.name === "conformance") return appendRun(s, "conformance", "approved", ts);
      if (step.name === "adr-gen") return appendRun(s, "adr-gen", "success", ts);
      if (step.name === "pr-create") return appendRun(s, "pr-create", "success", ts);
      throw new Error(`Unexpected step: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy);
    const result = await pipeline.run("implementer", state, deps);

    expect(result.status).toBe("awaiting-archive");

    // adr-gen must have been called after recovery
    const adrGenIdx = stepsOrder.lastIndexOf("adr-gen");
    expect(adrGenIdx).toBeGreaterThan(-1);

    // code-review must appear only once (initial path only, not after recovery)
    const codeReviewCount = stepsOrder.filter((n) => n === "code-review").length;
    expect(codeReviewCount).toBe(1);

    // verification was called exactly 3 times: initial + re-verify-fail + recovery
    expect(verificationCallCount).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-005: fixer が走らない clean run では verification が一度だけ走る
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-005: clean run (no fixer) → verification runs exactly once", () => {
  it("when no fixer runs, verification is called only once (no re-verification)", async () => {
    const tick = makeTick();
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let verificationCallCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState) => {
      const ts = tick();
      if (step.name === "implementer") return appendRun(s, "implementer", "success", ts);
      if (step.name === "verification") {
        verificationCallCount++;
        return appendRun(s, "verification", "passed", ts);
      }
      // code-review approves with no fixable findings → goes directly to conformance
      if (step.name === "code-review") return appendRun(s, "code-review", "approved", ts);
      if (step.name === "conformance") return appendRun(s, "conformance", "approved", ts);
      if (step.name === "adr-gen") return appendRun(s, "adr-gen", "success", ts);
      if (step.name === "pr-create") return appendRun(s, "pr-create", "success", ts);
      throw new Error(`Unexpected step: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy);
    const result = await pipeline.run("implementer", state, deps);

    expect(result.status).toBe("awaiting-archive");

    // verification was called exactly once — no re-verification
    // implementer.T1 < verification.T2 → codeChangedSinceLastVerification = false → skip re-verify
    expect(verificationCallCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-006: 初回 verification passed は code-review へ向かう
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-006: initial verification passed → code-review (conformance not yet approved)", () => {
  it("when conformance has not run, verification passed routes to code-review (not adr-gen)", async () => {
    const tick = makeTick();
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const stepsOrder: string[] = [];

    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState) => {
      const ts = tick();
      stepsOrder.push(step.name);
      if (step.name === "implementer") return appendRun(s, "implementer", "success", ts);
      if (step.name === "verification") return appendRun(s, "verification", "passed", ts);
      if (step.name === "code-review") return appendRun(s, "code-review", "approved", ts);
      if (step.name === "conformance") return appendRun(s, "conformance", "approved", ts);
      if (step.name === "adr-gen") return appendRun(s, "adr-gen", "success", ts);
      if (step.name === "pr-create") return appendRun(s, "pr-create", "success", ts);
      throw new Error(`Unexpected step: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy);
    const result = await pipeline.run("implementer", state, deps);

    expect(result.status).toBe("awaiting-archive");

    // code-review must appear after the first (and only) verification
    const firstVerificationIdx = stepsOrder.indexOf("verification");
    const codeReviewIdx = stepsOrder.indexOf("code-review");
    expect(codeReviewIdx).toBeGreaterThan(firstVerificationIdx);

    // adr-gen must appear after code-review (not before it — initial verification must NOT skip review)
    const adrGenIdx = stepsOrder.indexOf("adr-gen");
    expect(adrGenIdx).toBeGreaterThan(codeReviewIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-019: conformance → verification re-entry gives fresh verification budget
//
// Same sequence pattern as TC-070 (episode-reset test) but with code-fixer
// running AFTER the final episode-1 verification pass, which triggers
// re-verification on conformance approved.
//
// Episode 1 (budget consumed):
//   implementer → verification(fail,1) → build-fixer → verification(fail,2) →
//   build-fixer → verification(pass,3,bypass) →
//   code-review(approved+1fixable) → code-fixer → conformance(approved)
//
// Episode 2 (fresh budget via conformance→verification reset):
//   verification(fail,fresh1) → build-fixer(fresh1) →
//   verification(pass,fresh2) → adr-gen → pr-create
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-019: conformance → verification re-entry gives fresh verification budget", () => {
  it("re-verification does not immediately exhaust even when prior episode consumed budget", async () => {
    const tick = makeTick();
    const maxIterations = 2;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let verificationCallCount = 0;
    let buildFixerCallCount = 0;

    // verificationVerdicts[0..2] = episode 1 (fail, fail, pass/bypass)
    // verificationVerdicts[3..4] = episode 2 fresh (fail, pass)
    const verificationVerdicts = ["failed", "failed", "passed", "failed", "passed"];

    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState) => {
      const ts = tick();
      if (step.name === "implementer") return appendRun(s, "implementer", "success", ts);
      if (step.name === "verification") {
        const verdict = verificationVerdicts[verificationCallCount] ?? "passed";
        verificationCallCount++;
        return appendRun(s, "verification", verdict, ts);
      }
      if (step.name === "build-fixer") {
        buildFixerCallCount++;
        return appendRun(s, "build-fixer", "success", ts);
      }
      // code-review with fixable findings → code-fixer (runs after bypass verification)
      if (step.name === "code-review") return appendRun(s, "code-review", "approved", ts, 1);
      // code-fixer runs AFTER verification(pass, T3), so code-fixer.ts > verification.ts
      if (step.name === "code-fixer") return appendRun(s, "code-fixer", "approved", ts);
      if (step.name === "conformance") return appendRun(s, "conformance", "approved", ts);
      if (step.name === "adr-gen") return appendRun(s, "adr-gen", "success", ts);
      if (step.name === "pr-create") return appendRun(s, "pr-create", "success", ts);
      throw new Error(`Unexpected step in TC-019: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy, maxIterations);
    const result = await pipeline.run("implementer", state, deps);

    // Pipeline completes normally — episode-reset prevents immediate exhaustion
    expect(result.error?.code).not.toBe("VERIFICATION_RETRIES_EXHAUSTED");
    expect(result.status).toBe("awaiting-archive");

    // Episode 1: 2 build-fixer calls. Episode 2: 1 build-fixer call. Total: 3.
    expect(buildFixerCallCount).toBe(3);

    // Episode 1: 3 verification calls. Episode 2: 2 verification calls. Total: 5.
    expect(verificationCallCount).toBe(5);
  });
});
