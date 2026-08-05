/**
 * Unit tests for LOOP_ERROR_CODES hint correctness (T-07).
 *
 * TC-007: VERIFICATION hint が実在ファイルを案内する (must)
 *         LOOP_ERROR_CODES[VERIFICATION].hint must reference verification-result.md
 *         and must NOT reference a numbered variant (verification-result-001.md).
 * TC-008: 他 step の hint は無変更 (must)
 *         Other loop entries (spec-review, code-review, conformance, regression-gate)
 *         still reference their numbered result files — unchanged by T-07.
 *
 * ⚠ TC-007 is RED:
 *   LOOP_ERROR_CODES[VERIFICATION].hint currently returns:
 *   "Review verification-result-${nnn}.md and fix the build errors manually."
 *   which references a non-existent numbered file. After T-07, it must reference
 *   the real file verification-result.md (without a number).
 *
 * TC-008 is GREEN (other hints are not modified by T-07).
 *
 * Source: specrunner/changes/verification-phase-outcome-record/test-cases.md
 */
import { describe, it, expect } from "vitest";
import { LOOP_ERROR_CODES } from "../../../../src/core/pipeline/types.js";
import { STEP_NAMES } from "../../../../src/kernel/step-names.js";

// ---------------------------------------------------------------------------
// TC-007: VERIFICATION hint が実在ファイルを案内する (must)
//
// RED: Current hint returns "Review verification-result-001.md ..." (non-existent file).
//      After T-07: hint references "verification-result.md" (the real file).
// ---------------------------------------------------------------------------
describe("TC-007: LOOP_ERROR_CODES[VERIFICATION].hint references real file, not a numbered variant (must)", () => {
  it("hint text contains 'verification-result.md'", () => {
    const hint = LOOP_ERROR_CODES[STEP_NAMES.VERIFICATION]!.hint("001");
    // After T-07: hint mentions the real file path
    expect(hint).toContain("verification-result.md");
  });

  it("hint text does NOT contain a numbered variant like 'verification-result-001.md'", () => {
    const hint = LOOP_ERROR_CODES[STEP_NAMES.VERIFICATION]!.hint("001");
    // After T-07: no numbered file mentioned (that file is never generated)
    // RED: current hint is "Review verification-result-001.md ..." → fails here
    expect(hint).not.toContain("verification-result-001.md");
  });

  it("hint does not reference numbered files for any iteration argument", () => {
    for (const nnn of ["001", "002", "005", "010"]) {
      const hint = LOOP_ERROR_CODES[STEP_NAMES.VERIFICATION]!.hint(nnn);
      // No numbered variant regardless of the argument passed
      expect(hint).not.toMatch(/verification-result-\d+\.md/);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-008: 他 step の hint は無変更 (must)
//
// GREEN: T-07 only modifies VERIFICATION hint; all other hints remain identical.
// Verifies the invariant that T-07 has no collateral impact on other loops.
// ---------------------------------------------------------------------------
describe("TC-008: other LOOP_ERROR_CODES hints are unchanged after T-07 (must)", () => {
  it("spec-review hint still references numbered spec-review-result file", () => {
    const hint = LOOP_ERROR_CODES[STEP_NAMES.SPEC_REVIEW]!.hint("001");
    expect(hint).toContain("spec-review-result-001.md");
  });

  it("code-review hint still references numbered review-feedback file", () => {
    const hint = LOOP_ERROR_CODES[STEP_NAMES.CODE_REVIEW]!.hint("001");
    expect(hint).toContain("review-feedback-001.md");
  });

  it("conformance hint still references numbered conformance-result file", () => {
    const hint = LOOP_ERROR_CODES[STEP_NAMES.CONFORMANCE]!.hint("001");
    expect(hint).toContain("conformance-result-001.md");
  });

  it("regression-gate hint still references numbered regression-gate-result file", () => {
    // REGRESSION_GATE_STEP_NAME is "regression-gate" — using the string literal here
    // to avoid a circular import from regression-gate.ts
    const hint = LOOP_ERROR_CODES["regression-gate"]!.hint("001");
    expect(hint).toContain("regression-gate-result-001.md");
  });

  it("custom-reviewers hint is unchanged", () => {
    const hint = LOOP_ERROR_CODES["custom-reviewers"]!.hint("003");
    // custom-reviewers hint references the iteration number, not a specific file
    expect(hint).toBeDefined();
    expect(hint.length).toBeGreaterThan(0);
  });
});
