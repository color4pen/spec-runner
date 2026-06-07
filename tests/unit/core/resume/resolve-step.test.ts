/**
 * Tests for resolveResumeStep()
 *
 * New behavior:
 * 1. `--from <step-name>` (registered step) → returns the step name directly.
 * 2. `--from <unknown>` → throws with available step names (no aliases listed).
 * 3. `--from` undefined + resumePoint present → returns `resumePoint.step` verbatim.
 * 4. `--from` undefined + resumePoint null → throws (defensive invariant).
 */
import { describe, it, expect } from "vitest";
import { resolveResumeStep } from "../../../../src/core/resume/resolve-step.js";
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
