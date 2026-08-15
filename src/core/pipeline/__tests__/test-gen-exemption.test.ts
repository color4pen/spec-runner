/**
 * Tests for test-generation type-gate — pipeline transition routing.
 *
 * TC-004: chore は SPEC_REVIEW approved から IMPLEMENTER へ直行する
 * TC-005: chore は IMPLEMENTER success から VERIFICATION へ直行する
 * TC-007: 非免除 type は SPEC_REVIEW approved から IMPLEMENTER へ直行する (absorb-test-materialize)
 * TC-012: STANDARD_TRANSITIONS で免除 row は unconditional IMPLEMENTER row より前に位置する
 * TC-016 (should): FAST_TRANSITIONS は本変更による追加 row を含まない
 *
 * absorb-test-materialize: TC-006 (specFixerForwardsToImplementer) と TC-015 を除去。
 * specFixerForwardsToImplementer は廃止。TC-006/TC-004 は absorb-test-materialize-transitions.test.ts へ移動。
 *
 * Source: spec.md > Requirement: 免除 type の pipeline はテスト生成工程を通らない
 *         design.md > D2, D3, tasks.md > T-02, T-03
 */
import { describe, it, expect } from "vitest";
import { STANDARD_TRANSITIONS, FAST_TRANSITIONS } from "../types.js";
import { STEP_NAMES } from "../../step/step-names.js";
import type { JobState } from "../../../state/schema.js";
import { isTestGenExempt } from "../test-gen-exemption.js";

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
// TC-007: 非免除 type は SPEC_REVIEW approved から IMPLEMENTER へ直行する
//         (absorb-test-materialize: TEST_MATERIALIZE 廃止 → 全 type が IMPLEMENTER へ)
// Source: spec.md > Scenario: 非免除 type は spec-review 承認から implementer へ直行する
// ---------------------------------------------------------------------------
describe("TC-007: non-exempt type SPEC_REVIEW approved → IMPLEMENTER (absorb-test-materialize)", () => {
  const nonExemptTypes = ["new-feature", "spec-change", "refactoring", "bug-fix"] as const;

  for (const t of nonExemptTypes) {
    it(`TC-007: ${t} resolves SPEC_REVIEW/approved to implementer (not test-materialize)`, () => {
      const state = makeState(t);
      const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.SPEC_REVIEW, "approved", state);
      expect(next).toBe(STEP_NAMES.IMPLEMENTER);
      expect(next).not.toBe("test-materialize");
    });
  }

  for (const t of nonExemptTypes) {
    it(`TC-007: ${t} resolves DESIGN/success to test-case-gen (unchanged)`, () => {
      const state = makeState(t);
      const next = resolveNext(STANDARD_TRANSITIONS, STEP_NAMES.DESIGN, "success", state);
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
// TC-012: STANDARD_TRANSITIONS の構造検証
//         absorb-test-materialize: SPEC_REVIEW→IMPLEMENTER は unconditional に変更
//         + DESIGN block に免除 row (exempt→spec-review) と非免除 row (→test-case-gen) が存在する
// Source: design.md > D1, D2, tasks.md > T-03, T-04
// ---------------------------------------------------------------------------
describe("TC-012: STANDARD_TRANSITIONS structural invariants (absorb-test-materialize)", () => {
  it("TC-012: unconditional SPEC_REVIEW→IMPLEMENTER row exists (absorb-test-materialize: no when guard)", () => {
    // After abolition of test-materialize, SPEC_REVIEW→IMPLEMENTER is unconditional for all types.
    const unconditionalRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.IMPLEMENTER &&
        t.when === undefined,
    );
    expect(unconditionalRow).toBeDefined();
  });

  it("TC-012: guarded DESIGN→SPEC_REVIEW (exempt) row exists", () => {
    const designExemptRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.DESIGN &&
        t.on === "success" &&
        t.to === STEP_NAMES.SPEC_REVIEW &&
        t.when !== undefined,
    );
    expect(designExemptRow).toBeDefined();
  });

  it("TC-012: unconditional DESIGN→TEST_CASE_GEN row exists (non-exempt path)", () => {
    const designUnconditionalRow = STANDARD_TRANSITIONS.find(
      (t) =>
        t.step === STEP_NAMES.DESIGN &&
        t.on === "success" &&
        t.to === STEP_NAMES.TEST_CASE_GEN &&
        t.when === undefined,
    );
    expect(designUnconditionalRow).toBeDefined();
  });

  it("TC-012: SPEC_REVIEW→SPEC_FIXER (guarded) precedes SPEC_REVIEW→IMPLEMENTER (unconditional) in transition order", () => {
    const specFixerIdx = STANDARD_TRANSITIONS.findIndex(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.SPEC_FIXER &&
        t.when !== undefined,
    );
    const implementerIdx = STANDARD_TRANSITIONS.findIndex(
      (t) =>
        t.step === STEP_NAMES.SPEC_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.IMPLEMENTER &&
        t.when === undefined,
    );
    expect(specFixerIdx).toBeGreaterThan(-1);
    expect(implementerIdx).toBeGreaterThan(-1);
    expect(specFixerIdx).toBeLessThan(implementerIdx);
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
