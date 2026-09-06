/**
 * Unit tests for applyGitHubIntegration (pipeline terminal selector).
 *
 * TC-040: enabled contract → base returned with reference identity
 * TC-041: disabled standard → pr-create removed from steps/roles/transitions, adr-gen → end
 * TC-042: disabled fast → conformance approved → end, verification (guarded) passed → end
 * TC-043: design-only → same descriptor for enabled and disabled
 */
import { describe, it, expect } from "vitest";
import { applyGitHubIntegration } from "../../../src/core/pipeline/apply-github-integration.js";
import {
  STANDARD_DESCRIPTOR,
  FAST_DESCRIPTOR,
  DESIGN_ONLY_DESCRIPTOR,
} from "../../../src/core/pipeline/registry.js";
import { STEP_NAMES } from "../../../src/core/step/step-names.js";

const ENABLED = { enabled: true };
const DISABLED = { enabled: false };
const PR_CREATE = STEP_NAMES.PR_CREATE;

// ---------------------------------------------------------------------------
// TC-040: enabled contract → same reference returned
// ---------------------------------------------------------------------------

describe("TC-040: applyGitHubIntegration — enabled → reference identity", () => {
  it("returns the exact same object reference for standard descriptor", () => {
    const result = applyGitHubIntegration(STANDARD_DESCRIPTOR, ENABLED);
    expect(result).toBe(STANDARD_DESCRIPTOR);
  });

  it("returns the exact same object reference for fast descriptor", () => {
    const result = applyGitHubIntegration(FAST_DESCRIPTOR, ENABLED);
    expect(result).toBe(FAST_DESCRIPTOR);
  });

  it("returns the exact same object reference for design-only descriptor", () => {
    const result = applyGitHubIntegration(DESIGN_ONLY_DESCRIPTOR, ENABLED);
    expect(result).toBe(DESIGN_ONLY_DESCRIPTOR);
  });
});

// ---------------------------------------------------------------------------
// TC-041: disabled standard → pr-create removed, adr-gen → end
// ---------------------------------------------------------------------------

describe("TC-041: applyGitHubIntegration — disabled standard: pr-create removed, adr-gen → end", () => {
  const applied = applyGitHubIntegration(STANDARD_DESCRIPTOR, DISABLED);

  it("returns a NEW object (not the same reference as base)", () => {
    expect(applied).not.toBe(STANDARD_DESCRIPTOR);
  });

  it("pr-create is absent from steps", () => {
    const stepNames = applied.steps.map(([name]) => name);
    expect(stepNames).not.toContain(PR_CREATE);
  });

  it("pr-create is absent from roles", () => {
    expect(PR_CREATE in applied.roles).toBe(false);
  });

  it("no transition has step: pr-create (outgoing transitions from pr-create removed)", () => {
    const prCreateTransitions = applied.transitions.filter((t) => t.step === PR_CREATE);
    expect(prCreateTransitions).toHaveLength(0);
  });

  it("no transition targets pr-create as its destination (to: pr-create replaced with to: end)", () => {
    const toprCreate = applied.transitions.filter((t) => t.to === PR_CREATE);
    expect(toprCreate).toHaveLength(0);
  });

  it("adr-gen success transition goes to end (not pr-create)", () => {
    const adrGenSuccess = applied.transitions.find(
      (t) => t.step === STEP_NAMES.ADR_GEN && t.on === "success",
    );
    expect(adrGenSuccess).toBeDefined();
    expect(adrGenSuccess?.to).toBe("end");
  });

  it("adr-gen skipped transition goes to end", () => {
    const adrGenSkipped = applied.transitions.find(
      (t) => t.step === STEP_NAMES.ADR_GEN && t.on === "skipped",
    );
    if (adrGenSkipped) {
      // If skipped transition exists, it should go to end
      expect(adrGenSkipped.to).toBe("end");
    }
    // skipped might not exist in all descriptors; either way no pr-create target
  });

  it("all original steps except pr-create are preserved", () => {
    const originalStepNames = STANDARD_DESCRIPTOR.steps.map(([name]) => name).filter((n) => n !== PR_CREATE);
    const appliedStepNames = applied.steps.map(([name]) => name);
    expect(appliedStepNames).toEqual(originalStepNames);
  });
});

// ---------------------------------------------------------------------------
// TC-042: disabled fast → conformance approved → end, verification (guarded) → end
// ---------------------------------------------------------------------------

describe("TC-042: applyGitHubIntegration — disabled fast: conformance → end, verification guard → end", () => {
  const applied = applyGitHubIntegration(FAST_DESCRIPTOR, DISABLED);

  it("pr-create is absent from steps", () => {
    const stepNames = applied.steps.map(([name]) => name);
    expect(stepNames).not.toContain(PR_CREATE);
  });

  it("no transition targets pr-create", () => {
    const toprCreate = applied.transitions.filter((t) => t.to === PR_CREATE);
    expect(toprCreate).toHaveLength(0);
  });

  it("conformance approved (non-guarded) goes to end", () => {
    // The non-guarded "approved" from conformance previously went to pr-create
    const conformanceApproved = applied.transitions.find(
      (t) => t.step === STEP_NAMES.CONFORMANCE && t.on === "approved" && !t.when,
    );
    expect(conformanceApproved).toBeDefined();
    expect(conformanceApproved?.to).toBe("end");
  });

  it("verification passed (guarded by conformanceApproved) goes to end", () => {
    // The guarded "passed" from verification previously went to pr-create
    const verificationPassedGuarded = applied.transitions.find(
      (t) => t.step === STEP_NAMES.VERIFICATION && t.on === "passed" && t.when !== undefined,
    );
    expect(verificationPassedGuarded).toBeDefined();
    expect(verificationPassedGuarded?.to).toBe("end");
  });
});

// ---------------------------------------------------------------------------
// TC-043: design-only → same descriptor for enabled and disabled
// ---------------------------------------------------------------------------

describe("TC-043: applyGitHubIntegration — design-only: same for enabled and disabled", () => {
  it("returns same reference for design-only regardless of contract", () => {
    const resultEnabled = applyGitHubIntegration(DESIGN_ONLY_DESCRIPTOR, ENABLED);
    const resultDisabled = applyGitHubIntegration(DESIGN_ONLY_DESCRIPTOR, DISABLED);
    // design-only has no pr-create, so disabled result should be same reference
    expect(resultEnabled).toBe(DESIGN_ONLY_DESCRIPTOR);
    // disabled: no pr-create to remove, so result is effectively the same structure
    // (may or may not be the same reference depending on implementation detail,
    // but the contents must be identical)
    const disabledStepNames = resultDisabled.steps.map(([name]) => name);
    const enabledStepNames = DESIGN_ONLY_DESCRIPTOR.steps.map(([name]) => name);
    expect(disabledStepNames).toEqual(enabledStepNames);
    expect(resultDisabled.transitions).toEqual(DESIGN_ONLY_DESCRIPTOR.transitions);
  });

  it("design-only has no pr-create step (baseline verification)", () => {
    const stepNames = DESIGN_ONLY_DESCRIPTOR.steps.map(([name]) => name);
    expect(stepNames).not.toContain(PR_CREATE);
  });
});
