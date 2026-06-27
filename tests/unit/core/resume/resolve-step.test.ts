/**
 * Tests for resolveResumeStep() and buildAllowedStepSet()
 *
 * New behavior:
 * 1. `--from <step-name>` (registered step) → returns the step name directly.
 * 2. `--from <unknown>` → throws with available step names (no aliases listed).
 * 3. `--from` undefined + resumePoint present → returns `resumePoint.step` verbatim.
 * 4. `--from` undefined + resumePoint null → throws (defensive invariant).
 */
import { describe, it, expect } from "vitest";
import { resolveResumeStep, buildAllowedStepSet } from "../../../../src/core/resume/resolve-step.js";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES } from "../../../../src/core/step/step-names.js";
import { REGRESSION_GATE_STEP_NAME } from "../../../../src/core/step/regression-gate.js";
import type { ResumePoint } from "../../../../src/state/schema.js";

function makeResumePoint(step: ResumePoint["step"], iterationsExhausted = 0): ResumePoint {
  return { step, reason: "test", iterationsExhausted };
}

// ============================================================
// resumePoint present → verbatim return
// ============================================================

describe("resolveResumeStep - resumePoint.step returned verbatim", () => {
  it("crash at implementer → implementer", () => {
    expect(resolveResumeStep(undefined, makeResumePoint("implementer"))).toBe("implementer");
  });

  it("crash at design → design", () => {
    expect(resolveResumeStep(undefined, makeResumePoint("design"))).toBe("design");
  });

  it("crash at verification → verification", () => {
    expect(resolveResumeStep(undefined, makeResumePoint("verification"))).toBe("verification");
  });

  it("crash at spec-review → spec-review (no re-inference)", () => {
    expect(resolveResumeStep(undefined, makeResumePoint("spec-review"))).toBe("spec-review");
  });

  it("crash at code-review → code-review (no re-inference)", () => {
    expect(resolveResumeStep(undefined, makeResumePoint("code-review"))).toBe("code-review");
  });

  it("exhausted spec-fixer recorded → spec-fixer", () => {
    // handleExhausted now records fixer; resolveResumeStep returns it verbatim
    expect(resolveResumeStep(undefined, makeResumePoint("spec-fixer", 3))).toBe("spec-fixer");
  });

  it("exhausted code-fixer recorded → code-fixer", () => {
    expect(resolveResumeStep(undefined, makeResumePoint("code-fixer", 3))).toBe("code-fixer");
  });

  it("resumePoint at pr-create → pr-create", () => {
    expect(resolveResumeStep(undefined, makeResumePoint("pr-create"))).toBe("pr-create");
  });
});

// ============================================================
// --from <step-name> → direct return
// ============================================================

describe("resolveResumeStep - --from with registered step name", () => {
  it("--from design → design", () => {
    expect(resolveResumeStep("design", makeResumePoint("code-review"))).toBe("design");
  });

  it("--from code-review → code-review", () => {
    expect(resolveResumeStep("code-review", makeResumePoint("implementer"))).toBe("code-review");
  });

  it("--from spec-fixer → spec-fixer", () => {
    expect(resolveResumeStep("spec-fixer", makeResumePoint("spec-review"))).toBe("spec-fixer");
  });

  it("--from code-fixer → code-fixer", () => {
    expect(resolveResumeStep("code-fixer", makeResumePoint("implementer"))).toBe("code-fixer");
  });

  it("--from build-fixer → build-fixer", () => {
    expect(resolveResumeStep("build-fixer", makeResumePoint("verification"))).toBe("build-fixer");
  });

  it("--from implementer → implementer (resumePoint irrelevant)", () => {
    expect(resolveResumeStep("implementer", makeResumePoint("spec-review"))).toBe("implementer");
  });

  it("--from step-name works even when resumePoint is null", () => {
    expect(resolveResumeStep("code-review", null)).toBe("code-review");
  });
});

// ============================================================
// --from <unknown> → throws with step names listed (no aliases)
// ============================================================

describe("resolveResumeStep - --from invalid value throws", () => {
  it("throws on unknown value", () => {
    expect(() => resolveResumeStep("invalid-name", makeResumePoint("code-review")))
      .toThrow(/invalid-name/);
  });

  it("error message lists registered step names", () => {
    expect(() => resolveResumeStep("invalid-name", makeResumePoint("code-review")))
      .toThrow(/design/);
  });

  it("error message does NOT list legacy aliases (critic/fixer/creator)", () => {
    try {
      resolveResumeStep("invalid-name", makeResumePoint("code-review"));
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).not.toContain("critic");
      expect(msg).not.toContain("Legacy aliases");
    }
  });

  it("legacy alias 'critic' is rejected as invalid", () => {
    expect(() => resolveResumeStep("critic", makeResumePoint("code-review"))).toThrow();
  });

  it("legacy alias 'fixer' is rejected as invalid", () => {
    expect(() => resolveResumeStep("fixer", makeResumePoint("code-review"))).toThrow();
  });

  it("legacy alias 'creator' is rejected as invalid", () => {
    expect(() => resolveResumeStep("creator", makeResumePoint("code-review"))).toThrow();
  });
});

// ============================================================
// null resumePoint + no --from → throws (defensive invariant)
// ============================================================

describe("resolveResumeStep - null resumePoint + no from → throws", () => {
  it("throws when resumePoint is null and from is undefined", () => {
    expect(() => resolveResumeStep(undefined, null)).toThrow();
  });
});

// ============================================================
// Suite A — buildAllowedStepSet
// ============================================================

describe("buildAllowedStepSet", () => {
  it("reviewers undefined → regression-gate not included", () => {
    const set = buildAllowedStepSet(undefined);
    expect(set.has(REGRESSION_GATE_STEP_NAME)).toBe(false);
  });

  it("reviewers empty array → regression-gate not included", () => {
    const set = buildAllowedStepSet([]);
    expect(set.has(REGRESSION_GATE_STEP_NAME)).toBe(false);
  });

  it("reviewers non-empty → regression-gate included", () => {
    const set = buildAllowedStepSet([{ name: "scale-tolerance" }]);
    expect(set.has(REGRESSION_GATE_STEP_NAME)).toBe(true);
  });

  it("reviewers non-empty → each reviewer.name included", () => {
    const set = buildAllowedStepSet([
      { name: "scale-tolerance" },
      { name: "cross-boundary-invariants" },
    ]);
    expect(set.has("scale-tolerance")).toBe(true);
    expect(set.has("cross-boundary-invariants")).toBe(true);
  });

  it("reviewers undefined → static step names included", () => {
    const set = buildAllowedStepSet(undefined);
    for (const name of [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]) {
      expect(set.has(name)).toBe(true);
    }
  });

  it("reviewers non-empty → static step names still included", () => {
    const set = buildAllowedStepSet([{ name: "scale-tolerance" }]);
    expect(set.has("design")).toBe(true);
    expect(set.has("verification")).toBe(true);
  });
});

// ============================================================
// Suite B — resolveResumeStep / stateStep fallback (hard-crash path)
// ============================================================

describe("resolveResumeStep - stateStep hard-crash fallback with dynamic allowedSteps", () => {
  const staticSteps = new Set<string>([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]);
  const withReviewers = new Set<string>([
    ...staticSteps,
    REGRESSION_GATE_STEP_NAME,
    "scale-tolerance",
  ]);

  it("stateStep = regression-gate + reviewers allowedSteps → returns regression-gate", () => {
    expect(resolveResumeStep(undefined, null, REGRESSION_GATE_STEP_NAME, withReviewers))
      .toBe(REGRESSION_GATE_STEP_NAME);
  });

  it("stateStep = scale-tolerance + reviewer scale-tolerance in allowedSteps → returns scale-tolerance", () => {
    expect(resolveResumeStep(undefined, null, "scale-tolerance", withReviewers))
      .toBe("scale-tolerance");
  });

  it("stateStep = regression-gate + static-only allowedSteps → throws", () => {
    expect(() => resolveResumeStep(undefined, null, REGRESSION_GATE_STEP_NAME, staticSteps))
      .toThrow();
  });

  it("stateStep = unknown-reviewer + scale-tolerance-only allowedSteps → throws", () => {
    expect(() => resolveResumeStep(undefined, null, "unknown-reviewer", withReviewers))
      .toThrow();
  });
});

// ============================================================
// Suite C — resolveResumeStep / --from path with dynamic allowedSteps
// ============================================================

describe("resolveResumeStep - --from with dynamic allowedSteps", () => {
  const withReviewers = new Set<string>([
    ...AGENT_STEP_NAMES,
    ...CLI_STEP_NAMES,
    REGRESSION_GATE_STEP_NAME,
    "scale-tolerance",
  ]);

  it("from = regression-gate + reviewers allowedSteps → returns regression-gate", () => {
    expect(resolveResumeStep(REGRESSION_GATE_STEP_NAME, null, undefined, withReviewers))
      .toBe(REGRESSION_GATE_STEP_NAME);
  });

  it("from = scale-tolerance + reviewer scale-tolerance in allowedSteps → returns scale-tolerance", () => {
    expect(resolveResumeStep("scale-tolerance", null, undefined, withReviewers))
      .toBe("scale-tolerance");
  });

  it("from = typo-reviewer + reviewers allowedSteps → throws with typo-reviewer in message", () => {
    expect(() => resolveResumeStep("typo-reviewer", null, undefined, withReviewers))
      .toThrow(/typo-reviewer/);
  });

  it("from = typo-reviewer error message lists dynamic reviewer names", () => {
    expect(() => resolveResumeStep("typo-reviewer", null, undefined, withReviewers))
      .toThrow(/scale-tolerance/);
  });
});

// ============================================================
// Suite D — resumePoint path is unaffected by allowedSteps
// ============================================================

describe("resolveResumeStep - resumePoint path unaffected by allowedSteps", () => {
  it("resumePoint present + custom allowedSteps → returns resumePoint.step verbatim", () => {
    const staticOnlySet = new Set<string>([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]);
    // resumePoint at "conformance" — should be returned regardless of allowedSteps content
    expect(resolveResumeStep(undefined, makeResumePoint("conformance"), undefined, staticOnlySet))
      .toBe("conformance");
  });
});
