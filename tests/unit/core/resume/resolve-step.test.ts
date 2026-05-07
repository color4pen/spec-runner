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
