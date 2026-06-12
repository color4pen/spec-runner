/**
 * Backward-compat resume tests for conformance (T-12)
 *
 * TC-CONFRES-01: old-format state (plain needs-fix, no fixTarget) resumes without error
 * TC-CONFRES-02: old-format state — getConformanceFixContext returns null (no misinjection)
 * TC-CONFRES-03: state with no conformance run — getConformanceFixContext returns null
 */
import { describe, it, expect } from "vitest";
import { getConformanceFixContext } from "../../../../src/core/step/fixer-helpers.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-resume-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "implementer",
    status: "awaiting-resume",
    branch: "fix/test",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

// Old-format run: plain needs-fix verdict, no toolResult, no fixTarget
const oldFormatRun: StepRun = {
  attempt: 1,
  sessionId: null,
  outcome: {
    verdict: "needs-fix" as import("../../../../src/state/schema.js").Verdict,
    findingsPath: "specrunner/changes/test/conformance-result-001.md",
    error: null,
    // no toolResult (legacy)
  },
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:00:00.000Z",
};

// TC-CONFRES-01: resume with old state doesn't throw
describe("TC-CONFRES-01: old-format state does not throw on resume", () => {
  it("getConformanceFixContext handles old-format run without throwing", () => {
    const state = makeState({
      steps: { conformance: [oldFormatRun] },
    });
    // Must not throw
    expect(() => getConformanceFixContext(state, "implementer")).not.toThrow();
    expect(() => getConformanceFixContext(state, "code-fixer")).not.toThrow();
    expect(() => getConformanceFixContext(state, "spec-fixer")).not.toThrow();
  });
});

// TC-CONFRES-02: old-format state — getConformanceFixContext returns null (no misinjection)
describe("TC-CONFRES-02: old-format state returns null (no misinjection)", () => {
  it("returns null for all stepNames with old-format conformance run", () => {
    const state = makeState({
      steps: { conformance: [oldFormatRun] },
    });
    expect(getConformanceFixContext(state, "implementer")).toBeNull();
    expect(getConformanceFixContext(state, "code-fixer")).toBeNull();
    expect(getConformanceFixContext(state, "spec-fixer")).toBeNull();
  });

  it("returns null when conformance run has toolResult but plain needs-fix verdict", () => {
    const runWithToolResult: StepRun = {
      attempt: 1,
      sessionId: null,
      outcome: {
        verdict: "needs-fix" as import("../../../../src/state/schema.js").Verdict,
        findingsPath: null,
        error: null,
        toolResult: {
          ok: true,
          findings: [{ severity: "high", resolution: "fixable", file: "src/f.ts", title: "T", rationale: "R" }],
        } as unknown as StepRun["outcome"]["toolResult"],
      },
      startedAt: "2026-01-02T00:00:00.000Z",
      endedAt: "2026-01-02T00:00:00.000Z",
    };
    const state = makeState({ steps: { conformance: [runWithToolResult] } });
    expect(getConformanceFixContext(state, "implementer")).toBeNull();
  });
});

// TC-CONFRES-03: no conformance run at all → null
describe("TC-CONFRES-03: no conformance run → null for all fixer steps", () => {
  it("returns null when steps.conformance is absent", () => {
    const state = makeState({ steps: {} });
    expect(getConformanceFixContext(state, "implementer")).toBeNull();
    expect(getConformanceFixContext(state, "code-fixer")).toBeNull();
    expect(getConformanceFixContext(state, "spec-fixer")).toBeNull();
  });

  it("returns null when steps.conformance is empty array", () => {
    const state = makeState({ steps: { conformance: [] } });
    expect(getConformanceFixContext(state, "implementer")).toBeNull();
  });
});
