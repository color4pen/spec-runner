/**
 * Unit tests for io-iteration helpers
 * T-01: nextIteration / latestIteration are equivalent to existing inline formulas
 */
import { describe, it, expect } from "vitest";
import { nextIteration, latestIteration } from "../../../src/core/step/io-iteration.js";
import type { JobState } from "../../../src/state/schema.js";

function makeState(stepCounts: Record<string, number> = {}): JobState {
  const steps: JobState["steps"] = {};
  for (const [name, count] of Object.entries(stepCounts)) {
    steps[name] = Array.from({ length: count }, (_, i) => ({
      attempt: i + 1,
      sessionId: null,
      outcome: { verdict: null, findingsPath: null, error: null },
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T00:00:00.000Z",
    }));
  }
  return {
    version: 1,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "init",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps,
  };
}

describe("nextIteration", () => {
  it("returns 1 when step has never run", () => {
    const state = makeState({});
    expect(nextIteration(state, "code-review")).toBe(1);
  });

  it("returns 2 when step has run once", () => {
    const state = makeState({ "code-review": 1 });
    expect(nextIteration(state, "code-review")).toBe(2);
  });

  it("returns 3 when step has run twice", () => {
    const state = makeState({ "code-review": 2 });
    expect(nextIteration(state, "code-review")).toBe(3);
  });

  it("matches inline formula: (steps.length ?? 0) + 1", () => {
    for (let count = 0; count <= 5; count++) {
      const state = makeState({ "spec-review": count });
      const inline = (state.steps?.["spec-review"]?.length ?? 0) + 1;
      expect(nextIteration(state, "spec-review")).toBe(inline);
    }
  });

  it("returns 1 when steps is undefined", () => {
    const state = makeState();
    // Simulate missing steps key
    (state as unknown as Record<string, unknown>)["steps"] = undefined;
    expect(nextIteration(state, "verification")).toBe(1);
  });
});

describe("latestIteration", () => {
  it("returns 0 when step has never run", () => {
    const state = makeState({});
    expect(latestIteration(state, "code-review")).toBe(0);
  });

  it("returns 1 when step has run once", () => {
    const state = makeState({ "code-review": 1 });
    expect(latestIteration(state, "code-review")).toBe(1);
  });

  it("returns 2 when step has run twice", () => {
    const state = makeState({ "code-review": 2 });
    expect(latestIteration(state, "code-review")).toBe(2);
  });

  it("matches inline formula: steps.length ?? 0", () => {
    for (let count = 0; count <= 5; count++) {
      const state = makeState({ "conformance": count });
      const inline = state.steps?.["conformance"]?.length ?? 0;
      expect(latestIteration(state, "conformance")).toBe(inline);
    }
  });

  it("returns 0 when steps is undefined", () => {
    const state = makeState();
    (state as unknown as Record<string, unknown>)["steps"] = undefined;
    expect(latestIteration(state, "spec-review")).toBe(0);
  });
});

describe("nextIteration vs latestIteration equivalence to existing formulas", () => {
  it("nextIteration matches computeCodeReviewIteration formula", () => {
    // From code-review.ts: (state.steps?.[STEP_NAMES.CODE_REVIEW]?.length ?? 0) + 1
    const state = makeState({ "code-review": 3 });
    const formula = (state.steps?.["code-review"]?.length ?? 0) + 1;
    expect(nextIteration(state, "code-review")).toBe(formula);
  });

  it("nextIteration matches computeSpecReviewIteration formula", () => {
    // From spec-review.ts: (state.steps?.[STEP_NAMES.SPEC_REVIEW]?.length ?? 0) + 1
    const state = makeState({ "spec-review": 2 });
    const formula = (state.steps?.["spec-review"]?.length ?? 0) + 1;
    expect(nextIteration(state, "spec-review")).toBe(formula);
  });

  it("latestIteration correctly identifies producer's most recent output", () => {
    // code-fixer reads review-feedback-{latest}.md where latest = code-review run count
    const state = makeState({ "code-review": 2 });
    // latest iteration = 2 → review-feedback-002.md
    expect(latestIteration(state, "code-review")).toBe(2);
  });
});
