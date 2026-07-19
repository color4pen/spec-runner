/**
 * Tests: reviewer の approved を fixer 予算切れで覆さない
 *
 * TC-001: standard 経路で承認が予算切れでも進む
 * TC-002: custom/parallel 経路で承認が予算切れでも進む
 * TC-003: 省略後も reviewer の findings が残る
 * TC-004: 省略が history / event に記録される
 * TC-005: needs-fix 予算切れの escalation は不変
 * TC-006: 承認時に "did not approve" を出さない
 * TC-007: lastReviewerFixableCount が fixable findings の件数を返す
 * TC-008: lastReviewerFixableCount が run なし / findings なしで 0 を返す
 * TC-009: DomainEvent union と EventPayloadMap に pipeline:fixer:budget-skipped が存在し typecheck が通る
 * TC-010: PipelineLogger が pipeline:fixer:budget-skipped を JSONL に書く
 * TC-011: fixer budget に余裕がある場合は従来どおり fixer を実行する
 * TC-012: clean 遷移先が得られない場合は fail-safe で従来 exhaustion に委ねる
 * TC-013: 非発火時に省略 history エントリと budget-skipped event を出力しない
 * TC-014: 再 routing 無効化で TC-001 が escalation で落ちる（破壊確認）
 * TC-015: 既存テスト群が無変更で green かつ typecheck && test が通る
 *
 * ⚠ RED TESTS: All integration tests (TC-001〜006, TC-011〜013) and unit tests
 * (TC-007, TC-008, TC-009, TC-010) are written in RED state — they are expected to
 * FAIL until T-01 through T-04 in tasks.md are implemented.
 *
 * Source: specrunner/changes/approved-not-overturned-by-fixer-budget/test-cases.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as url from "node:url";

import { Pipeline } from "../../../src/core/pipeline/pipeline.js";
import {
  buildReviewerChainTransitions,
  buildParallelReviewerTransitions,
  // TC-007/TC-008: lastReviewerFixableCount does NOT exist yet (T-01).
  // The named import resolves to undefined at runtime; calling it throws TypeError.
  // The tests below will FAIL with TypeError until T-01 is implemented.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} from "../../../src/core/pipeline/reviewer-chain.js";
import { EventBus } from "../../../src/core/event/event-bus.js";
import { PipelineLogger } from "../../../src/logger/pipeline-logger.js";
import { StepExecutor } from "../../../src/core/step/executor.js";
import type { Step } from "../../../src/core/step/types.js";
import type { JobState, StepRun } from "../../../src/state/schema.js";
import type { PipelineDeps } from "../../../src/core/types.js";
import type { Finding } from "../../../src/kernel/report-result.js";
import { makeStoreFactory } from "../../helpers/store-factory.js";

// ---------------------------------------------------------------------------
// Import of not-yet-exported symbol (T-01)
// Accessing the named export at runtime gives `undefined` before T-01 is merged.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { lastReviewerFixableCount } = await import("../../../src/core/pipeline/reviewer-chain.js") as any;

// ---------------------------------------------------------------------------
// Source root for file-content checks (TC-009, TC-015)
// ---------------------------------------------------------------------------
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(__dirname, "../../../");

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-approved-budget-"));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: `test-budget-job-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Budget Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "code-review",
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
      },
      environment: { id: "env_001", lastSyncedAt: "2026-01-01" },
    },
    request: { type: "feature", title: "Budget Test", slug: "budget-test", baseBranch: "main", content: "content", adr: false },
    slug: "budget-test",
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
    spawn: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    storeFactory: makeStoreFactory(tempDir),
  };
}

/** Build a minimal Step object for the given step name. */
function makeStep(name: string, extra: Partial<Step> = {}): Step {
  return {
    kind: "agent",
    name,
    agent: { name: `test-${name}`, role: name, model: "claude-sonnet-4-5", system: "", tools: [] },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
    ...extra,
  } as Step;
}

/**
 * Build a StepRun for code-review with needs-fix verdict and no fixable findings.
 * Represents a standard "must fix" reviewer result.
 */
function makeCodeReviewNeedsFixRun(attempt: number): StepRun {
  const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, attempt)).toISOString();
  return {
    attempt,
    sessionId: null,
    startedAt: ts,
    endedAt: ts,
    outcome: {
      verdict: "needs-fix",
      findingsPath: null,
      error: null,
      toolResult: {
        ok: true,
        approved: false,
        findings: [],
      },
    },
  };
}

/**
 * Build a StepRun for code-review with approved verdict and one fixable (low severity) finding.
 * This is the key "approved but has optional fixable issues" state that T-03 handles.
 */
function makeCodeReviewApprovedWithFixableRun(attempt: number, fixableCount = 1): StepRun {
  const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, attempt)).toISOString();
  const findings: Finding[] = Array.from({ length: fixableCount }, (_, i) => ({
    severity: "low" as const,
    resolution: "fixable" as const,
    file: `src/optional-${i}.ts`,
    title: `Optional improvement ${i + 1}`,
    rationale: "Nice to have but not required",
  }));
  return {
    attempt,
    sessionId: null,
    startedAt: ts,
    endedAt: ts,
    outcome: {
      verdict: "approved",
      findingsPath: null,
      error: null,
      toolResult: {
        ok: true,
        approved: true,
        findings,
      },
    },
  };
}

/**
 * Build the sequence of code-review execution states for the standard TC-001/TC-002 scenario:
 * - call 1: needs-fix (no fixable findings)
 * - call 2: needs-fix (no fixable findings)
 * - call 3: approved + 1 fixable finding
 * Returns the accumulated state after each code-review call (with all previous runs included).
 */
function makeCodeReviewStateSequence(baseState: JobState): JobState[] {
  const run1 = makeCodeReviewNeedsFixRun(1);
  const state1: JobState = {
    ...baseState,
    steps: {
      ...baseState.steps,
      "code-review": [run1],
    },
  };

  const run2 = makeCodeReviewNeedsFixRun(2);
  const state2: JobState = {
    ...state1,
    steps: {
      ...state1.steps,
      "code-review": [run1, run2],
    },
  };

  const run3 = makeCodeReviewApprovedWithFixableRun(3, 1);
  const state3: JobState = {
    ...state2,
    steps: {
      ...state2.steps,
      "code-review": [run1, run2, run3],
    },
  };

  return [state1, state2, state3];
}

/**
 * Build the standard test pipeline for TC-001 (buildReviewerChainTransitions).
 *
 * Scenario: maxIterations=2, code-review goes needs-fix → needs-fix → approved+fixable
 * code-fixer budget exhausted (used 2 times for the 2 needs-fix iterations).
 * After T-03: re-routes to conformance instead of escalating.
 *
 * Returns { pipeline, events, executeSpy, codeFixerCallCount }
 */
function buildStandardScenarioPipeline(baseState: JobState): {
  pipeline: Pipeline;
  events: EventBus;
  executeSpy: ReturnType<typeof vi.fn>;
  getCodeFixerCallCount: () => number;
  getConformanceCallCount: () => number;
} {
  const events = new EventBus();
  const stateSeq = makeCodeReviewStateSequence(baseState);

  let codeReviewCallCount = 0;
  let codeFixerCallCount = 0;
  let conformanceCallCount = 0;

  const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
    if (step.name === "code-review") {
      const idx = codeReviewCallCount++;
      return stateSeq[idx] ?? stateSeq[stateSeq.length - 1]!;
    }

    if (step.name === "code-fixer") {
      codeFixerCallCount++;
      // Return currentState unchanged; Pipeline uses completionVerdict: "approved"
      return currentState;
    }

    if (step.name === "conformance") {
      conformanceCallCount++;
      // conformance approves (the correct post-fix route)
      return {
        ...currentState,
        steps: {
          ...currentState.steps,
          "conformance": [
            ...(currentState.steps?.["conformance"] ?? []),
            {
              attempt: conformanceCallCount,
              sessionId: null,
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              outcome: { verdict: "approved" as const, findingsPath: null, error: null },
            },
          ],
        },
      };
    }

    throw new Error(`Unexpected step in TC-001 mock: ${step.name}`);
  });

  const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

  const transitions = [
    ...buildReviewerChainTransitions(["code-review"]),
    // conformance → end: simple test-only transition (bypasses reverification guard)
    { step: "conformance", on: "approved", to: "end" as const },
    { step: "conformance", on: "needs-fix", to: "code-fixer" as const },
  ];

  const steps = new Map<string, Step>([
    ["code-review", makeStep("code-review")],
    ["code-fixer", makeStep("code-fixer", { completionVerdict: "approved" })],
    ["conformance", makeStep("conformance")],
  ]);

  const pipeline = new Pipeline({
    steps,
    transitions,
    maxIterations: 2,
    executor: mockExecutor,
    events,
    loopName: "code-review",
    loopNames: ["code-review"],
    loopFixerPairs: { "code-review": "code-fixer" },
  });

  return {
    pipeline,
    events,
    executeSpy,
    getCodeFixerCallCount: () => codeFixerCallCount,
    getConformanceCallCount: () => conformanceCallCount,
  };
}

/**
 * Build the parallel reviewer scenario pipeline for TC-002 (buildParallelReviewerTransitions).
 *
 * Uses the code-review + code-fixer rows from buildParallelReviewerTransitions where the
 * "clean approved" destination is "custom-reviewers" (coordinator) instead of "conformance".
 * This independently verifies the parallel path transition table.
 */
function buildParallelScenarioPipeline(baseState: JobState): {
  pipeline: Pipeline;
  events: EventBus;
  executeSpy: ReturnType<typeof vi.fn>;
  getCustomReviewersCallCount: () => number;
} {
  const events = new EventBus();
  const stateSeq = makeCodeReviewStateSequence(baseState);

  let codeReviewCallCount = 0;
  let codeFixerCallCount = 0;
  let customReviewersCallCount = 0;

  const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
    if (step.name === "code-review") {
      const idx = codeReviewCallCount++;
      return stateSeq[idx] ?? stateSeq[stateSeq.length - 1]!;
    }

    if (step.name === "code-fixer") {
      codeFixerCallCount++;
      return currentState;
    }

    if (step.name === "custom-reviewers") {
      customReviewersCallCount++;
      return {
        ...currentState,
        steps: {
          ...currentState.steps,
          "custom-reviewers": [
            ...(currentState.steps?.["custom-reviewers"] ?? []),
            {
              attempt: customReviewersCallCount,
              sessionId: null,
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              outcome: { verdict: "approved" as const, findingsPath: null, error: null },
            },
          ],
        },
      };
    }

    throw new Error(`Unexpected step in TC-002 mock: ${step.name}`);
  });

  const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

  // Use buildParallelReviewerTransitions for code-review + code-fixer rows (different from TC-001)
  const parallelRows = buildParallelReviewerTransitions({
    coordinator: "custom-reviewers",
    members: [],
  });
  // Take only the code-review and code-fixer rows (the ones T-03 applies to)
  const codeReviewAndFixerRows = parallelRows.filter(
    (t) => t.step === "code-review" || t.step === "code-fixer",
  );

  const transitions = [
    ...codeReviewAndFixerRows,
    // custom-reviewers (coordinator) → end: test-only shortcut
    { step: "custom-reviewers", on: "approved", to: "end" as const },
    { step: "custom-reviewers", on: "needs-fix", to: "code-fixer" as const },
  ];

  const steps = new Map<string, Step>([
    ["code-review", makeStep("code-review")],
    ["code-fixer", makeStep("code-fixer", { completionVerdict: "approved" })],
    ["custom-reviewers", makeStep("custom-reviewers")],
  ]);

  const pipeline = new Pipeline({
    steps,
    transitions,
    maxIterations: 2,
    executor: mockExecutor,
    events,
    loopName: "code-review",
    loopNames: ["code-review"],
    loopFixerPairs: { "code-review": "code-fixer" },
    // No parallelReview: undefined — treat custom-reviewers as a regular step.
    // This tests the transition table behavior (buildParallelReviewerTransitions)
    // without needing the complex ParallelReviewRound fan-out.
  });

  return {
    pipeline,
    events,
    executeSpy,
    getCustomReviewersCallCount: () => customReviewersCallCount,
  };
}

// ===========================================================================
// TC-007 / TC-008: Unit tests for lastReviewerFixableCount (T-01)
// ===========================================================================

describe("TC-007: lastReviewerFixableCount returns fixable finding count", () => {
  // Source: tasks.md > T-01
  // RED: lastReviewerFixableCount is NOT exported from reviewer-chain.ts yet (T-01 not implemented).
  // At runtime: lastReviewerFixableCount === undefined → calling it throws TypeError.

  it("TC-007: returns 2 when state has 2 fixable findings for the reviewer", () => {
    const baseState = makeMinimalState();
    const stateWithFindings: JobState = {
      ...baseState,
      steps: {
        "code-review": [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:01.000Z",
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                approved: true,
                findings: [
                  { severity: "low" as const, resolution: "fixable" as const, file: "src/a.ts", title: "A", rationale: "r" },
                  { severity: "low" as const, resolution: "fixable" as const, file: "src/b.ts", title: "B", rationale: "r" },
                ],
              },
            },
          },
        ],
      },
    };

    // RED: lastReviewerFixableCount is undefined before T-01 → TypeError
    expect(lastReviewerFixableCount(stateWithFindings, "code-review")).toBe(2);
  });

  it("TC-007 (multi-step): returns correct fixable count for custom reviewer and regression-gate", () => {
    const baseState = makeMinimalState();
    const stateWithFindings: JobState = {
      ...baseState,
      steps: {
        "custom-reviewer": [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:01.000Z",
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                approved: true,
                findings: [
                  { severity: "low" as const, resolution: "fixable" as const, file: "src/c.ts", title: "C", rationale: "r" },
                ],
              },
            },
          },
        ],
      },
    };

    // RED: lastReviewerFixableCount is undefined before T-01 → TypeError
    expect(lastReviewerFixableCount(stateWithFindings, "custom-reviewer")).toBe(1);
    expect(lastReviewerFixableCount(stateWithFindings, "regression-gate")).toBe(0);
  });
});

describe("TC-008: lastReviewerFixableCount returns 0 for missing runs", () => {
  // Source: tasks.md > T-01
  // Priority: should
  // RED: lastReviewerFixableCount is NOT exported → TypeError

  it("TC-008: returns 0 when reviewer has no runs in state", () => {
    const state = makeMinimalState();
    // RED: TypeError
    expect(lastReviewerFixableCount(state, "unknown-reviewer")).toBe(0);
  });

  it("TC-008: returns 0 when toolResult is null", () => {
    const state: JobState = {
      ...makeMinimalState(),
      steps: {
        "code-review": [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:01.000Z",
            outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: null },
          },
        ],
      },
    };
    // RED: TypeError
    expect(lastReviewerFixableCount(state, "code-review")).toBe(0);
  });
});

// ===========================================================================
// TC-009: DomainEvent union contains pipeline:fixer:budget-skipped (T-02)
// ===========================================================================

describe("TC-009: DomainEvent union and EventPayloadMap contain pipeline:fixer:budget-skipped", () => {
  // Source: tasks.md > T-02
  // Priority: must
  // RED: "pipeline:fixer:budget-skipped" is NOT in src/kernel/event-types.ts yet.

  it("TC-009: DomainEvent union in event-types.ts contains pipeline:fixer:budget-skipped", async () => {
    const content = await fs.readFile(
      path.join(SOURCE_ROOT, "src/kernel/event-types.ts"),
      "utf-8",
    );
    // RED: the string is absent before T-02
    expect(content).toContain('"pipeline:fixer:budget-skipped"');
  });

  it("TC-009: EventPayloadMap in core/event/types.ts contains pipeline:fixer:budget-skipped payload", async () => {
    const content = await fs.readFile(
      path.join(SOURCE_ROOT, "src/core/event/types.ts"),
      "utf-8",
    );
    // RED: the payload type is absent before T-02
    expect(content).toContain('"pipeline:fixer:budget-skipped"');
    expect(content).toContain("omittedFixableFindings");
  });
});

// ===========================================================================
// TC-010: PipelineLogger writes pipeline:fixer:budget-skipped to JSONL (T-02, T-04)
// ===========================================================================

describe("TC-010: PipelineLogger writes pipeline:fixer:budget-skipped to JSONL", () => {
  // Source: tasks.md > T-02
  // Priority: must
  // RED: PipelineLogger.subscribe does NOT handle pipeline:fixer:budget-skipped yet.

  it("TC-010: emitting pipeline:fixer:budget-skipped results in a JSONL line with all fields", async () => {
    const logPath = path.join(tempDir, "test-pipeline-events.jsonl");
    const logger = new PipelineLogger(logPath);
    const events = new EventBus();
    logger.subscribe(events);

    // Emit the new event. TypeScript would error here before T-02 adds the type,
    // but at runtime (esbuild strips types) EventBus accepts any string key.
    // PipelineLogger does NOT subscribe to this event yet → no JSONL line written.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (events as any).emit("pipeline:fixer:budget-skipped", {
      step: "code-review",
      fixer: "code-fixer",
      omittedFixableFindings: 1,
      maxIterations: 2,
    });

    logger.close();

    const content = await fs.readFile(logPath, "utf-8").catch(() => "");
    const lines = content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l); } catch { return null; }
      })
      .filter(Boolean);

    const skippedLine = lines.find((l: Record<string, unknown>) => l.type === "pipeline:fixer:budget-skipped");

    // RED: PipelineLogger doesn't subscribe → skippedLine is undefined
    expect(skippedLine).toBeDefined();
    expect(skippedLine?.step).toBe("code-review");
    expect(skippedLine?.fixer).toBe("code-fixer");
    expect(skippedLine?.omittedFixableFindings).toBe(1);
    expect(skippedLine?.maxIterations).toBe(2);
  });

  it("TC-010: existing pipeline events are still written unchanged after the change", async () => {
    const logPath = path.join(tempDir, "test-existing-events.jsonl");
    const logger = new PipelineLogger(logPath);
    const events = new EventBus();
    logger.subscribe(events);

    // Emit an existing event to verify backward-compat
    events.emit("pipeline:iteration:start", { step: "code-review", iteration: 1, maxIterations: 2 });
    logger.close();

    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const iterStart = lines.find((l: Record<string, unknown>) => l.type === "pipeline:iteration:start");
    expect(iterStart).toBeDefined();
    expect(iterStart?.step).toBe("code-review");
  });
});

// ===========================================================================
// TC-001: standard 経路で承認が予算切れでも進む
// ===========================================================================

describe("TC-001: standard path — approved not overturned by fixer budget exhaustion", () => {
  /**
   * Source: spec.md > Requirement: 承認は paired fixer の予算切れで覆らない
   * Tasks: T-03 (re-routing), T-04 (history + event)
   * Priority: must
   *
   * Scenario:
   *   maxIterations=2
   *   code-review iter 1: needs-fix → code-fixer (fixerIter=1)
   *   code-fixer iter 1: approved → code-review (fallback: lastVerdict=needs-fix)
   *   code-review iter 2: needs-fix → code-fixer (fixerIter=2)
   *   code-fixer iter 2: approved → code-review (bypass: loopIter=2=max, fixerIter=2=max)
   *   code-review iter 3: approved + fixable 1件
   *     → nextStep = "code-fixer" (approved+fixable transition)
   *     → BUG: fixerIter(2) >= max(2) → CODE_REVIEW_RETRIES_EXHAUSTED
   *     → FIX (T-03): re-route to "conformance" (clean approved transition)
   *
   * RED: Without T-03, result.status === "awaiting-resume" with error.code === "CODE_REVIEW_RETRIES_EXHAUSTED".
   * GREEN (after T-03): result.status === "awaiting-archive" (pipeline completes).
   *
   * DESTRUCTION CONFIRMATION (TC-014):
   *   If T-03 re-routing logic in pipeline.ts is commented out, this test fails with:
   *     - result.status === "awaiting-resume"
   *     - result.error?.code === "CODE_REVIEW_RETRIES_EXHAUSTED"
   *   To reproduce: comment out the T-03 re-routing block in pipeline.ts runInternal()
   *   (the block between "transition resolved" and "episode-reset"), then run this test.
   */

  it("TC-001: pipeline completes without escalation when approved + fixable + fixer budget exhausted (standard path)", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const { pipeline, getConformanceCallCount } = buildStandardScenarioPipeline(baseState);

    // RED: without T-03, this result has status="awaiting-resume" and CODE_REVIEW_RETRIES_EXHAUSTED
    const result = await pipeline.run("code-review", baseState, deps);

    // After T-03: pipeline re-routes to conformance → end
    expect(result.status).toBe("awaiting-archive"); // RED: currently "awaiting-resume"
    expect(result.error).toBeNull(); // RED: currently has CODE_REVIEW_RETRIES_EXHAUSTED
    expect(getConformanceCallCount()).toBe(1); // RED: conformance is never reached currently
  });

  it("TC-001: code-review ran exactly 3 times (2 needs-fix + 1 approved)", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const { pipeline, executeSpy } = buildStandardScenarioPipeline(baseState);

    await pipeline.run("code-review", baseState, deps).catch(() => {});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const codeReviewCalls = executeSpy.mock.calls.filter(
      ([step]: any[]) => (step as Step)?.name === "code-review",
    );
    expect(codeReviewCalls).toHaveLength(3); // 2 needs-fix + 1 approved+fixable
  });
});

// ===========================================================================
// TC-002: custom/parallel 経路で承認が予算切れでも進む
// ===========================================================================

describe("TC-002: parallel/custom path — approved not overturned by fixer budget (buildParallelReviewerTransitions)", () => {
  /**
   * Source: spec.md > Requirement: 承認は paired fixer の予算切れで覆らない
   * Tasks: T-03
   * Priority: must
   *
   * Independent verification of buildParallelReviewerTransitions path.
   * TC-001's green result is NOT used as evidence for this test.
   * The clean approved transition in buildParallelReviewerTransitions routes to
   * "custom-reviewers" (coordinator) instead of "conformance".
   *
   * RED: Without T-03, escalates with CODE_REVIEW_RETRIES_EXHAUSTED.
   */

  it("TC-002: pipeline completes without escalation via buildParallelReviewerTransitions path", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const { pipeline, getCustomReviewersCallCount } = buildParallelScenarioPipeline(baseState);

    // RED: without T-03, escalates
    const result = await pipeline.run("code-review", baseState, deps);

    expect(result.status).toBe("awaiting-archive"); // RED
    expect(result.error).toBeNull(); // RED
    expect(getCustomReviewersCallCount()).toBe(1); // RED: custom-reviewers never reached
  });

  it("TC-002: uses buildParallelReviewerTransitions transition table (code-review→coordinator clean row exists)", () => {
    // Verify the transition table independently: buildParallelReviewerTransitions produces
    // a code-review/approved row (no when guard) that routes to coordinator.
    const transitions = buildParallelReviewerTransitions({
      coordinator: "custom-reviewers",
      members: ["security-review"],
    });
    const cleanApprovedRow = transitions.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.when === undefined,
    );
    expect(cleanApprovedRow).toBeDefined();
    expect(cleanApprovedRow?.to).toBe("custom-reviewers");
  });
});

// ===========================================================================
// TC-003: 省略後も reviewer の findings が残る
// ===========================================================================

describe("TC-003: reviewer findings preserved after budget-skip re-routing", () => {
  /**
   * Source: spec.md > Requirement: 省略された fixable findings を保持する
   * Priority: must
   *
   * After re-routing, the reviewer's last StepRun must retain:
   * - verdict: "approved" (NOT overwritten to "escalation" by handleExhausted)
   * - toolResult.findings: the original fixable findings array
   *
   * RED: Without T-03, handleExhausted() overwrites verdict to "escalation".
   */

  it("TC-003: code-review last StepRun verdict remains 'approved' after budget-skip (not overwritten to 'escalation')", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const { pipeline } = buildStandardScenarioPipeline(baseState);

    const result = await pipeline.run("code-review", baseState, deps).catch((e) => {
      // Even if pipeline throws (pre-fix escalation), we check the last state
      const stateErr = (e as Record<string, unknown>)["state"] as JobState | undefined;
      return stateErr ?? baseState;
    });

    const codeReviewRuns = result.steps?.["code-review"] ?? [];
    const lastRun = codeReviewRuns[codeReviewRuns.length - 1];

    // RED: without T-03, handleExhausted overwrites verdict to "escalation"
    expect(lastRun?.outcome.verdict).toBe("approved");
  });

  it("TC-003: code-review last StepRun toolResult.findings preserved with fixable finding", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const { pipeline } = buildStandardScenarioPipeline(baseState);

    const result = await pipeline.run("code-review", baseState, deps).catch((e) => {
      const stateErr = (e as Record<string, unknown>)["state"] as JobState | undefined;
      return stateErr ?? baseState;
    });

    const codeReviewRuns = result.steps?.["code-review"] ?? [];
    const lastRun = codeReviewRuns[codeReviewRuns.length - 1];
    const toolResult = lastRun?.outcome.toolResult as { findings?: Finding[] } | null | undefined;
    const findings = toolResult?.findings ?? [];

    // RED: Without T-03, by the time we can read the result, handleExhausted has fired and
    // the verdict is "escalation" (findings may or may not be preserved but verdict is wrong)
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.resolution === "fixable")).toBe(true);
  });
});

// ===========================================================================
// TC-004: 省略が history / event に記録される
// ===========================================================================

describe("TC-004: budget-skip is recorded in history and as pipeline:fixer:budget-skipped event", () => {
  /**
   * Source: spec.md > Requirement: 任意修正の省略を明示して次工程へ進む
   * Tasks: T-04
   * Priority: must
   *
   * RED: Without T-04, no warning history entry and no pipeline:fixer:budget-skipped event.
   */

  it("TC-004: history contains a 'warning' entry mentioning code-review omission when budget-skip fires", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const { pipeline } = buildStandardScenarioPipeline(baseState);

    const result = await pipeline.run("code-review", baseState, deps).catch((e) => {
      const stateErr = (e as Record<string, unknown>)["state"] as JobState | undefined;
      return stateErr ?? baseState;
    });

    const warningEntries = (result.history ?? []).filter(
      (h) => h.status === "warning" && h.step === "code-review",
    );

    // RED: no warning history entry without T-04
    expect(warningEntries.length).toBeGreaterThan(0);
    // The warning message should indicate omission of fixable findings
    const warningMsg = warningEntries[0]?.message ?? "";
    expect(warningMsg).toMatch(/fixable|omit|skip|budget/i);
  });

  it("TC-004: pipeline:fixer:budget-skipped event is emitted when budget-skip fires", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const { pipeline, events } = buildStandardScenarioPipeline(baseState);

    const capturedEvents: Array<{ step: string; fixer: string; omittedFixableFindings: number; maxIterations: number }> = [];

    // Register handler BEFORE running — event bus fan-out is synchronous.
    // TypeScript would error here before T-02 adds the type to DomainEvent.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (events as any).on("pipeline:fixer:budget-skipped", (payload: { step: string; fixer: string; omittedFixableFindings: number; maxIterations: number }) => {
      capturedEvents.push(payload);
    });

    await pipeline.run("code-review", baseState, deps).catch(() => {});

    // RED: no event emitted without T-04
    expect(capturedEvents).toHaveLength(1);
    expect(capturedEvents[0]?.step).toBe("code-review");
    expect(capturedEvents[0]?.fixer).toBe("code-fixer");
    expect(capturedEvents[0]?.omittedFixableFindings).toBe(1);
  });
});

// ===========================================================================
// TC-005: needs-fix 予算切れの escalation は不変
// ===========================================================================

describe("TC-005: needs-fix budget exhaustion still escalates (regression guard)", () => {
  /**
   * Source: spec.md > Requirement: needs-fix の予算切れは従来どおり停止する
   * Priority: must
   *
   * GREEN: This test should PASS both before and after T-03 is implemented.
   * T-03 re-routing condition 1 requires outcome==="approved", so needs-fix is unaffected.
   *
   * When code-review NEVER approves (all needs-fix), the pipeline must still
   * escalate with CODE_REVIEW_RETRIES_EXHAUSTED.
   */

  it("TC-005: pipeline escalates with CODE_REVIEW_RETRIES_EXHAUSTED when code-review is always needs-fix", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const events = new EventBus();

    let codeReviewCallCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "code-review") {
        codeReviewCallCount++;
        const run = makeCodeReviewNeedsFixRun(codeReviewCallCount);
        return {
          ...currentState,
          steps: {
            ...currentState.steps,
            "code-review": [
              ...(currentState.steps?.["code-review"] ?? []),
              run,
            ],
          },
        };
      }
      if (step.name === "code-fixer") {
        // code-fixer always approves (completionVerdict), routing back to code-review
        return currentState;
      }
      throw new Error(`Unexpected step in TC-005: ${step.name}`);
    });

    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const pipeline = new Pipeline({
      steps: new Map([
        ["code-review", makeStep("code-review")],
        ["code-fixer", makeStep("code-fixer", { completionVerdict: "approved" })],
      ]),
      transitions: buildReviewerChainTransitions(["code-review"]),
      maxIterations: 2,
      executor: mockExecutor,
      events,
      loopName: "code-review",
      loopNames: ["code-review"],
      loopFixerPairs: { "code-review": "code-fixer" },
    });

    // GREEN: escalation is unchanged
    const result = await pipeline.run("code-review", baseState, deps);

    expect(result.status).toBe("awaiting-resume");
    expect(result.error?.code).toBe("CODE_REVIEW_RETRIES_EXHAUSTED");
  });
});

// ===========================================================================
// TC-006: 承認時に "did not approve" を出さない
// ===========================================================================

describe("TC-006: no 'did not approve' message when reviewer approved", () => {
  /**
   * Source: spec.md > Requirement: 停止メッセージは verdict と矛盾しない
   * Priority: must
   *
   * RED: Without T-03, handleExhausted sets error.message to
   * "code-review did not approve after N iterations" even when verdict=approved.
   */

  it("TC-006: result.error is null (no 'did not approve' message) when approved + budget-skip fires", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const { pipeline } = buildStandardScenarioPipeline(baseState);

    const result = await pipeline.run("code-review", baseState, deps).catch((e) => {
      const stateErr = (e as Record<string, unknown>)["state"] as JobState | undefined;
      return stateErr ?? baseState;
    });

    // RED: without T-03, result.error.message contains "did not approve"
    expect(result.error).toBeNull();
  });

  it("TC-006: no history entry with 'did not approve' text when approved + budget-skip fires", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const { pipeline } = buildStandardScenarioPipeline(baseState);

    const result = await pipeline.run("code-review", baseState, deps).catch((e) => {
      const stateErr = (e as Record<string, unknown>)["state"] as JobState | undefined;
      return stateErr ?? baseState;
    });

    const didNotApproveEntries = (result.history ?? []).filter((h) =>
      (h.message ?? "").toLowerCase().includes("did not approve"),
    );
    // RED: without T-03, escalation history entry contains "did not approve"
    expect(didNotApproveEntries).toHaveLength(0);
  });
});

// ===========================================================================
// TC-011: fixer budget に余裕がある場合は従来どおり fixer を実行する
// ===========================================================================

describe("TC-011: fixer runs normally when budget has room (approved + fixable, budget not exhausted)", () => {
  /**
   * Source: tasks.md > T-03, design.md > D2
   * Priority: must
   *
   * GREEN: This test should PASS. When fixerIter < maxIterations, T-03 condition 3 is false
   * → no re-routing → code-fixer runs as usual.
   *
   * Scenario: code-review approved + fixable on first try (fixerIter=0 < max=2)
   */

  it("TC-011: code-fixer is called when approved + fixable and budget has room", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const events = new EventBus();

    let codeFixerCalled = 0;

    const approvedWithFixableState: JobState = {
      ...baseState,
      steps: {
        "code-review": [makeCodeReviewApprovedWithFixableRun(1, 1)],
      },
    };

    const afterFixerState: JobState = {
      ...approvedWithFixableState,
      steps: {
        ...approvedWithFixableState.steps,
        // After code-fixer: code-review's last verdict is "approved"
        // so code-fixer→conformance transition fires
      },
    };

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "code-review") {
        return approvedWithFixableState;
      }
      if (step.name === "code-fixer") {
        codeFixerCalled++;
        return afterFixerState;
      }
      if (step.name === "conformance") {
        return {
          ...currentState,
          steps: {
            ...currentState.steps,
            "conformance": [{
              attempt: 1,
              sessionId: null,
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              outcome: { verdict: "approved" as const, findingsPath: null, error: null },
            }],
          },
        };
      }
      throw new Error(`Unexpected step in TC-011: ${step.name}`);
    });

    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    const transitions = [
      ...buildReviewerChainTransitions(["code-review"]),
      { step: "conformance", on: "approved", to: "end" as const },
    ];

    const pipeline = new Pipeline({
      steps: new Map([
        ["code-review", makeStep("code-review")],
        ["code-fixer", makeStep("code-fixer", { completionVerdict: "approved" })],
        ["conformance", makeStep("conformance")],
      ]),
      transitions,
      maxIterations: 2,
      executor: mockExecutor,
      events,
      loopName: "code-review",
      loopNames: ["code-review"],
      loopFixerPairs: { "code-review": "code-fixer" },
    });

    // GREEN: fixer runs normally when budget has room
    const result = await pipeline.run("code-review", baseState, deps);

    expect(result.status).toBe("awaiting-archive");
    expect(codeFixerCalled).toBe(1); // code-fixer was invoked (not skipped)
  });
});

// ===========================================================================
// TC-012: clean 遷移先が得られない場合は fail-safe で従来 exhaustion に委ねる
// ===========================================================================

describe("TC-012: fail-safe — no clean approved transition → defer to existing exhaustion", () => {
  /**
   * Source: tasks.md > T-03, design.md > D2
   * Priority: should
   *
   * When T-03 fires but no clean approved transition is found in the table,
   * T-03 must NOT set nextStep, allowing the existing fixer exhaustion check (line 493-499)
   * to fire (traditional CODE_REVIEW_RETRIES_EXHAUSTED escalation).
   *
   * This is a defensive fail-safe: the table should always have a clean row,
   * but if it's missing, we escalate rather than silently swallowing the error.
   *
   * Note: This scenario requires a custom transition table with NO clean approved row
   * for code-review. We construct one artificially.
   *
   * GREEN pre-T-03 (everything escalates anyway), behavior preserved post-T-03 for this edge case.
   */

  it("TC-012: escalates when T-03 condition fires but no clean approved transition exists", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const events = new EventBus();
    const stateSeq = makeCodeReviewStateSequence(baseState);

    let codeReviewCallCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "code-review") {
        const idx = codeReviewCallCount++;
        return stateSeq[idx] ?? stateSeq[stateSeq.length - 1]!;
      }
      if (step.name === "code-fixer") {
        return currentState;
      }
      throw new Error(`Unexpected step in TC-012: ${step.name}`);
    });

    const mockExecutor = { execute: executeSpy } as unknown as StepExecutor;

    // Transition table with ONLY fixable→fixer and needs-fix→fixer rows.
    // NO clean approved row. T-03 should find no clean transition → fail-safe escalation.
    const transitions = [
      {
        step: "code-review",
        on: "approved",
        to: "code-fixer" as const,
        when: (s: JobState) => {
          const runs = s.steps?.["code-review"];
          if (!runs || runs.length === 0) return false;
          const last = runs[runs.length - 1];
          const findings = (last?.outcome.toolResult as { findings?: Finding[] } | null)?.findings ?? [];
          return findings.some((f) => f.resolution === "fixable");
        },
      },
      { step: "code-review", on: "needs-fix", to: "code-fixer" as const },
      { step: "code-fixer", on: "approved", to: "code-review" as const },
      { step: "code-fixer", on: "error", to: "escalate" as const },
    ];

    const pipeline = new Pipeline({
      steps: new Map([
        ["code-review", makeStep("code-review")],
        ["code-fixer", makeStep("code-fixer", { completionVerdict: "approved" })],
      ]),
      transitions,
      maxIterations: 2,
      executor: mockExecutor,
      events,
      loopName: "code-review",
      loopNames: ["code-review"],
      loopFixerPairs: { "code-review": "code-fixer" },
    });

    // Should escalate (fail-safe: no clean transition found → defer to exhaustion check)
    const result = await pipeline.run("code-review", baseState, deps);
    expect(result.status).toBe("awaiting-resume");
    expect(result.error?.code).toBe("CODE_REVIEW_RETRIES_EXHAUSTED");
  });
});

// ===========================================================================
// TC-013: 非発火時に省略 history エントリと budget-skipped event を出力しない
// ===========================================================================

describe("TC-013: no budget-skipped event or warning history when T-03 does not fire", () => {
  /**
   * Source: tasks.md > T-04
   * Priority: should
   *
   * GREEN: This test should PASS. When conditions are not met (budget has room, or needs-fix),
   * no pipeline:fixer:budget-skipped event and no status:warning history entry appear.
   */

  it("TC-013 (a): no budget-skipped event when approved + fixable but budget has room (fixerIter < max)", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const events = new EventBus();

    const budgetSkippedEvents: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (events as any).on("pipeline:fixer:budget-skipped", (p: unknown) => {
      budgetSkippedEvents.push(p);
    });

    const approvedWithFixableState: JobState = {
      ...baseState,
      steps: {
        "code-review": [makeCodeReviewApprovedWithFixableRun(1, 1)],
      },
    };

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "code-review") return approvedWithFixableState;
      if (step.name === "code-fixer") return currentState;
      if (step.name === "conformance") {
        return {
          ...currentState,
          steps: {
            ...currentState.steps,
            "conformance": [{
              attempt: 1,
              sessionId: null,
              startedAt: new Date().toISOString(),
              endedAt: new Date().toISOString(),
              outcome: { verdict: "approved" as const, findingsPath: null, error: null },
            }],
          },
        };
      }
      throw new Error(`Unexpected: ${step.name}`);
    });

    const pipeline = new Pipeline({
      steps: new Map([
        ["code-review", makeStep("code-review")],
        ["code-fixer", makeStep("code-fixer", { completionVerdict: "approved" })],
        ["conformance", makeStep("conformance")],
      ]),
      transitions: [
        ...buildReviewerChainTransitions(["code-review"]),
        { step: "conformance", on: "approved", to: "end" as const },
      ],
      maxIterations: 2,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "code-review",
      loopNames: ["code-review"],
      loopFixerPairs: { "code-review": "code-fixer" },
    });

    const result = await pipeline.run("code-review", baseState, deps);

    // GREEN: budget has room → no budget-skip event
    expect(budgetSkippedEvents).toHaveLength(0);
    // GREEN: no warning entries for budget-skip
    const warningEntries = (result.history ?? []).filter(
      (h) => h.status === "warning" && (h.message ?? "").match(/omit|skip|fixable|budget/i),
    );
    expect(warningEntries).toHaveLength(0);
  });

  it("TC-013 (b): no budget-skipped event when code-review verdict is needs-fix (not approved)", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const events = new EventBus();

    const budgetSkippedEvents: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (events as any).on("pipeline:fixer:budget-skipped", (p: unknown) => {
      budgetSkippedEvents.push(p);
    });

    let codeReviewCallCount = 0;

    const executeSpy = vi.fn().mockImplementation(async (step: Step, currentState: JobState) => {
      if (step.name === "code-review") {
        codeReviewCallCount++;
        return {
          ...currentState,
          steps: {
            ...currentState.steps,
            "code-review": [
              ...(currentState.steps?.["code-review"] ?? []),
              makeCodeReviewNeedsFixRun(codeReviewCallCount),
            ],
          },
        };
      }
      if (step.name === "code-fixer") return currentState;
      throw new Error(`Unexpected: ${step.name}`);
    });

    const pipeline = new Pipeline({
      steps: new Map([
        ["code-review", makeStep("code-review")],
        ["code-fixer", makeStep("code-fixer", { completionVerdict: "approved" })],
      ]),
      transitions: buildReviewerChainTransitions(["code-review"]),
      maxIterations: 2,
      executor: { execute: executeSpy } as unknown as StepExecutor,
      events,
      loopName: "code-review",
      loopNames: ["code-review"],
      loopFixerPairs: { "code-review": "code-fixer" },
    });

    const result = await pipeline.run("code-review", baseState, deps);

    // GREEN: needs-fix escalation path → no budget-skip event
    expect(budgetSkippedEvents).toHaveLength(0);
    expect(result.error?.code).toBe("CODE_REVIEW_RETRIES_EXHAUSTED");
  });
});

// ===========================================================================
// TC-014: 再 routing 無効化で TC-001 が escalation で落ちる（破壊確認）
// ===========================================================================

describe("TC-014: destruction confirmation — TC-001 fails with CODE_REVIEW_RETRIES_EXHAUSTED when T-03 re-routing is absent", () => {
  /**
   * Source: tasks.md > T-05
   * Priority: must
   *
   * This test documents the CURRENT (pre-fix) behavior. It serves as evidence that
   * TC-001 is testing a real behavior change (not a vacuous assertion).
   *
   * After T-03 is implemented:
   * - TC-001 PASSES (no escalation)
   * - This test (TC-014) will FAIL (expects escalation, but T-03 prevents it)
   *
   * At that point, TC-014 should be REMOVED or marked skip — its purpose (destruction
   * confirmation) is fulfilled by TC-001 being a meaningful test.
   *
   * REPRODUCTION STEPS (for TC-014 to reproduce TC-001's failure post-T-03):
   *   1. Find the T-03 re-routing block in pipeline.ts runInternal()
   *      (the block between "transition resolved" at line ~366 and "episode-reset" at line ~418)
   *   2. Comment out the entire re-routing block
   *   3. Run: bun run test tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts
   *   4. TC-001 fails with: expected "awaiting-resume" to equal "awaiting-archive"
   *      and result.error.code === "CODE_REVIEW_RETRIES_EXHAUSTED"
   */

  // T-06 (approved-exhaustion update): TC-014 documented the pre-fix bug where approved
  // + fixable + budget exhausted caused CODE_REVIEW_RETRIES_EXHAUSTED escalation.
  // After T-03 is implemented TC-001 is green and this test's purpose is fulfilled.
  // Skipped per tasks.md T-06: "意味が変わる approved-exhaustion 系として期待を更新".
  it.skip("TC-014: current behavior without T-03 — approved + fixable + budget exhausted → CODE_REVIEW_RETRIES_EXHAUSTED [SUPERSEDED BY TC-001]", async () => {
    const baseState = makeMinimalState();
    const deps = makeMinimalDeps();
    const { pipeline } = buildStandardScenarioPipeline(baseState);

    // This is what CURRENTLY happens (T-03 not yet implemented):
    // The pipeline escalates because fixer budget is exhausted.
    const result = await pipeline.run("code-review", baseState, deps);

    // GREEN now (pre-fix), FAILS after T-03 is merged.
    // This test is intentionally inverted: it documents the bug, not the fix.
    // Once TC-001 is green, this test should be deleted (its purpose is fulfilled).
    expect(result.status).toBe("awaiting-resume");
    expect(result.error?.code).toBe("CODE_REVIEW_RETRIES_EXHAUSTED");
  });
});

// ===========================================================================
// TC-015: 既存テスト群が無変更で green かつ typecheck && test が通る
// ===========================================================================

describe("TC-015: backward compatibility — transition table and verdict derivation are not modified", () => {
  /**
   * Source: tasks.md > T-06
   * Priority: must
   *
   * Static checks that the invariants specified in T-06 are maintained:
   * - buildReviewerChainTransitions still includes approved→code-fixer row
   * - LOOP_ERROR_CODES code-review message is unchanged
   * - buildParallelReviewerTransitions still includes approved→coordinator and needs-fix rows
   */

  it("TC-015: buildReviewerChainTransitions still has code-review/approved+fixable → code-fixer row", () => {
    const transitions = buildReviewerChainTransitions(["code-review"]);
    const findingsRow = transitions.find(
      (t) => t.step === "code-review" && t.on === "approved" && t.when !== undefined && t.to === "code-fixer",
    );
    expect(findingsRow).toBeDefined();
  });

  it("TC-015: LOOP_ERROR_CODES code-review message contains 'did not approve'", async () => {
    const { LOOP_ERROR_CODES } = await import("../../../src/core/pipeline/types.js");
    const shape = LOOP_ERROR_CODES["code-review"];
    expect(shape).toBeDefined();
    expect(shape?.message(2)).toContain("did not approve");
    expect(shape?.code).toBe("CODE_REVIEW_RETRIES_EXHAUSTED");
  });

  it("TC-015: buildParallelReviewerTransitions code-review needs-fix → code-fixer row unchanged", () => {
    const transitions = buildParallelReviewerTransitions({ coordinator: "custom-reviewers", members: [] });
    const needsFixRow = transitions.find(
      (t) => t.step === "code-review" && t.on === "needs-fix" && t.to === "code-fixer",
    );
    expect(needsFixRow).toBeDefined();
  });

  it("TC-015: buildReviewerChainTransitions needs-fix → code-fixer row unchanged", () => {
    const transitions = buildReviewerChainTransitions(["code-review"]);
    const needsFixRow = transitions.find(
      (t) => t.step === "code-review" && t.on === "needs-fix" && t.to === "code-fixer",
    );
    expect(needsFixRow).toBeDefined();
  });
});
