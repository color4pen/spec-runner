/**
 * Tests for resolveResumeStep()
 *
 * Design D2 mapping table:
 * | role    | spec phase       | code phase   |
 * |---------|------------------|--------------|
 * | critic  | spec-review      | code-review  |
 * | fixer   | spec-fixer       | code-fixer   |
 * | creator | design           | implementer  |
 *
 * Spec phase steps: design, spec-review, spec-fixer
 * Code phase steps: implementer, verification, build-fixer, code-review, code-fixer, pr-create
 */
import { describe, it, expect } from "vitest";
import { resolveResumeStep } from "../../../../src/core/resume/resolve-step.js";
import type { ResumePoint, StepRun, Verdict } from "../../../../src/state/schema.js";

/**
 * Create a minimal StepRun for use in fixer-empty detection tests.
 * Only `outcome.verdict` is exercised by the logic under test.
 */
function makeVerdictRun(verdict: Verdict | null): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    outcome: { verdict, findingsPath: null, error: null },
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeResumePoint(step: ResumePoint["step"]): ResumePoint {
  return { step, reason: "test", iterationsExhausted: 0 };
}

describe("resolveResumeStep - spec phase", () => {
  it("spec phase + critic → spec-review", () => {
    expect(resolveResumeStep("critic", makeResumePoint("spec-review"))).toBe("spec-review");
  });

  it("spec phase + fixer → spec-fixer", () => {
    expect(resolveResumeStep("fixer", makeResumePoint("spec-review"))).toBe("spec-fixer");
  });

  it("spec phase + creator → design", () => {
    expect(resolveResumeStep("creator", makeResumePoint("spec-review"))).toBe("design");
  });

  it("spec phase (design step) + critic → spec-review", () => {
    expect(resolveResumeStep("critic", makeResumePoint("design"))).toBe("spec-review");
  });

  it("spec phase (spec-fixer step) + fixer → spec-fixer", () => {
    expect(resolveResumeStep("fixer", makeResumePoint("spec-fixer"))).toBe("spec-fixer");
  });
});

describe("resolveResumeStep - code phase", () => {
  it("code phase + critic → code-review", () => {
    expect(resolveResumeStep("critic", makeResumePoint("code-review"))).toBe("code-review");
  });

  it("code phase + fixer → code-fixer", () => {
    expect(resolveResumeStep("fixer", makeResumePoint("implementer"))).toBe("code-fixer");
  });

  it("code phase + creator → implementer", () => {
    expect(resolveResumeStep("creator", makeResumePoint("implementer"))).toBe("implementer");
  });

  it("code phase (verification step) + critic → code-review", () => {
    expect(resolveResumeStep("critic", makeResumePoint("verification"))).toBe("code-review");
  });

  it("code phase (build-fixer step) + fixer → code-fixer", () => {
    expect(resolveResumeStep("fixer", makeResumePoint("build-fixer"))).toBe("code-fixer");
  });

  it("code phase (pr-create step) + creator → implementer", () => {
    expect(resolveResumeStep("creator", makeResumePoint("pr-create"))).toBe("implementer");
  });
});

describe("resolveResumeStep - default (from=undefined)", () => {
  it("from undefined defaults to critic → spec phase → spec-review", () => {
    expect(resolveResumeStep(undefined, makeResumePoint("spec-review"))).toBe("spec-review");
  });

  it("from undefined defaults to critic → code phase → code-review", () => {
    expect(resolveResumeStep(undefined, makeResumePoint("code-review"))).toBe("code-review");
  });
});

describe("resolveResumeStep - null resumePoint with fallbackStep", () => {
  it("resumePoint null + fallbackStep spec-review + critic → spec-review", () => {
    expect(resolveResumeStep("critic", null, "spec-review")).toBe("spec-review");
  });

  it("resumePoint null + fallbackStep implementer + critic → code-review", () => {
    expect(resolveResumeStep("critic", null, "implementer")).toBe("code-review");
  });

  it("resumePoint null + fallbackStep undefined → code phase default + critic → code-review", () => {
    expect(resolveResumeStep("critic", null, undefined)).toBe("code-review");
  });

  it("resumePoint null + unknown fallbackStep → code phase default + critic → code-review", () => {
    expect(resolveResumeStep("critic", null, "unknown-step")).toBe("code-review");
  });
});

// T4.1: crash (iterationsExhausted=0) → resumePoint.step から再開 (要件 9)
describe("T4.1: resolveResumeStep - crash (iterationsExhausted=0) → restart from resumePoint.step", () => {
  it("implementer crash (iterationsExhausted=0) → implementer", () => {
    expect(resolveResumeStep(undefined, { step: "implementer", reason: "crash", iterationsExhausted: 0 })).toBe("implementer");
  });

  it("design crash (iterationsExhausted=0) → design", () => {
    expect(resolveResumeStep(undefined, { step: "design", reason: "crash", iterationsExhausted: 0 })).toBe("design");
  });

  it("verification crash (iterationsExhausted=0) → verification", () => {
    expect(resolveResumeStep(undefined, { step: "verification", reason: "crash", iterationsExhausted: 0 })).toBe("verification");
  });

  it("spec-review crash (iterationsExhausted=0) → spec-review (crash, not exhaustion)", () => {
    expect(resolveResumeStep(undefined, { step: "spec-review", reason: "crash", iterationsExhausted: 0 })).toBe("spec-review");
  });

  it("code-review crash (iterationsExhausted=0) → code-review (crash, not exhaustion)", () => {
    expect(resolveResumeStep(undefined, { step: "code-review", reason: "crash", iterationsExhausted: 0 })).toBe("code-review");
  });
});

// T4.2: review exhaustion (iterationsExhausted>0, reviewer step) → fixer (要件 10)
describe("T4.2: resolveResumeStep - review exhaustion (iterationsExhausted>0, reviewer) → fixer", () => {
  it("spec-review exhausted (iterationsExhausted=3) → spec-fixer", () => {
    expect(resolveResumeStep(undefined, { step: "spec-review", reason: "exhausted", iterationsExhausted: 3 })).toBe("spec-fixer");
  });

  it("code-review exhausted (iterationsExhausted=3) → code-fixer", () => {
    expect(resolveResumeStep(undefined, { step: "code-review", reason: "exhausted", iterationsExhausted: 3 })).toBe("code-fixer");
  });

  it("spec-review exhausted (iterationsExhausted=1) → spec-fixer", () => {
    expect(resolveResumeStep(undefined, { step: "spec-review", reason: "exhausted", iterationsExhausted: 1 })).toBe("spec-fixer");
  });
});

// T4.3: non-reviewer step + iterationsExhausted>0 → resumePoint.step (crash 扱い)
describe("T4.3: resolveResumeStep - non-reviewer + iterationsExhausted>0 → resumePoint.step", () => {
  it("verification exhausted (iterationsExhausted=3) → verification (not a reviewer)", () => {
    expect(resolveResumeStep(undefined, { step: "verification", reason: "exhausted", iterationsExhausted: 3 })).toBe("verification");
  });

  it("implementer exhausted (iterationsExhausted=2) → implementer (not a reviewer)", () => {
    expect(resolveResumeStep(undefined, { step: "implementer", reason: "exhausted", iterationsExhausted: 2 })).toBe("implementer");
  });

  it("build-fixer exhausted (iterationsExhausted=1) → build-fixer (not a reviewer)", () => {
    expect(resolveResumeStep(undefined, { step: "build-fixer", reason: "exhausted", iterationsExhausted: 1 })).toBe("build-fixer");
  });
});

// T4.4: --from 指定時は --from が最優先 (要件 11)
describe("T4.4: resolveResumeStep - --from specified → role-based mapping takes priority", () => {
  it("--from creator + code-review exhausted → implementer (creator role wins)", () => {
    expect(resolveResumeStep("creator", { step: "code-review", reason: "exhausted", iterationsExhausted: 3 })).toBe("implementer");
  });

  it("--from fixer + implementer crash → code-fixer (fixer role wins)", () => {
    expect(resolveResumeStep("fixer", { step: "implementer", reason: "crash", iterationsExhausted: 0 })).toBe("code-fixer");
  });

  it("--from critic + implementer crash → code-review (critic role wins)", () => {
    expect(resolveResumeStep("critic", { step: "implementer", reason: "crash", iterationsExhausted: 0 })).toBe("code-review");
  });

  it("--from creator + spec-review exhausted → design (creator role, spec phase)", () => {
    expect(resolveResumeStep("creator", { step: "spec-review", reason: "exhausted", iterationsExhausted: 3 })).toBe("design");
  });

  it("--from fixer + spec-review crash (iterationsExhausted=0) → spec-fixer (fixer role wins)", () => {
    expect(resolveResumeStep("fixer", { step: "spec-review", reason: "crash", iterationsExhausted: 0 })).toBe("spec-fixer");
  });
});

// ============================================================
// Fixer-empty detection (issue #236)
// ============================================================

describe("resolveResumeStep - fixer-empty detection (issue #236)", () => {
  it("resumePoint=code-fixer + steps[code-fixer] empty + steps[code-review] needs-fix → code-review", () => {
    const steps: Record<string, StepRun[]> = {
      "code-review": [makeVerdictRun("needs-fix")],
    };
    expect(resolveResumeStep(undefined, { step: "code-fixer", reason: "kill", iterationsExhausted: 0 }, undefined, steps))
      .toBe("code-review");
  });

  it("resumePoint=spec-fixer + steps[spec-fixer] empty + steps[spec-review] needs-fix → spec-review", () => {
    const steps: Record<string, StepRun[]> = {
      "spec-review": [makeVerdictRun("needs-fix")],
    };
    expect(resolveResumeStep(undefined, { step: "spec-fixer", reason: "kill", iterationsExhausted: 0 }, undefined, steps))
      .toBe("spec-review");
  });

  it("resumePoint=build-fixer + steps[build-fixer] empty + steps[verification] failed → verification", () => {
    const steps: Record<string, StepRun[]> = {
      "verification": [makeVerdictRun("failed")],
    };
    expect(resolveResumeStep(undefined, { step: "build-fixer", reason: "kill", iterationsExhausted: 0 }, undefined, steps))
      .toBe("verification");
  });

  it("resumePoint=code-fixer + steps[code-fixer] non-empty → code-fixer (fixer ran, crash restart)", () => {
    const steps: Record<string, StepRun[]> = {
      "code-review": [makeVerdictRun("needs-fix")],
      "code-fixer": [makeVerdictRun("success")],
    };
    expect(resolveResumeStep(undefined, { step: "code-fixer", reason: "crash", iterationsExhausted: 0 }, undefined, steps))
      .toBe("code-fixer");
  });

  it("--from fixer + fixer-empty scenario → code-fixer (--from wins)", () => {
    const steps: Record<string, StepRun[]> = {
      "code-review": [makeVerdictRun("needs-fix")],
    };
    expect(resolveResumeStep("fixer", { step: "code-fixer", reason: "kill", iterationsExhausted: 0 }, undefined, steps))
      .toBe("code-fixer");
  });

  it("resumePoint=code-fixer + steps=undefined → code-fixer (legacy path, no steps inspection)", () => {
    expect(resolveResumeStep(undefined, { step: "code-fixer", reason: "kill", iterationsExhausted: 0 }, undefined, undefined))
      .toBe("code-fixer");
  });

  it("resumePoint=code-fixer + steps[code-fixer] empty + steps[code-review] approved → code-fixer (no mismatch)", () => {
    const steps: Record<string, StepRun[]> = {
      "code-review": [makeVerdictRun("approved")],
    };
    expect(resolveResumeStep(undefined, { step: "code-fixer", reason: "kill", iterationsExhausted: 0 }, undefined, steps))
      .toBe("code-fixer");
  });

  it("resumePoint=delta-spec-fixer + steps[delta-spec-fixer] empty + steps[delta-spec-validation] needs-fix → delta-spec-validation", () => {
    const steps: Record<string, StepRun[]> = {
      "delta-spec-validation": [makeVerdictRun("needs-fix")],
    };
    expect(resolveResumeStep(undefined, { step: "delta-spec-fixer", reason: "kill", iterationsExhausted: 0 }, undefined, steps))
      .toBe("delta-spec-validation");
  });
});
