/**
 * Tests for test-generation type-gate — pipeline transition routing.
 *
 * TC-004: chore は SPEC_REVIEW approved から IMPLEMENTER へ直行する
 * TC-005: chore は IMPLEMENTER success から VERIFICATION へ直行する
 * TC-006: chore の spec-fixer 観測修正は IMPLEMENTER へ forward される
 * TC-007: 非免除 type は SPEC_REVIEW approved から TEST_CASE_GEN へ遷移する (unchanged)
 * TC-012: STANDARD_TRANSITIONS で免除 row は unconditional TEST_CASE_GEN row より前に位置する
 * TC-015 (should): specFixerForwardsToImplementer は specFixerForwardsToTestGen が false のとき false を返す
 * TC-016 (should): FAST_TRANSITIONS は本変更による追加 row を含まない
 *
 * Source: spec.md > Requirement: 免除 type の pipeline はテスト生成工程を通らない
 *         design.md > D2, D3, tasks.md > T-02, T-03
 */
import { describe, it, expect } from "vitest";
import { STANDARD_TRANSITIONS, FAST_TRANSITIONS } from "../types.js";
import { STEP_NAMES } from "../../step/step-names.js";
import type { JobState } from "../../../state/schema.js";
// These imports will fail until the implementation exists (red tests intentional)
import {
  isTestGenExempt,
  specFixerForwardsToImplementer,
} from "../test-gen-exemption.js";

// ---------------------------------------------------------------------------
// Minimal state fixture helpers
// ---------------------------------------------------------------------------

/** Build a minimal JobState-shaped object for predicate testing. */
function makeState(type: string, extra?: Partial<Pick<JobState, "steps">>): JobState {
  return {
    request: { path: "/test/request.md", title: "Test", type },
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

/** Minimal state with spec-review approved (for specFixerForwardsToTestGen=true). */
function makeChoreStateWithSpecReviewApproved(): JobState {
  return makeState("chore", {
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

// ---------------------------------------------------------------------------
// First-match-wins resolver (mirrors pipeline.ts:363)
// ---------------------------------------------------------------------------

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
// TC-004: chore は SPEC_REVIEW approved から IMPLEMENTER へ直行する
// Source: spec.md > Scenario: chore は spec-review 承認から implementer へ直行
// ---------------------------------------------------------------------------
describe("TC-004: chore SPEC_REVIEW approved → IMPLEMENTER (direct)", () => {
  it("TC-004: chore state resolves SPEC_REVIEW/approved to implementer (bypasses test-case-gen)", () => {
    const choreState = makeState("chore");
    const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.SPEC_REVIEW, "approved", choreState);
    expect(next).toBe(STEP_NAMES.IMPLEMENTER);
    expect(next).not.toBe(STEP_NAMES.TEST_CASE_GEN);
  });

  it("TC-004: isTestGenExempt returns true for chore", () => {
    const choreState = makeState("chore");
    expect(isTestGenExempt(choreState)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-005: chore は IMPLEMENTER success から VERIFICATION へ直行する
// Source: spec.md > Scenario: chore は implementer 成功から verification へ直行
// ---------------------------------------------------------------------------
describe("TC-005: chore IMPLEMENTER success → VERIFICATION (bypasses bite-evidence)", () => {
  it("TC-005: chore state resolves IMPLEMENTER/success to verification (not bite-evidence)", () => {
    const choreState = makeState("chore");
    const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.IMPLEMENTER, "success", choreState);
    expect(next).toBe(STEP_NAMES.VERIFICATION);
    expect(next).not.toBe(STEP_NAMES.BITE_EVIDENCE);
  });
});

// ---------------------------------------------------------------------------
// TC-006: chore の spec-fixer 観測修正は IMPLEMENTER へ forward される
// Source: spec.md > Scenario: chore の spec-fixer 観測修正は implementer へ forward
// ---------------------------------------------------------------------------
describe("TC-006: chore SPEC_FIXER approved (specFixerForwardsToTestGen condition) → IMPLEMENTER", () => {
  it("TC-006: specFixerForwardsToImplementer is true when chore + specFixerForwardsToTestGen conditions met", () => {
    const state = makeChoreStateWithSpecReviewApproved();
    expect(specFixerForwardsToImplementer(state)).toBe(true);
  });

  it("TC-006: SPEC_FIXER/approved resolves to implementer for chore (when specFixerForwardsToTestGen condition met)", () => {
    const state = makeChoreStateWithSpecReviewApproved();
    const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.SPEC_FIXER, "approved", state);
    expect(next).toBe(STEP_NAMES.IMPLEMENTER);
  });
});

// ---------------------------------------------------------------------------
// TC-007: 非免除 type は SPEC_REVIEW approved から TEST_CASE_GEN へ遷移する (unchanged)
// Source: spec.md > Scenario: 非免除 type は従来通りテスト生成を通る
// ---------------------------------------------------------------------------
describe("TC-007: non-exempt type SPEC_REVIEW approved → TEST_CASE_GEN (unchanged)", () => {
  const nonExemptTypes = ["new-feature", "spec-change", "refactoring", "bug-fix"] as const;

  for (const t of nonExemptTypes) {
    it(`TC-007: ${t} resolves SPEC_REVIEW/approved to test-case-gen`, () => {
      const state = makeState(t);
      const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.SPEC_REVIEW, "approved", state);
      expect(next).toBe(STEP_NAMES.TEST_CASE_GEN);
    });
  }

  it("TC-007: isTestGenExempt returns false for new-feature", () => {
    const state = makeState("new-feature");
    expect(isTestGenExempt(state)).toBe(false);
  });

  it("TC-007: new-feature IMPLEMENTER/success resolves to bite-evidence (unchanged)", () => {
    const state = makeState("new-feature");
    const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.IMPLEMENTER, "success", state);
    expect(next).toBe(STEP_NAMES.BITE_EVIDENCE);
  });
});

// ---------------------------------------------------------------------------
// TC-012: STANDARD_TRANSITIONS で免除 row は unconditional TEST_CASE_GEN row より前に位置する
// Source: design.md > D2, tasks.md > T-03
// ---------------------------------------------------------------------------
describe("TC-012: SPEC_REVIEW→IMPLEMENTER (exempt) row precedes SPEC_REVIEW→TEST_CASE_GEN (unconditional)", () => {
  it("TC-012: guarded SPEC_REVIEW→IMPLEMENTER row exists", () => {
    const exemptRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.IMPLEMENTER &&
        t.when !== undefined,
    );
    expect(exemptRow).toBeDefined();
  });

  it("TC-012: guarded SPEC_REVIEW→IMPLEMENTER index is less than unconditional SPEC_REVIEW→TEST_CASE_GEN index", () => {
    const exemptIdx = STANDARD_TRANSITIONS.findIndex(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.IMPLEMENTER &&
        t.when !== undefined,
    );
    const unconditionalIdx = STANDARD_TRANSITIONS.findIndex(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        t.when === undefined,
    );
    expect(exemptIdx).toBeGreaterThan(-1);
    expect(unconditionalIdx).toBeGreaterThan(-1);
    expect(exemptIdx).toBeLessThan(unconditionalIdx);
  });

  it("TC-012: SPEC_REVIEW→SPEC_FIXER (specReviewHasRoutableFixables) row precedes SPEC_REVIEW→IMPLEMENTER (isTestGenExempt) row", () => {
    const specFixerIdx = STANDARD_TRANSITIONS.findIndex(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.SPEC_FIXER &&
        t.when !== undefined,
    );
    const exemptIdx = STANDARD_TRANSITIONS.findIndex(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.IMPLEMENTER &&
        t.when !== undefined,
    );
    expect(specFixerIdx).toBeGreaterThan(-1);
    expect(exemptIdx).toBeGreaterThan(-1);
    expect(specFixerIdx).toBeLessThan(exemptIdx);
  });

  it("TC-012: guarded IMPLEMENTER→VERIFICATION (exempt) row precedes unconditional IMPLEMENTER→BITE_EVIDENCE row", () => {
    const exemptIdx = STANDARD_TRANSITIONS.findIndex(
      (t) =>
        t.step === STEP_NAMES.IMPLEMENTER &&
        t.on === "success" &&
        t.to === STEP_NAMES.VERIFICATION &&
        t.when !== undefined,
    );
    const biteEvidenceIdx = STANDARD_TRANSITIONS.findIndex(
      (t) =>
        t.step === STEP_NAMES.IMPLEMENTER &&
        t.on === "success" &&
        t.to === STEP_NAMES.BITE_EVIDENCE &&
        t.when === undefined,
    );
    expect(exemptIdx).toBeGreaterThan(-1);
    expect(biteEvidenceIdx).toBeGreaterThan(-1);
    expect(exemptIdx).toBeLessThan(biteEvidenceIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-015 (should): specFixerForwardsToImplementer は AND 合成 — 片方 false → false
// Source: design.md > D3, tasks.md > T-02
// ---------------------------------------------------------------------------
describe("TC-015 (should): specFixerForwardsToImplementer is false when specFixerForwardsToTestGen is false", () => {
  it("TC-015: returns false for chore with no spec-review runs (specFixerForwardsToTestGen=false side)", () => {
    // No spec-review runs → specFixerForwardsToTestGen returns false → AND is false
    const choreStateNoSpecReview = makeState("chore", { steps: {} });
    expect(specFixerForwardsToImplementer(choreStateNoSpecReview)).toBe(false);
  });

  it("TC-015: returns false for chore when spec-review verdict is not approved", () => {
    const state = makeState("chore", {
      steps: {
        [STEP_NAMES.SPEC_REVIEW]: [
          {
            attempt: 1,
            sessionId: null,
            outcome: { verdict: "needs-fix", findingsPath: null, error: null },
            startedAt: "2024-01-01T00:00:00.000Z",
            endedAt: "2024-01-01T00:01:00.000Z",
          } as unknown as import("../../../state/schema.js").StepRun,
        ],
      },
    });
    expect(specFixerForwardsToImplementer(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-016 (should): FAST_TRANSITIONS は本変更による追加 row を含まない
// Source: tasks.md > T-03
// ---------------------------------------------------------------------------
describe("TC-016 (should): FAST_TRANSITIONS unchanged by test-gen exemption rows", () => {
  it("TC-016: FAST_TRANSITIONS has no SPEC_REVIEW rows (spec-review is bypassed in fast pipeline)", () => {
    const specReviewRows = FAST_TRANSITIONS.filter((t) => t.step === STEP_NAMES.SPEC_REVIEW);
    expect(specReviewRows).toHaveLength(0);
  });

  it("TC-016: FAST_TRANSITIONS has no SPEC_FIXER rows pointing to IMPLEMENTER", () => {
    const specFixerToImplRows = FAST_TRANSITIONS.filter(
      (t) => t.step === STEP_NAMES.SPEC_FIXER && t.to === STEP_NAMES.IMPLEMENTER,
    );
    expect(specFixerToImplRows).toHaveLength(0);
  });

  it("TC-016: FAST_TRANSITIONS IMPLEMENTER→VERIFICATION row is unconditional (no test-gen-exempt guard added)", () => {
    // In FAST pipeline, implementer always goes to verification (no bite-evidence step).
    // The test-gen exemption must NOT add a guarded row here.
    const implRows = FAST_TRANSITIONS.filter(
      (t) => t.step === STEP_NAMES.IMPLEMENTER && t.on === "success",
    );
    expect(implRows).toHaveLength(1);
    // The one row must be IMPLEMENTER→VERIFICATION and unconditional
    expect(implRows[0]?.to).toBe(STEP_NAMES.VERIFICATION);
    expect(implRows[0]?.when).toBeUndefined();
  });
});
