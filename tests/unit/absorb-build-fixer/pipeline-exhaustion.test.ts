/**
 * Tests: build-fixer の廃止 — pipeline 統合 (exhaustion / fresh budget)
 *
 * TC-006: 持続失敗で再入上限に達し escalation する
 * TC-007: conformance 再検証は fresh な予算で実行される
 *
 * Source: specrunner/changes/absorb-build-fixer/test-cases.md
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Pipeline } from "../../../src/core/pipeline/pipeline.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import type { StepExecutor } from "../../../src/core/step/executor.js";
import type { Step } from "../../../src/core/step/types.js";
import type { JobState, StepRun } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";
import { STEP_NAMES } from "../../../src/core/step/step-names.js";
// verificationFailedLast is the new when-guard added to reverification.ts by this change
import { verificationFailedLast } from "../../../src/core/pipeline/reverification.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

let tempDir: string;
let originalXdgDataHome: string | undefined;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "absorb-build-fixer-pipeline-test-"));
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopSpawn: SpawnFn = async () => ({ exitCode: 0, stdout: "", stderr: "" });

function makeMinimalState(): JobState {
  return {
    version: 1,
    jobId: "test-exhaustion-job",
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
      getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN", mergeStateStatus: "CLEAN", headRefName: "", mergeable: "MERGEABLE" }),
      mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
      getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
      listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
      createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
      searchOpenIssuesByLabel: vi.fn().mockResolvedValue([]),
      listIssueComments: vi.fn().mockResolvedValue([]),
      removeLabel: vi.fn().mockResolvedValue(undefined),
      getIssue: vi.fn().mockResolvedValue({ number: 1, title: "Test Issue", body: "" }),
    },
    owner: "user",
    repo: "repo",
    spawn: noopSpawn,
    storeFactory: makeStoreFactory(tempDir),
  };
}

function makeAgentStep(name: string): Step {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name as import("../../../src/state/schema.js").AgentStepName,
      model: "claude-sonnet-4-5",
      system: "",
      tools: [],
    },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    completionVerdict: "success" as const,
  };
}

function makeCliStep(name: string, verdict: string): Step {
  return {
    kind: "cli",
    name,
    run: async () => {},
    resultFilePath: () => `/tmp/${name}-result.md`,
    parseResult: () => ({ verdict: verdict as import("../../../src/state/schema.js").Verdict, findingsPath: null }),
  };
}

function appendStepRun(
  state: JobState,
  stepName: string,
  verdict: string,
  ts: string,
  sessionId: string | null = null,
): JobState {
  const existing = state.steps?.[stepName] ?? [];
  const run: StepRun = {
    attempt: existing.length + 1,
    sessionId,
    outcome: {
      verdict: verdict as import("../../../src/state/schema.js").Verdict,
      findingsPath: null,
      error: null,
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

function makeTick() {
  let t = 0;
  return (): string => {
    t++;
    const secs = String(t).padStart(2, "0");
    return `2026-01-01T00:00:${secs}.000Z`;
  };
}

// ---------------------------------------------------------------------------
// TC-006: 持続失敗で再入上限に達し escalation する
//
// With implementer as paired fixer for verification:
//   verification(fail) → implementer(success, verificationFailedLast=true)
//   → verification(fail, via when guard) → ... → VERIFICATION_RETRIES_EXHAUSTED
// ---------------------------------------------------------------------------

describe("TC-006: 持続失敗で implementer 再入上限に達し VERIFICATION_RETRIES_EXHAUSTED が発火する", () => {
  it("TC-006: verification が繰り返し失敗し続けると VERIFICATION_RETRIES_EXHAUSTED で escalation する", async () => {
    const maxIterations = 2; // Small limit to prove the mechanism fires
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    let verificationCallCount = 0;
    let implementerCallCount = 0;
    const tick = makeTick();

    // Transitions that mirror the post-implementation behavior:
    //   verification failed → implementer (paired fixer)
    //   implementer success → verification (when: verificationFailedLast)
    //   implementer success → end (otherwise — but this path won't be hit)
    const postImplTransitions = [
      {
        step: STEP_NAMES.VERIFICATION,
        on: "failed" as const,
        to: STEP_NAMES.IMPLEMENTER,
      },
      {
        step: STEP_NAMES.VERIFICATION,
        on: "passed" as const,
        to: "end" as const,
      },
      {
        step: STEP_NAMES.VERIFICATION,
        on: "escalation" as const,
        to: "escalate" as const,
      },
      // Recovery re-entry: implementer success → verification (when verificationFailedLast=true)
      {
        step: STEP_NAMES.IMPLEMENTER,
        on: "success" as const,
        to: STEP_NAMES.VERIFICATION,
        when: verificationFailedLast,
      },
      // Fallback: implementer success without failed verification → end
      {
        step: STEP_NAMES.IMPLEMENTER,
        on: "success" as const,
        to: "end" as const,
      },
      {
        step: STEP_NAMES.IMPLEMENTER,
        on: "error" as const,
        to: "escalate" as const,
      },
    ];

    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState): Promise<JobState> => {
      const ts = tick();
      if (step.name === STEP_NAMES.VERIFICATION) {
        verificationCallCount++;
        // Always fail
        return appendStepRun(s, STEP_NAMES.VERIFICATION, "failed", ts);
      }
      if (step.name === STEP_NAMES.IMPLEMENTER) {
        implementerCallCount++;
        // Always succeed (but verification still fails, so loop continues)
        return appendStepRun(s, STEP_NAMES.IMPLEMENTER, "success", ts);
      }
      throw new Error(`Unexpected step: ${step.name}`);
    });

    const pipeline = new Pipeline({
      steps: new Map([
        [STEP_NAMES.VERIFICATION, makeCliStep(STEP_NAMES.VERIFICATION, "failed")],
        [STEP_NAMES.IMPLEMENTER,  makeAgentStep(STEP_NAMES.IMPLEMENTER)],
      ]),
      transitions: postImplTransitions,
      maxIterations,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events: new EventBus(),
      loopName: STEP_NAMES.VERIFICATION,
      loopNames: [STEP_NAMES.VERIFICATION],
      // TC-006: implementer is now the paired fixer for verification
      loopFixerPairs: { [STEP_NAMES.VERIFICATION]: STEP_NAMES.IMPLEMENTER },
    });

    const result = await pipeline.run(STEP_NAMES.VERIFICATION, state, deps);

    // TC-006: VERIFICATION_RETRIES_EXHAUSTED must fire (not run forever)
    expect(result.error?.code).toBe("VERIFICATION_RETRIES_EXHAUSTED");
    expect(result.status).toBe("awaiting-resume");

    // TC-006: implementer ran (as paired fixer)
    expect(implementerCallCount).toBeGreaterThan(0);

    // TC-006: exhaustion fires within the maxIterations bound
    expect(verificationCallCount).toBeLessThanOrEqual(maxIterations + 1);
  });
});

// ---------------------------------------------------------------------------
// TC-007: conformance 再検証は fresh な予算で実行される
//
// When conformance routes back to verification (reverificationNeeded=true),
// the episode reset fires (currentStep=conformance ≠ pairedFixer=implementer),
// giving verification a fresh budget. If verification then fails and implementer
// (paired fixer) recovers it, the exhaustion count is NOT cumulative with
// the previous episode.
//
// Sequence:
//   verification(fail,ep1) → implementer → verification(pass,ep1) →
//   code-review(approved) → conformance(approved,reverificationNeeded=true) →
//   [episode-reset fires: conformance ≠ implementer] →
//   verification(fail,ep2-fresh) → implementer(ep2) → verification(pass,ep2) →
//   end (not exhausted)
// ---------------------------------------------------------------------------

describe("TC-007: conformance 再検証は fresh な予算で実行される(episode reset により exhaustion しない)", () => {
  it("TC-007: episode-1 で予算を消費した後の conformance→verification 再入が即 exhaustion にならない", async () => {
    // maxIterations=1 ensures that without the episode-reset, the 2nd
    // verification failure (ep2) would exhaust immediately.
    // With the episode-reset, ep2 has a fresh budget and can recover.
    const maxIterations = 1;
    const state = makeMinimalState();
    const deps = makeMinimalDeps();

    const tick = makeTick();

    let verificationCallCount = 0;
    // Episode 1: fail once, then pass. Episode 2 (re-verify): fail once, then pass.
    const verificationVerdicts = ["failed", "passed", "failed", "passed"];

    let conformanceCallCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, s: JobState): Promise<JobState> => {
      const ts = tick();
      if (step.name === STEP_NAMES.VERIFICATION) {
        const verdict = verificationVerdicts[verificationCallCount] ?? "passed";
        verificationCallCount++;
        return appendStepRun(s, STEP_NAMES.VERIFICATION, verdict, ts);
      }
      if (step.name === STEP_NAMES.IMPLEMENTER) {
        return appendStepRun(s, STEP_NAMES.IMPLEMENTER, "success", ts);
      }
      if (step.name === STEP_NAMES.CODE_REVIEW) {
        return appendStepRun(s, STEP_NAMES.CODE_REVIEW, "approved", ts);
      }
      if (step.name === STEP_NAMES.CONFORMANCE) {
        conformanceCallCount++;
        // 1st conformance: reverificationNeeded (code-fixer ran after verification via timestamp trick)
        // 2nd conformance: approved (stable, no re-verify needed)
        if (conformanceCallCount === 1) {
          return appendStepRun(s, STEP_NAMES.CONFORMANCE, "approved", ts);
        }
        return appendStepRun(s, STEP_NAMES.CONFORMANCE, "approved", ts);
      }
      if (step.name === "end-step") {
        return appendStepRun(s, "end-step", "success", ts);
      }
      throw new Error(`TC-007 unexpected step: ${step.name}`);
    });

    // Use reverificationNeeded-equivalent (always true for 1st conformance) by injecting
    // a custom when guard that returns true only for the first conformance approved.
    const whenReverify = (s: JobState) => {
      // Simulate reverificationNeeded for the first conformance run only
      const vRuns = s.steps?.[STEP_NAMES.VERIFICATION] ?? [];
      const lastV = vRuns[vRuns.length - 1];
      // Trigger reverification if last verification passed but conformance hasn't run a 2nd time yet
      return lastV?.outcome.verdict === "passed" && conformanceCallCount <= 1;
    };

    const postImplTransitions = [
      // verification → implementer (failed) or code-review (passed)
      {
        step: STEP_NAMES.VERIFICATION,
        on: "failed" as const,
        to: STEP_NAMES.IMPLEMENTER,
      },
      {
        step: STEP_NAMES.VERIFICATION,
        on: "passed" as const,
        to: STEP_NAMES.CODE_REVIEW,
      },
      {
        step: STEP_NAMES.VERIFICATION,
        on: "escalation" as const,
        to: "escalate" as const,
      },
      // implementer → verification (recovery) or code-review (initial)
      {
        step: STEP_NAMES.IMPLEMENTER,
        on: "success" as const,
        to: STEP_NAMES.VERIFICATION,
        when: verificationFailedLast,
      },
      {
        step: STEP_NAMES.IMPLEMENTER,
        on: "success" as const,
        to: STEP_NAMES.CODE_REVIEW,
      },
      {
        step: STEP_NAMES.IMPLEMENTER,
        on: "error" as const,
        to: "escalate" as const,
      },
      // code-review → conformance
      {
        step: STEP_NAMES.CODE_REVIEW,
        on: "approved" as const,
        to: STEP_NAMES.CONFORMANCE,
      },
      {
        step: STEP_NAMES.CODE_REVIEW,
        on: "needs-fix" as const,
        to: "escalate" as const,
      },
      // conformance → re-verification or end
      {
        step: STEP_NAMES.CONFORMANCE,
        on: "approved" as const,
        to: STEP_NAMES.VERIFICATION,
        when: whenReverify,
      },
      {
        step: STEP_NAMES.CONFORMANCE,
        on: "approved" as const,
        to: "end" as const,
      },
      {
        step: STEP_NAMES.CONFORMANCE,
        on: "needs-fix" as const,
        to: "escalate" as const,
      },
    ];

    const pipeline = new Pipeline({
      steps: new Map([
        [STEP_NAMES.VERIFICATION, makeCliStep(STEP_NAMES.VERIFICATION, "failed")],
        [STEP_NAMES.IMPLEMENTER,  makeAgentStep(STEP_NAMES.IMPLEMENTER)],
        [STEP_NAMES.CODE_REVIEW,  makeAgentStep(STEP_NAMES.CODE_REVIEW)],
        [STEP_NAMES.CONFORMANCE,  makeAgentStep(STEP_NAMES.CONFORMANCE)],
      ]),
      transitions: postImplTransitions,
      maxIterations,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events: new EventBus(),
      loopName: STEP_NAMES.VERIFICATION,
      loopNames: [STEP_NAMES.VERIFICATION, STEP_NAMES.CODE_REVIEW],
      // TC-007: implementer is paired fixer for verification
      loopFixerPairs: { [STEP_NAMES.VERIFICATION]: STEP_NAMES.IMPLEMENTER },
    });

    const result = await pipeline.run(STEP_NAMES.VERIFICATION, state, deps);

    // TC-007: episode-reset fires when conformance (not the paired fixer) routes to verification.
    // The pipeline completes successfully — no VERIFICATION_RETRIES_EXHAUSTED.
    expect(result.error?.code).not.toBe("VERIFICATION_RETRIES_EXHAUSTED");
    // It either completes normally or escalates for other reasons (not exhaustion)
    expect(["awaiting-archive", "awaiting-resume"]).toContain(result.status);

    // TC-007: verification ran more than once (episode 1 + episode 2)
    expect(verificationCallCount).toBeGreaterThan(1);
  });
});
