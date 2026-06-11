/**
 * Unit tests for the regression-gate step factory (T-04).
 *
 * Verifies:
 * - reportTool === JUDGE_REPORT_TOOL (singleton identity)
 * - reads() does not require reviewer result files (only gitState)
 * - writes() / resultFilePath() resolve to regression-gate-result-NNN.md
 * - buildMessage with empty ledger contains "empty" notice
 * - buildMessage with non-empty ledger contains finding titles/files
 */
import { describe, it, expect } from "vitest";
import { createRegressionGateStep, REGRESSION_GATE_STEP_NAME } from "../regression-gate.js";
import { JUDGE_REPORT_TOOL } from "../report-tool.js";
import { resolveReviewerResultPath } from "../../../util/paths.js";
import type { JobState } from "../../../state/schema.js";
import type { StepDeps } from "../types.js";
import type { StepRun } from "../../../state/schema.js";
import type { Finding } from "../../../kernel/report-result.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type: "bug-fix", slug: "s" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: REGRESSION_GATE_STEP_NAME,
    status: "running",
    branch: "feat/s-abc",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeDeps(slugOverride = "test-slug"): StepDeps {
  return {
    slug: slugOverride,
    request: { type: "bug-fix", title: "Test", slug: slugOverride, baseBranch: "main", content: "Test content", adr: false },
    dynamicContext: undefined,
  } as unknown as StepDeps;
}

function makeStepRun(findings: Finding[]): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    startedAt: "2026-01-01T00:01:00Z",
    endedAt: "2026-01-01T00:01:30Z",
    outcome: {
      verdict: "needs-fix",
      findingsPath: null,
      error: null,
      toolResult: { ok: true, findings },
    },
  };
}

function makeFixableFinding(file = "src/foo.ts", title = "Test Issue"): Finding {
  return {
    severity: "high",
    resolution: "fixable",
    file,
    title,
    rationale: "Should be fixed",
  };
}

// ---------------------------------------------------------------------------
// T-04: step identity
// ---------------------------------------------------------------------------

describe("createRegressionGateStep — identity", () => {
  it("reportTool === JUDGE_REPORT_TOOL (singleton identity)", () => {
    const step = createRegressionGateStep();
    expect(step.reportTool).toBe(JUDGE_REPORT_TOOL);
  });

  it("step.name === REGRESSION_GATE_STEP_NAME", () => {
    const step = createRegressionGateStep();
    expect(step.name).toBe(REGRESSION_GATE_STEP_NAME);
  });
});

// ---------------------------------------------------------------------------
// T-04: reads() — no required reviewer result files
// ---------------------------------------------------------------------------

describe("createRegressionGateStep — reads()", () => {
  it("reads() returns only gitState (no required reviewer result files)", () => {
    const step = createRegressionGateStep();
    const state = makeJobState();
    const deps = makeDeps();
    const refs = step.reads!(state, deps);

    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ artifact: "gitState" });
  });

  it("reads() does not contain any required file paths to reviewer results", () => {
    const step = createRegressionGateStep();
    const state = makeJobState();
    const deps = makeDeps();
    const refs = step.reads!(state, deps);

    const fileRefs = refs.filter((r) => r.artifact !== "gitState");
    expect(fileRefs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T-04: writes() / resultFilePath()
// ---------------------------------------------------------------------------

describe("createRegressionGateStep — writes() / resultFilePath()", () => {
  it("writes() returns regression-gate-result-001.md for first iteration", () => {
    const step = createRegressionGateStep();
    const state = makeJobState();
    const deps = makeDeps("my-slug");
    const refs = step.writes!(state, deps);

    const expected = resolveReviewerResultPath("my-slug", REGRESSION_GATE_STEP_NAME, 1);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.path).toBe(expected);
    expect(refs[0]!.path).toContain("regression-gate-result-001.md");
  });

  it("resultFilePath() returns regression-gate-result-001.md for first iteration", () => {
    const step = createRegressionGateStep();
    const state = makeJobState();
    const deps = makeDeps("my-slug");

    const path = step.resultFilePath(state, deps);
    expect(path).toBe(resolveReviewerResultPath("my-slug", REGRESSION_GATE_STEP_NAME, 1));
    expect(path).toContain("regression-gate-result-001.md");
  });

  it("resultFilePath() increments on second iteration", () => {
    const step = createRegressionGateStep();
    // Simulate one past run
    const state = makeJobState({
      steps: {
        [REGRESSION_GATE_STEP_NAME]: [makeStepRun([])],
      },
    });
    const deps = makeDeps("my-slug");

    const path = step.resultFilePath(state, deps);
    expect(path).toContain("regression-gate-result-002.md");
  });
});

// ---------------------------------------------------------------------------
// T-04: buildMessage with empty ledger
// ---------------------------------------------------------------------------

describe("createRegressionGateStep — buildMessage (empty ledger)", () => {
  it("message contains empty-ledger notice when no fixable findings in state", () => {
    const step = createRegressionGateStep();
    const state = makeJobState(); // no steps with findings
    const deps = makeDeps("my-slug");

    const msg = step.buildMessage(state, deps);
    expect(msg).toMatch(/ledger is empty|No fixable findings|empty findings/i);
  });

  it("message contains result file path", () => {
    const step = createRegressionGateStep();
    const state = makeJobState();
    const deps = makeDeps("my-slug");

    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("regression-gate-result-001.md");
  });
});

// ---------------------------------------------------------------------------
// T-04: buildMessage with non-empty ledger
// ---------------------------------------------------------------------------

describe("createRegressionGateStep — buildMessage (non-empty ledger)", () => {
  it("message contains finding titles from ledger", () => {
    const step = createRegressionGateStep();
    const finding = makeFixableFinding("src/auth.ts", "Hardcoded secret");
    const state = makeJobState({
      steps: {
        "code-review": [makeStepRun([finding])],
      },
    });
    const deps = makeDeps("my-slug");

    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("Hardcoded secret");
  });

  it("message contains finding file paths from ledger", () => {
    const step = createRegressionGateStep();
    const finding = makeFixableFinding("src/auth.ts", "Hardcoded secret");
    const state = makeJobState({
      steps: {
        "code-review": [makeStepRun([finding])],
      },
    });
    const deps = makeDeps("my-slug");

    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("src/auth.ts");
  });

  it("message contains findings from multiple reviewer steps", () => {
    const step = createRegressionGateStep();
    const crFinding = makeFixableFinding("src/a.ts", "CR Issue");
    const secFinding = makeFixableFinding("src/b.ts", "Security Issue");
    const state = makeJobState({
      reviewers: [{ name: "security", maxIterations: 3, purpose: "p", criteria: "c", judgment: "j", freeText: "" }],
      steps: {
        "code-review": [makeStepRun([crFinding])],
        "security": [makeStepRun([secFinding])],
      },
    });
    const deps = makeDeps("my-slug");

    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("CR Issue");
    expect(msg).toContain("Security Issue");
  });
});

// ---------------------------------------------------------------------------
// T-04: parseResult
// ---------------------------------------------------------------------------

describe("createRegressionGateStep — parseResult", () => {
  it("parseResult returns { verdict: null, findingsPath: null }", () => {
    const step = createRegressionGateStep();
    const deps = makeDeps();
    const result = step.parseResult("any content", deps);
    expect(result).toEqual({ verdict: null, findingsPath: null });
  });
});
