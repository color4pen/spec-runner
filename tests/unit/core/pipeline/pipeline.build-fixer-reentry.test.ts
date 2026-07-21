/**
 * E2E pipeline tests for build-fixer re-entry via revision-binding guard (T-02).
 *
 * TC-013: build-fixer が conformance 承認後に走ると code-review へ再入する（must）
 * TC-017: build-fixer 回復経路が awaiting-archive で収束しループしない（must）
 *
 * ⚠ RED TESTS: TC-013 and TC-017 are written in RED state.
 * The current guard `conformanceApprovedLatest` returns true whenever the last
 * conformance verdict is "approved" — regardless of commitOid. After T-02, the
 * guard is replaced by `conformanceApprovedForVerifiedRevision` which additionally
 * checks that conformance.commitOid === verification.commitOid.
 *
 * Before T-02:
 *   conformance approved (sha-conf) + verification passed (sha-bf, sha-bf ≠ sha-conf)
 *   → guard TRUE → adr-gen (code-review skipped — WRONG)
 *   → stepsOrder does NOT contain "code-review" → RED
 *
 * After T-02:
 *   sha-conf ≠ sha-bf → guard FALSE → code-review re-entry → convergence
 *   → stepsOrder contains "code-review" → GREEN
 *
 * Source: specrunner/changes/approval-revision-binding/test-cases.md
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
import { STEP_NAMES } from "../../../../src/core/step/step-names.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-buildfixer-reentry-test-"));
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalDeps(): PipelineDeps {
  return {
    client: {} as PipelineDeps["client"],
    config: {
      version: 1,
      agents: {},
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: {
      type: "bug-fix",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "content",
      adr: false,
    },
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
    owner: "user",
    repo: "repo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
  };
}

/** Monotonically increasing ISO 8601 timestamp factory. */
function makeTick() {
  let t = 0;
  return (): string => {
    t++;
    const mins = String(Math.floor(t / 60)).padStart(2, "0");
    const secs = String(t % 60).padStart(2, "0");
    return `2026-01-01T00:${mins}:${secs}.000Z`;
  };
}

/**
 * Append a StepRun (with optional commitOid) to state.steps[stepName].
 * For use in executor spy implementations.
 */
function appendRunWithOid(
  state: JobState,
  stepName: string,
  verdict: string,
  ts: string,
  commitOid?: string,
): JobState {
  const existing = state.steps?.[stepName] ?? [];
  const run: StepRun = {
    attempt: existing.length + 1,
    sessionId: null,
    outcome: {
      verdict: verdict as import("../../../../src/state/schema.js").Verdict,
      findingsPath: null,
      error: null,
    },
    startedAt: ts,
    endedAt: ts,
    ...(commitOid !== undefined ? { commitOid } : {}),
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
    ["implementer", makeAgentStep("implementer", "success")],
    [
      "bite-evidence",
      {
        kind: "cli",
        name: "bite-evidence",
        run: async () => {},
        resultFilePath: () => "/tmp/bite-evidence-result.md",
        parseResult: () => ({ verdict: "strategy-deferred" as const, findingsPath: null }),
      },
    ],
    [
      "verification",
      {
        kind: "cli",
        name: "verification",
        run: async () => {},
        resultFilePath: () => "/tmp/verification-result.md",
        parseResult: () => ({ verdict: "passed" as const, findingsPath: null }),
      },
    ],
    ["build-fixer", makeAgentStep("build-fixer", "success")],
    ["code-review", makeAgentStep("code-review")],
    ["code-fixer", makeAgentStep("code-fixer", "approved")],
    ["conformance", makeAgentStep("conformance")],
    ["adr-gen", makeAgentStep("adr-gen", "success")],
    [
      "pr-create",
      {
        kind: "cli",
        name: "pr-create",
        run: async () => {},
        resultFilePath: () => "/tmp/pr-create-result.md",
        parseResult: () => ({ verdict: "success" as const, findingsPath: null }),
      },
    ],
  ]);
}

function makePipeline(executeSpy: ReturnType<typeof vi.fn>, maxIterations = 15): Pipeline {
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
// Pre-state builder: conformance approved with specific commitOid
// ---------------------------------------------------------------------------

/**
 * Build a minimal JobState with conformance(approved, commitOid=sha) already recorded.
 * Used to simulate the scenario where conformance was approved at a specific SHA.
 *
 * All pre-state timestamps are at T00:00:0X (seconds 1-N) to let the spy tick
 * produce timestamps that properly interleave for codeChangedSinceLastVerification.
 */
function makeStateWithConformanceApproved(
  overrides: Partial<JobState> & {
    extraSteps?: Record<string, StepRun[]>;
  } = {},
): JobState {
  const { extraSteps = {}, ...stateOverrides } = overrides;
  return {
    version: 1,
    jobId: "test-buildfixer-reentry",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: STEP_NAMES.VERIFICATION,
    status: "running",
    branch: "fix/test-branch",
    history: [],
    error: null,
    steps: {
      [STEP_NAMES.CONFORMANCE]: [
        {
          attempt: 1,
          sessionId: null,
          outcome: { verdict: "approved", findingsPath: null, error: null },
          startedAt: "2026-01-01T00:00:01.000Z",
          endedAt: "2026-01-01T00:00:01.000Z",
          commitOid: "sha-conf",
        },
      ],
      ...extraSteps,
    },
    ...stateOverrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-013: build-fixer が conformance 承認後に走ると code-review へ再入する（must）
//
// Scenario:
//   Pre-state: conformance(approved, commitOid="sha-conf")
//   Pipeline starts at verification. Spy returns:
//     verification(passed, commitOid="sha-bf")  [sha-bf ≠ sha-conf]
//   Current guard (conformanceApprovedLatest):
//     → true (approved verdict regardless of sha) → adr-gen (WRONG)
//   After T-02 (conformanceApprovedForVerifiedRevision):
//     sha-conf ≠ sha-bf → false → code-review re-entry (CORRECT)
//
// RED assertion: stepsOrder.includes("code-review")
//   Before T-02: FAILS (code-review skipped, pipeline goes straight to adr-gen)
//   After T-02: PASSES (code-review is called)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-013: build-fixer after conformance approval → code-review re-entry (must)", () => {
  it("goes to code-review when verification commitOid (sha-bf) ≠ conformance commitOid (sha-conf)", async () => {
    const tick = makeTick();
    const state = makeStateWithConformanceApproved();
    const deps = makeMinimalDeps();

    const stepsOrder: string[] = [];
    let conformanceCallCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState) => {
      const ts = tick();
      stepsOrder.push(step.name);

      if (step.name === STEP_NAMES.VERIFICATION) {
        // verification passed with sha-bf (different from conformance sha-conf)
        return appendRunWithOid(s, "verification", "passed", ts, "sha-bf");
      }
      if (step.name === STEP_NAMES.CODE_REVIEW) {
        // code-review approves with no fixable findings → forward to conformance
        return appendRunWithOid(s, "code-review", "approved", ts);
      }
      if (step.name === STEP_NAMES.CONFORMANCE) {
        conformanceCallCount++;
        // 2nd conformance: approved with sha-bf (re-approved at build-fixer revision)
        return appendRunWithOid(s, "conformance", "approved", ts, "sha-bf");
      }
      if (step.name === STEP_NAMES.ADR_GEN) {
        return appendRunWithOid(s, "adr-gen", "success", ts);
      }
      if (step.name === STEP_NAMES.PR_CREATE) {
        return appendRunWithOid(s, "pr-create", "success", ts);
      }

      throw new Error(`Unexpected step called in TC-013: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy);
    const result = await pipeline.run(STEP_NAMES.VERIFICATION, state, deps);

    // Pipeline should converge to awaiting-archive (no escalation)
    expect(result.status).toBe("awaiting-archive");

    // RED assertion: code-review must be called
    // Before T-02: guard=true → adr-gen immediately → code-review NOT in stepsOrder → FAIL
    // After T-02: guard=false → code-review called → PASS
    expect(stepsOrder).toContain(STEP_NAMES.CODE_REVIEW);
  });

  it("code-review appears before adr-gen when guard correctly returns false", async () => {
    const tick = makeTick();
    const state = makeStateWithConformanceApproved();
    const deps = makeMinimalDeps();

    const stepsOrder: string[] = [];

    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState) => {
      const ts = tick();
      stepsOrder.push(step.name);

      if (step.name === STEP_NAMES.VERIFICATION) {
        return appendRunWithOid(s, "verification", "passed", ts, "sha-bf");
      }
      if (step.name === STEP_NAMES.CODE_REVIEW) {
        return appendRunWithOid(s, "code-review", "approved", ts);
      }
      if (step.name === STEP_NAMES.CONFORMANCE) {
        return appendRunWithOid(s, "conformance", "approved", ts, "sha-bf");
      }
      if (step.name === STEP_NAMES.ADR_GEN) {
        return appendRunWithOid(s, "adr-gen", "success", ts);
      }
      if (step.name === STEP_NAMES.PR_CREATE) {
        return appendRunWithOid(s, "pr-create", "success", ts);
      }

      throw new Error(`Unexpected step called in TC-013 (ordering): ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy);
    await pipeline.run(STEP_NAMES.VERIFICATION, state, deps);

    // RED assertion (order): code-review must appear BEFORE adr-gen
    // Before T-02: adr-gen comes right after verification (code-review not called) → FAIL
    // After T-02: code-review → conformance → adr-gen → PASS
    const codeReviewIdx = stepsOrder.indexOf(STEP_NAMES.CODE_REVIEW);
    const adrGenIdx = stepsOrder.indexOf(STEP_NAMES.ADR_GEN);

    expect(codeReviewIdx).toBeGreaterThan(-1); // code-review must be called
    expect(codeReviewIdx).toBeLessThan(adrGenIdx); // code-review before adr-gen
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-017: build-fixer 回復経路が awaiting-archive で収束しループしない（must）
//
// Scenario (from spec.md D4):
//   Pre-state: conformance(approved, sha-conf)
//              verification(failed)  [before build-fixer]
//              build-fixer(success)  [later timestamp than verification]
//   Pipeline starts at verification.
//
//   Sequence after T-02:
//     1. verification(pass, sha-bf) → guard: sha-conf≠sha-bf → false → code-review
//     2. code-review(approved) → conformance
//     3. conformance(approved, sha-bf) → codeChangedSinceLastVerification?
//        vTime = max(failed-pre, passed-step1) = failed-pre timestamp (LARGER due to pre-state order)
//        mTime = build-fixer timestamp (LARGEST pre-state value)
//        mTime > vTime → TRUE → verification again (step 4)
//     4. verification(pass, sha-bf) → guard: sha-bf=sha-bf → TRUE → adr-gen
//     5. adr-gen → pr-create → awaiting-archive
//
//   No escalation, no infinite loop.
//
// RED assertion: stepsOrder.includes("code-review")
//   Before T-02: guard=true → adr-gen immediately → FAIL
//   After T-02: guard=false → code-review called → PASS
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-017: build-fixer re-entry converges to awaiting-archive without escalation (must)", () => {
  it("pipeline reaches awaiting-archive via code-review re-entry (no loop, no escalation)", async () => {
    const tick = makeTick();
    const deps = makeMinimalDeps();

    // Pre-state: conformance(sha-conf) at T01:01, verification(failed) at T01:02,
    // build-fixer(success) at T01:03. Pre-state timestamps are AFTER tick() output
    // so that build-fixer.endedAt > first spy verification.endedAt, causing
    // codeChangedSinceLastVerification = true at 2nd conformance → triggers 3rd verification.
    // After 3rd verification, vTime catches up and guard is true → adr-gen.
    const state: JobState = {
      version: 1,
      jobId: "test-tc017-convergence",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "bug-fix" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: STEP_NAMES.VERIFICATION,
      status: "running",
      branch: "fix/test-branch",
      history: [],
      error: null,
      steps: {
        [STEP_NAMES.CONFORMANCE]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T01:01:00.000Z",
            endedAt: "2026-01-01T01:01:00.000Z",
            commitOid: "sha-conf",
          },
        ],
        [STEP_NAMES.VERIFICATION]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "failed", findingsPath: null, error: null },
            startedAt: "2026-01-01T01:02:00.000Z",
            endedAt: "2026-01-01T01:02:00.000Z",
          },
        ],
        [STEP_NAMES.BUILD_FIXER]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "success", findingsPath: null, error: null },
            startedAt: "2026-01-01T01:03:00.000Z",
            endedAt: "2026-01-01T01:03:00.000Z",
          },
        ],
      },
    };

    const stepsOrder: string[] = [];
    let verificationCallCount = 0;
    let conformanceCallCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState) => {
      const ts = tick();
      stepsOrder.push(step.name);

      if (step.name === STEP_NAMES.VERIFICATION) {
        verificationCallCount++;
        // Always returns passed with sha-bf (entry HEAD after build-fixer)
        return appendRunWithOid(s, "verification", "passed", ts, "sha-bf");
      }
      if (step.name === STEP_NAMES.CODE_REVIEW) {
        // Approved with no fixable findings → routes to conformance
        return appendRunWithOid(s, "code-review", "approved", ts);
      }
      if (step.name === STEP_NAMES.CONFORMANCE) {
        conformanceCallCount++;
        // Re-approval at sha-bf (the build-fixer's revision)
        return appendRunWithOid(s, "conformance", "approved", ts, "sha-bf");
      }
      if (step.name === STEP_NAMES.ADR_GEN) {
        return appendRunWithOid(s, "adr-gen", "success", ts);
      }
      if (step.name === STEP_NAMES.PR_CREATE) {
        return appendRunWithOid(s, "pr-create", "success", ts);
      }

      throw new Error(`Unexpected step called in TC-017: ${step.name}`);
    });

    const pipeline = makePipeline(executeSpy);
    const result = await pipeline.run(STEP_NAMES.VERIFICATION, state, deps);

    // Pipeline must converge — no escalation, no maxIterations exceeded
    expect(result.status).toBe("awaiting-archive");
    expect(result.error).toBeNull();

    // RED assertion: code-review must be called
    // Before T-02: guard=true immediately → adr-gen (no code-review) → FAIL
    // After T-02: guard=false → code-review → PASS
    expect(stepsOrder).toContain(STEP_NAMES.CODE_REVIEW);

    // Conformance must be re-approved (spy called at least once for 2nd conformance)
    // Before T-02: conformanceCallCount = 0 (pre-state conformance only, spy not called)
    // After T-02: spy called for 2nd conformance
    expect(conformanceCallCount).toBeGreaterThanOrEqual(1);

    // adr-gen must be reached (convergence, not a dead-end code-review loop)
    expect(stepsOrder).toContain(STEP_NAMES.ADR_GEN);
    expect(stepsOrder).toContain(STEP_NAMES.PR_CREATE);
  });

  it("does not escalate: converges within reasonable maxIterations", async () => {
    const tick = makeTick();
    const deps = makeMinimalDeps();

    const state: JobState = {
      version: 1,
      jobId: "test-tc017-no-escalation",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/req.md", title: "Test", type: "bug-fix" },
      repository: { owner: "testowner", name: "testrepo" },
      session: null,
      step: STEP_NAMES.VERIFICATION,
      status: "running",
      branch: "fix/test-branch",
      history: [],
      error: null,
      steps: {
        [STEP_NAMES.CONFORMANCE]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2026-01-01T01:01:00.000Z",
            endedAt: "2026-01-01T01:01:00.000Z",
            commitOid: "sha-conf",
          },
        ],
        [STEP_NAMES.VERIFICATION]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "failed", findingsPath: null, error: null },
            startedAt: "2026-01-01T01:02:00.000Z",
            endedAt: "2026-01-01T01:02:00.000Z",
          },
        ],
        [STEP_NAMES.BUILD_FIXER]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "success", findingsPath: null, error: null },
            startedAt: "2026-01-01T01:03:00.000Z",
            endedAt: "2026-01-01T01:03:00.000Z",
          },
        ],
      },
    };

    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState) => {
      const ts = tick();
      if (step.name === STEP_NAMES.VERIFICATION) {
        return appendRunWithOid(s, "verification", "passed", ts, "sha-bf");
      }
      if (step.name === STEP_NAMES.CODE_REVIEW) {
        return appendRunWithOid(s, "code-review", "approved", ts);
      }
      if (step.name === STEP_NAMES.CONFORMANCE) {
        return appendRunWithOid(s, "conformance", "approved", ts, "sha-bf");
      }
      if (step.name === STEP_NAMES.ADR_GEN) {
        return appendRunWithOid(s, "adr-gen", "success", ts);
      }
      if (step.name === STEP_NAMES.PR_CREATE) {
        return appendRunWithOid(s, "pr-create", "success", ts);
      }
      throw new Error(`Unexpected step called in TC-017 (no-escalation): ${step.name}`);
    });

    // Use a tight maxIterations to confirm no loop: 10 steps are plenty for the 5-6 step path
    const pipeline = makePipeline(executeSpy, 10);
    const result = await pipeline.run(STEP_NAMES.VERIFICATION, state, deps);

    // Pipeline must NOT escalate (converges without hitting budget)
    expect(result.status).toBe("awaiting-archive");
  });
});
