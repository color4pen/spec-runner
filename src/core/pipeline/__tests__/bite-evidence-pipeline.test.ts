/**
 * Pipeline wiring tests for the bite-evidence step (T-07).
 *
 * Verifies:
 *   - TC-026: STANDARD_DESCRIPTOR / STANDARD_TRANSITIONS wire
 *             implementer → bite-evidence → verification correctly
 *   - TC-009: existing pipeline behavior is preserved (behavior-preservation)
 */

import { describe, it, expect } from "vitest";
import { STANDARD_TRANSITIONS, FAST_TRANSITIONS } from "../types.js";
import { STANDARD_DESCRIPTOR, FAST_DESCRIPTOR } from "../registry.js";
import { STEP_NAMES } from "../../step/step-names.js";

// ---------------------------------------------------------------------------
// TC-026: Standard pipeline wires implementer → bite-evidence → verification
// ---------------------------------------------------------------------------

describe("TC-026: STANDARD_TRANSITIONS includes bite-evidence step wiring", () => {
  it("TC-026: implementer / success routes to bite-evidence", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === STEP_NAMES.IMPLEMENTER && t.on === "success",
    );
    expect(row).toBeDefined();
    expect(row!.to).toBe("bite-evidence");
  });

  it("TC-026: bite-evidence / passed routes to verification", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "bite-evidence" && t.on === "passed",
    );
    expect(row).toBeDefined();
    expect(row!.to).toBe(STEP_NAMES.VERIFICATION);
  });

  it("TC-026: bite-evidence / strategy-deferred routes to verification", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "bite-evidence" && t.on === "strategy-deferred",
    );
    expect(row).toBeDefined();
    expect(row!.to).toBe(STEP_NAMES.VERIFICATION);
  });

  it("TC-026: bite-evidence / failed escalates", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "bite-evidence" && t.on === "failed",
    );
    expect(row).toBeDefined();
    expect(row!.to).toBe("escalate");
  });

  it("TC-026: bite-evidence / error escalates", () => {
    const row = STANDARD_TRANSITIONS.find(
      (t) => t.step === "bite-evidence" && t.on === "error",
    );
    expect(row).toBeDefined();
    expect(row!.to).toBe("escalate");
  });

  it("TC-026: STANDARD_DESCRIPTOR steps include bite-evidence between implementer and verification", () => {
    const stepNames = STANDARD_DESCRIPTOR.steps.map(([name]) => name);
    const implementerIdx = stepNames.indexOf(STEP_NAMES.IMPLEMENTER);
    const biteEvidenceIdx = stepNames.indexOf("bite-evidence");
    const verificationIdx = stepNames.indexOf(STEP_NAMES.VERIFICATION);

    expect(biteEvidenceIdx).toBeGreaterThan(-1);
    expect(biteEvidenceIdx).toBeGreaterThan(implementerIdx);
    expect(verificationIdx).toBeGreaterThan(biteEvidenceIdx);
  });

  it("TC-026: bite-evidence has gate role in STANDARD_DESCRIPTOR.roles", () => {
    const role = STANDARD_DESCRIPTOR.roles["bite-evidence"];
    expect(role).toBeDefined();
    expect(role!.role).toBe("gate");
  });
});

// ---------------------------------------------------------------------------
// TC-027 (should): Fast pipeline does not include bite-evidence
// ---------------------------------------------------------------------------

describe("TC-027: fast pipeline does not include bite-evidence step", () => {
  it("TC-027: FAST_DESCRIPTOR does not include bite-evidence step", () => {
    const stepNames = FAST_DESCRIPTOR.steps.map(([name]) => name);
    expect(stepNames).not.toContain("bite-evidence");
  });

  it("TC-027: FAST_TRANSITIONS has no bite-evidence rows", () => {
    const biteEvidenceRows = FAST_TRANSITIONS.filter(
      (t) => t.step === "bite-evidence" || t.to === "bite-evidence",
    );
    expect(biteEvidenceRows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-009: Existing pipeline behavior is preserved
// ---------------------------------------------------------------------------

describe("TC-009: existing pipeline behavior is preserved", () => {
  it("TC-009: STANDARD_DESCRIPTOR still has all original steps", () => {
    const stepNames = STANDARD_DESCRIPTOR.steps.map(([name]) => name);

    // All original standard steps must still exist
    expect(stepNames).toContain(STEP_NAMES.REQUEST_REVIEW);
    expect(stepNames).toContain(STEP_NAMES.DESIGN);
    expect(stepNames).toContain(STEP_NAMES.SPEC_REVIEW);
    expect(stepNames).toContain(STEP_NAMES.SPEC_FIXER);
    expect(stepNames).toContain(STEP_NAMES.TEST_CASE_GEN);
    expect(stepNames).toContain(STEP_NAMES.TEST_MATERIALIZE);
    expect(stepNames).toContain(STEP_NAMES.IMPLEMENTER);
    expect(stepNames).toContain(STEP_NAMES.VERIFICATION);
    expect(stepNames).toContain(STEP_NAMES.BUILD_FIXER);
    expect(stepNames).toContain(STEP_NAMES.CODE_REVIEW);
    expect(stepNames).toContain(STEP_NAMES.CODE_FIXER);
    expect(stepNames).toContain(STEP_NAMES.CONFORMANCE);
    expect(stepNames).toContain(STEP_NAMES.ADR_GEN);
    expect(stepNames).toContain(STEP_NAMES.PR_CREATE);
  });

  it("TC-009: STANDARD_TRANSITIONS existing routes are preserved", () => {
    // design → spec-review
    const designRow = STANDARD_TRANSITIONS.find(
      (t) => t.step === STEP_NAMES.DESIGN && t.on === "success" && t.to === STEP_NAMES.SPEC_REVIEW,
    );
    expect(designRow).toBeDefined();

    // test-case-gen → test-materialize
    const tcgRow = STANDARD_TRANSITIONS.find(
      (t) => t.step === STEP_NAMES.TEST_CASE_GEN && t.on === "success" && t.to === STEP_NAMES.TEST_MATERIALIZE,
    );
    expect(tcgRow).toBeDefined();

    // test-materialize → implementer (now test-materialize → implementer → bite-evidence)
    const tmRow = STANDARD_TRANSITIONS.find(
      (t) => t.step === STEP_NAMES.TEST_MATERIALIZE && t.on === "success" && t.to === STEP_NAMES.IMPLEMENTER,
    );
    expect(tmRow).toBeDefined();

    // adr-gen → pr-create
    const adrRow = STANDARD_TRANSITIONS.find(
      (t) => t.step === STEP_NAMES.ADR_GEN && t.on === "success" && t.to === STEP_NAMES.PR_CREATE,
    );
    expect(adrRow).toBeDefined();
  });

  it("TC-009: FAST_DESCRIPTOR and FAST_TRANSITIONS are unmodified by this change", () => {
    // Fast pipeline implementer → verification (unchanged)
    const fastImplRow = FAST_TRANSITIONS.find(
      (t) => t.step === STEP_NAMES.IMPLEMENTER && t.on === "success" && t.to === STEP_NAMES.VERIFICATION,
    );
    expect(fastImplRow).toBeDefined();

    // Fast pipeline does not have test-case-gen or test-materialize
    const fastStepNames = FAST_DESCRIPTOR.steps.map(([name]) => name);
    expect(fastStepNames).not.toContain(STEP_NAMES.TEST_CASE_GEN);
    expect(fastStepNames).not.toContain(STEP_NAMES.TEST_MATERIALIZE);
    expect(fastStepNames).not.toContain("bite-evidence");
  });

  it("TC-009: STEP_NAMES.BITE_EVIDENCE constant exists", () => {
    // The implementer will register the constant on STEP_NAMES
    const biteEvidenceStepName = (STEP_NAMES as Record<string, string>)["BITE_EVIDENCE"];
    expect(biteEvidenceStepName).toBe("bite-evidence");
  });
});

// ---------------------------------------------------------------------------
// TC-029 (should): bite-evidence in CLI_STEP_NAMES
// ---------------------------------------------------------------------------

describe("TC-029: bite-evidence is registered in CLI_STEP_NAMES", () => {
  it("TC-029: CLI_STEP_NAMES includes bite-evidence", async () => {
    const { CLI_STEP_NAMES } = await import("../../../kernel/step-names.js");
    expect(CLI_STEP_NAMES).toContain("bite-evidence");
  });
});
