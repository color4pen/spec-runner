/**
 * TC-001: 非免除 type は spec-review 承認から implementer へ直行する
 * TC-002: 免除 type も spec-review 承認から implementer へ直行する
 * TC-003: 遷移表に test-materialize 行が存在しない
 * TC-004: spec-fixer の観測 auto-fix は implementer へ forward する
 * TC-012: 免除 type は test-case-gen と bite-evidence を通らない
 *
 * Source: spec.md > Requirement: spec-phase 承認は全 type で implementer へ収束する
 *         spec.md > Requirement: test-gen 免除の制御対象は 2 箇所に縮退する
 */
import { describe, it, expect } from "vitest";
import { STANDARD_TRANSITIONS } from "../types.js";
import { STEP_NAMES } from "../../step/step-names.js";
import { isTestGenExempt } from "../test-gen-exemption.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(type: string, extra?: Partial<Pick<JobState, "steps">>): JobState {
  return {
    request: { path: "/test/request.md", title: "Test", type, slug: "test" },
    repository: { owner: "testowner", name: "testrepo" },
    version: 2,
    jobId: "test-job",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    session: null,
    step: "init",
    status: "running",
    branch: null,
    history: [],
    error: null,
    ...extra,
  } as unknown as JobState;
}

type Transition = (typeof STANDARD_TRANSITIONS)[number];

function resolveNext(
  transitions: readonly Transition[],
  step: string,
  on: string,
  state: JobState,
): string | undefined {
  return transitions.find(
    (t) => t.step === step && t.on === on && (!t.when || t.when(state)),
  )?.to;
}

// ---------------------------------------------------------------------------
// TC-001: 非免除 type は spec-review 承認から implementer へ直行する
// Source: spec.md > Requirement: spec-phase 承認は全 type で implementer へ収束する
//         > Scenario: 非免除 type は spec-review 承認から implementer へ直行する
// ---------------------------------------------------------------------------

describe("TC-001: non-exempt types resolve SPEC_REVIEW/approved to implementer", () => {
  const nonExemptTypes = ["new-feature", "spec-change", "refactoring", "bug-fix"] as const;

  for (const type of nonExemptTypes) {
    it(`TC-001: ${type} resolves SPEC_REVIEW/approved to implementer (not test-materialize)`, () => {
      const state = makeState(type);
      const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.SPEC_REVIEW, "approved", state);
      expect(next).toBe(STEP_NAMES.IMPLEMENTER);
      expect(next).not.toBe("test-materialize");
    });
  }
});

// ---------------------------------------------------------------------------
// TC-002: 免除 type も spec-review 承認から implementer へ直行する
// Source: spec.md > Requirement: spec-phase 承認は全 type で implementer へ収束する
//         > Scenario: 免除 type も spec-review 承認から implementer へ直行する
// ---------------------------------------------------------------------------

describe("TC-002: exempt type (chore) resolves SPEC_REVIEW/approved to implementer", () => {
  it("TC-002: chore resolves SPEC_REVIEW/approved to implementer", () => {
    const state = makeState("chore");
    const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.SPEC_REVIEW, "approved", state);
    expect(next).toBe(STEP_NAMES.IMPLEMENTER);
  });

  it("TC-002: isTestGenExempt returns true for chore", () => {
    const state = makeState("chore");
    expect(isTestGenExempt(state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-003: 遷移表に test-materialize 行が存在しない
// Source: spec.md > Requirement: spec-phase 承認は全 type で implementer へ収束する
//         > Scenario: 遷移表に test-materialize 行が存在しない
// ---------------------------------------------------------------------------

describe("TC-003: STANDARD_TRANSITIONS has no test-materialize rows", () => {
  it("TC-003: no transition has step === 'test-materialize'", () => {
    const rows = STANDARD_TRANSITIONS.filter((t) => t.step === "test-materialize");
    expect(rows).toHaveLength(0);
  });

  it("TC-003: no transition has to === 'test-materialize'", () => {
    const rows = STANDARD_TRANSITIONS.filter((t) => t.to === "test-materialize");
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-004: spec-fixer の観測 auto-fix は implementer へ forward する
// Source: spec.md > Requirement: spec-phase 承認は全 type で implementer へ収束する
//         > Scenario: spec-fixer の観測 auto-fix は implementer へ forward する
// ---------------------------------------------------------------------------

describe("TC-004: SPEC_FIXER observation auto-fix resolves to implementer", () => {
  // spec-fixer observation forward: spec-review approved + conformance is NOT the origin
  // specFixerObservationForward predicate: spec-review has approved verdict
  function makeStateWithSpecReviewApproved(type: string): JobState {
    return makeState(type, {
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "approved", findingsPath: null, error: null },
            startedAt: "2024-01-01T00:00:00.000Z",
            endedAt: "2024-01-01T00:01:00.000Z",
          } as unknown as import("../../../state/schema.js").StepRun,
        ],
      },
    });
  }

  it("TC-004: bug-fix SPEC_FIXER/approved (observation auto-fix) resolves to implementer", () => {
    // With spec-review approved, observation forward should route to implementer
    const state = makeStateWithSpecReviewApproved("bug-fix");
    const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.SPEC_FIXER, "approved", state);
    expect(next).toBe(STEP_NAMES.IMPLEMENTER);
    expect(next).not.toBe("test-materialize");
  });

  it("TC-004: new-feature SPEC_FIXER/approved (observation auto-fix) resolves to implementer", () => {
    const state = makeStateWithSpecReviewApproved("new-feature");
    const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.SPEC_FIXER, "approved", state);
    expect(next).toBe(STEP_NAMES.IMPLEMENTER);
  });

  it("TC-004: chore SPEC_FIXER/approved (observation auto-fix) resolves to implementer", () => {
    const state = makeStateWithSpecReviewApproved("chore");
    const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.SPEC_FIXER, "approved", state);
    expect(next).toBe(STEP_NAMES.IMPLEMENTER);
  });

  it("TC-004: no SPEC_FIXER transition goes to test-materialize", () => {
    const rows = STANDARD_TRANSITIONS.filter(
      (t) => t.step === STEP_NAMES.SPEC_FIXER && t.to === "test-materialize",
    );
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-012: 免除 type は test-case-gen と bite-evidence を通らない
// Source: spec.md > Requirement: test-gen 免除の制御対象は 2 箇所に縮退する
//         > Scenario: 免除 type は test-case-gen と bite-evidence を通らない
// ---------------------------------------------------------------------------

describe("TC-012: exempt type (chore) bypasses test-case-gen and bite-evidence", () => {
  it("TC-012: chore DESIGN/success resolves to spec-review (bypasses test-case-gen)", () => {
    const state = makeState("chore");
    const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.DESIGN, "success", state);
    expect(next).toBe(STEP_NAMES.SPEC_REVIEW);
    expect(next).not.toBe(STEP_NAMES.TEST_CASE_GEN);
  });

  it("TC-012: chore IMPLEMENTER/success resolves to verification (bypasses bite-evidence)", () => {
    const state = makeState("chore");
    const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.IMPLEMENTER, "success", state);
    expect(next).toBe(STEP_NAMES.VERIFICATION);
    expect(next).not.toBe(STEP_NAMES.BITE_EVIDENCE);
  });

  it("TC-012: non-exempt bug-fix DESIGN/success resolves to test-case-gen (unchanged)", () => {
    const state = makeState("bug-fix");
    const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.DESIGN, "success", state);
    expect(next).toBe(STEP_NAMES.TEST_CASE_GEN);
  });

  it("TC-012: non-exempt bug-fix IMPLEMENTER/success resolves to bite-evidence (unchanged)", () => {
    const state = makeState("bug-fix");
    const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.IMPLEMENTER, "success", state);
    expect(next).toBe(STEP_NAMES.BITE_EVIDENCE);
  });
});
