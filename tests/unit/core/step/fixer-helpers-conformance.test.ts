/**
 * Unit tests for getConformanceFixContext (T-09)
 *
 * TC-CFCTX-01: conformance → code-fixer with valid state returns findings
 * TC-CFCTX-02: conformance → spec-fixer with spec-review newer → returns null (reviewer-triggered)
 * TC-CFCTX-03: conformance absent → null
 * TC-CFCTX-04: verdict is plain needs-fix → null
 * TC-CFCTX-05: target mismatch → null
 * TC-CFCTX-06: conformance has no toolResult → null
 * TC-CFCTX-07: conformance → implementer with valid state returns findings
 * TC-CFCTX-08: old state (no fixTarget, plain needs-fix) → null (backward compat)
 */
import { describe, it, expect } from "vitest";
import { getConformanceFixContext } from "../../../../src/core/step/fixer-helpers.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";
import type { Finding } from "../../../../src/kernel/report-result.js";

const CONFORMANCE = "conformance";
const CODE_FIXER = "code-fixer";
const SPEC_FIXER = "spec-fixer";
const IMPLEMENTER = "implementer";
const CODE_REVIEW = "code-review";
const SPEC_REVIEW = "spec-review";

const EARLIER = "2026-01-01T00:00:00.000Z";
const LATER   = "2026-01-02T00:00:00.000Z";
const LATEST  = "2026-01-03T00:00:00.000Z";

const sampleFindings: Finding[] = [
  { severity: "high", resolution: "fixable", file: "src/foo.ts", title: "Issue", rationale: "Fix it", fixTarget: "code-fixer" },
];

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job",
    createdAt: EARLIER,
    updatedAt: EARLIER,
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "conformance",
    status: "running",
    branch: "fix/test",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeStepRun(verdict: string, endedAt: string, findings?: Finding[]): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    outcome: {
      verdict: verdict as import("../../../../src/state/schema.js").Verdict,
      findingsPath: null,
      error: null,
      ...(findings !== undefined
        ? { toolResult: { ok: true, findings } as unknown as StepRun["outcome"]["toolResult"] }
        : {}),
    },
    startedAt: endedAt,
    endedAt,
  };
}

// ---------------------------------------------------------------------------
// TC-CFCTX-01: conformance → code-fixer — valid state returns findings
// ---------------------------------------------------------------------------
describe("TC-CFCTX-01: conformance → code-fixer returns findings", () => {
  it("returns conformance findings when verdict matches code-fixer and conformance is newer", () => {
    const state = makeState({
      steps: {
        [CODE_REVIEW]: [makeStepRun("approved", EARLIER)],
        [CONFORMANCE]: [makeStepRun("needs-fix:code-fixer", LATEST, sampleFindings)],
      },
    });
    const result = getConformanceFixContext(state, CODE_FIXER);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result?.[0]?.fixTarget).toBe("code-fixer");
  });
});

// ---------------------------------------------------------------------------
// TC-CFCTX-02: spec-review ran after conformance → null (reviewer-triggered entry)
// ---------------------------------------------------------------------------
describe("TC-CFCTX-02: spec-review newer than conformance → null for spec-fixer", () => {
  it("returns null when spec-review ran after conformance (second cycle, reviewer-triggered)", () => {
    const state = makeState({
      steps: {
        // conformance ran, then spec-review ran (second round), then spec-fixer entered
        [CONFORMANCE]: [makeStepRun("needs-fix:spec-fixer", EARLIER, sampleFindings)],
        [SPEC_REVIEW]: [makeStepRun("needs-fix", LATER)],
      },
    });
    const result = getConformanceFixContext(state, SPEC_FIXER);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-CFCTX-03: conformance absent → null
// ---------------------------------------------------------------------------
describe("TC-CFCTX-03: conformance absent → null", () => {
  it("returns null when conformance has never run", () => {
    const state = makeState({ steps: {} });
    expect(getConformanceFixContext(state, CODE_FIXER)).toBeNull();
    expect(getConformanceFixContext(state, SPEC_FIXER)).toBeNull();
    expect(getConformanceFixContext(state, IMPLEMENTER)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-CFCTX-04: verdict is plain needs-fix (legacy) → null
// ---------------------------------------------------------------------------
describe("TC-CFCTX-04: plain needs-fix verdict → null", () => {
  it("returns null for legacy plain needs-fix verdict", () => {
    const state = makeState({
      steps: {
        [CONFORMANCE]: [makeStepRun("needs-fix", LATEST, sampleFindings)],
      },
    });
    expect(getConformanceFixContext(state, IMPLEMENTER)).toBeNull();
    expect(getConformanceFixContext(state, CODE_FIXER)).toBeNull();
    expect(getConformanceFixContext(state, SPEC_FIXER)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-CFCTX-05: target mismatch → null
// ---------------------------------------------------------------------------
describe("TC-CFCTX-05: target mismatch → null", () => {
  it("returns null when verdict target does not match stepName", () => {
    const state = makeState({
      steps: {
        [CONFORMANCE]: [makeStepRun("needs-fix:spec-fixer", LATEST, sampleFindings)],
      },
    });
    // conformance says spec-fixer but we're asking for code-fixer
    expect(getConformanceFixContext(state, CODE_FIXER)).toBeNull();
    expect(getConformanceFixContext(state, IMPLEMENTER)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-CFCTX-06: conformance has no toolResult → null
// ---------------------------------------------------------------------------
describe("TC-CFCTX-06: conformance has no toolResult → null", () => {
  it("returns null when conformance run has no toolResult", () => {
    const run: StepRun = {
      attempt: 1,
      sessionId: null,
      outcome: {
        verdict: "needs-fix:code-fixer" as import("../../../../src/state/schema.js").Verdict,
        findingsPath: null,
        error: null,
        // no toolResult
      },
      startedAt: LATEST,
      endedAt: LATEST,
    };
    const state = makeState({ steps: { [CONFORMANCE]: [run] } });
    expect(getConformanceFixContext(state, CODE_FIXER)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-CFCTX-07: conformance → implementer
// ---------------------------------------------------------------------------
describe("TC-CFCTX-07: conformance → implementer returns findings", () => {
  it("returns findings when conformance routes to implementer and is newer than last implementer run", () => {
    const implFindings: Finding[] = [
      { severity: "high", resolution: "fixable", file: "src/impl.ts", title: "Missing impl", rationale: "Add it", fixTarget: "implementer" },
    ];
    const state = makeState({
      steps: {
        [IMPLEMENTER]: [makeStepRun("success", EARLIER)],
        [CONFORMANCE]: [makeStepRun("needs-fix:implementer", LATEST, implFindings)],
      },
    });
    const result = getConformanceFixContext(state, IMPLEMENTER);
    expect(result).not.toBeNull();
    expect(result?.[0]?.fixTarget).toBe("implementer");
  });

  it("returns null when implementer ran after conformance (first-time run from test-case-gen)", () => {
    const state = makeState({
      steps: {
        [CONFORMANCE]: [makeStepRun("needs-fix:implementer", EARLIER, sampleFindings)],
        [IMPLEMENTER]: [makeStepRun("success", LATEST)],
      },
    });
    // implementer ran after conformance → not a conformance-triggered entry
    expect(getConformanceFixContext(state, IMPLEMENTER)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-CFCTX-08: old-format state — plain needs-fix, no fixTarget → null (backward compat)
// ---------------------------------------------------------------------------
describe("TC-CFCTX-08: backward compat — old state without fixTarget → null", () => {
  it("old run with plain needs-fix and no toolResult returns null", () => {
    const oldRun: StepRun = {
      attempt: 1,
      sessionId: null,
      outcome: {
        verdict: "needs-fix" as import("../../../../src/state/schema.js").Verdict,
        findingsPath: "specrunner/changes/test/conformance-result-001.md",
        error: null,
      },
      startedAt: LATER,
      endedAt: LATER,
    };
    const state = makeState({ steps: { [CONFORMANCE]: [oldRun] } });
    expect(getConformanceFixContext(state, IMPLEMENTER)).toBeNull();
    expect(getConformanceFixContext(state, CODE_FIXER)).toBeNull();
    expect(getConformanceFixContext(state, SPEC_FIXER)).toBeNull();
  });
});
