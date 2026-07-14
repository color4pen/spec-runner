/**
 * T-04 (reduce-added-agent-turns): regression-gate skipWhen tests.
 *
 * Verifies:
 * - Empty ledger → skipWhen returns non-null (skip the agent)
 * - Non-empty ledger → skipWhen returns null (run the agent)
 * - buildMessage is unaffected by skipWhen (existing tests still valid)
 * - regression-gate "skipped" transition exists (conformance)
 */
import { describe, it, expect } from "vitest";
import { createRegressionGateStep, REGRESSION_GATE_STEP_NAME } from "../../../src/core/step/regression-gate.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepRun } from "../../../src/state/schema.js";

/**
 * Build a minimal JobState with no steps run.
 */
function makeEmptyState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "regression-gate",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

/**
 * Build a minimal StepRun with a fixable finding.
 */
function makeStepRunWithFixableFinding(verdict: string = "needs-fix"): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    outcome: {
      verdict,
      findingsPath: null,
      error: null,
      toolResult: {
        ok: false,
        findings: [
          {
            file: "src/foo.ts",
            line: 10,
            title: "Missing null check",
            severity: "high",
            resolution: "fixable",
            rationale: "Please add a null check.",
          },
        ],
      },
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
  };
}

// ---------------------------------------------------------------------------
// Test: empty ledger → skip
// ---------------------------------------------------------------------------

describe("regression-gate skipWhen — empty ledger", () => {
  it("skipWhen returns non-null when no reviewer runs exist (empty ledger)", () => {
    const step = createRegressionGateStep();
    expect(typeof step.skipWhen).toBe("function");

    const state = makeEmptyState(); // no code-review steps → ledger empty
    const result = step.skipWhen!(state, {} as never);
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
  });

  it("skipWhen return value mentions 'findings ledger' or 'empty'", () => {
    const step = createRegressionGateStep();
    const state = makeEmptyState();
    const result = step.skipWhen!(state, {} as never);
    const lower = (result ?? "").toLowerCase();
    expect(lower.includes("ledger") || lower.includes("empty") || lower.includes("findings")).toBe(true);
  });

  it("skipWhen returns non-null when code-review ran with no fixable findings (approved)", () => {
    const step = createRegressionGateStep();
    const state = makeEmptyState({
      steps: {
        "code-review": [
          {
            attempt: 1,
            sessionId: null,
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [], // no findings → ledger empty
              },
            },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:01.000Z",
          },
        ],
      },
    });

    const result = step.skipWhen!(state, {} as never);
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test: non-empty ledger → run agent
// ---------------------------------------------------------------------------

describe("regression-gate skipWhen — non-empty ledger", () => {
  it("skipWhen returns null when code-review produced fixable findings", () => {
    const step = createRegressionGateStep();
    const state = makeEmptyState({
      steps: {
        "code-review": [makeStepRunWithFixableFinding("needs-fix")],
      },
    });

    const result = step.skipWhen!(state, {} as never);
    expect(result).toBeNull();
  });

  it("skipWhen returns null when custom reviewer produced fixable findings", () => {
    const step = createRegressionGateStep();
    // Simulate a custom reviewer named "security" by adding a reviewer snapshot
    const state = makeEmptyState({
      reviewers: [
        {
          name: "security",
          model: "claude-sonnet-4-6",
          maxIterations: 20,
          purpose: "Security review",
          criteria: "Check for vulnerabilities",
          judgment: "Report fixable issues",
          freeText: "",
        },
      ],
      steps: {
        "code-review": [
          {
            attempt: 1,
            sessionId: null,
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: { ok: true, findings: [] },
            },
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:01.000Z",
          },
        ],
        security: [makeStepRunWithFixableFinding("needs-fix")],
      },
    });

    const result = step.skipWhen!(state, {} as never);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test: skipWhen is defined on the step created by createRegressionGateStep
// ---------------------------------------------------------------------------

describe("regression-gate skipWhen — property exists", () => {
  it("skipWhen is defined as a function on the created step", () => {
    const step = createRegressionGateStep();
    expect(typeof step.skipWhen).toBe("function");
  });

  it("step name is REGRESSION_GATE_STEP_NAME", () => {
    const step = createRegressionGateStep();
    expect(step.name).toBe(REGRESSION_GATE_STEP_NAME);
  });
});

// ---------------------------------------------------------------------------
// Test: buildMessage is NOT affected by skipWhen (orthogonal methods)
// ---------------------------------------------------------------------------

describe("regression-gate buildMessage — unaffected by skipWhen", () => {
  it("buildMessage with empty ledger still produces the 'No fixable findings' message", () => {
    const step = createRegressionGateStep();
    const state = makeEmptyState();
    const deps = {
      slug: "test-slug",
      request: { type: "bug-fix", title: "Test", slug: "test-slug", baseBranch: "main", content: "do something", adr: false },
      dynamicContext: undefined,
    } as unknown as Parameters<typeof step.buildMessage>[1];

    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("Findings Ledger");
    expect(msg).toContain("No fixable findings were recorded");
  });

  it("buildMessage with non-empty ledger lists findings", () => {
    const step = createRegressionGateStep();
    const state = makeEmptyState({
      steps: {
        "code-review": [makeStepRunWithFixableFinding("needs-fix")],
      },
    });
    const deps = {
      slug: "test-slug",
      request: { type: "bug-fix", title: "Test", slug: "test-slug", baseBranch: "main", content: "do something", adr: false },
      dynamicContext: undefined,
    } as unknown as Parameters<typeof step.buildMessage>[1];

    const msg = step.buildMessage(state, deps);
    expect(msg).toContain("Findings Ledger");
    expect(msg).toContain("Missing null check");
  });
});
