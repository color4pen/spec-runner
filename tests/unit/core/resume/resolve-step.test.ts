/**
 * Tests for resolveResumeStep()
 *
 * Design D2 mapping table:
 * | role    | spec phase       | code phase   |
 * |---------|------------------|--------------|
 * | critic  | spec-review      | code-review  |
 * | fixer   | spec-fixer       | code-fixer   |
 * | creator | propose          | implementer  |
 *
 * Spec phase steps: propose, spec-review, spec-fixer
 * Code phase steps: implementer, verification, build-fixer, code-review, code-fixer, pr-create
 */
import { describe, it, expect } from "vitest";
import { resolveResumeStep } from "../../../../src/core/resume/resolve-step.js";
import type { ResumePoint } from "../../../../src/state/schema.js";

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

  it("spec phase + creator → propose", () => {
    expect(resolveResumeStep("creator", makeResumePoint("spec-review"))).toBe("propose");
  });

  it("spec phase (propose step) + critic → spec-review", () => {
    expect(resolveResumeStep("critic", makeResumePoint("propose"))).toBe("spec-review");
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

  it("propose crash (iterationsExhausted=0) → propose", () => {
    expect(resolveResumeStep(undefined, { step: "propose", reason: "crash", iterationsExhausted: 0 })).toBe("propose");
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

  it("--from creator + spec-review exhausted → propose (creator role, spec phase)", () => {
    expect(resolveResumeStep("creator", { step: "spec-review", reason: "exhausted", iterationsExhausted: 3 })).toBe("propose");
  });

  it("--from fixer + spec-review crash (iterationsExhausted=0) → spec-fixer (fixer role wins)", () => {
    expect(resolveResumeStep("fixer", { step: "spec-review", reason: "crash", iterationsExhausted: 0 })).toBe("spec-fixer");
  });
});
