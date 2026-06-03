import { describe, it, expect } from "vitest";
import { STANDARD_LOOP_NAMES, STANDARD_LOOP_FIXER_PAIRS } from "../../../../src/core/pipeline/run.js";

describe("STANDARD_LOOP_NAMES", () => {
  it("does not include delta-spec-validation", () => {
    expect(STANDARD_LOOP_NAMES).toEqual(["spec-review", "verification", "code-review", "conformance"]);
    expect(STANDARD_LOOP_NAMES).not.toContain("delta-spec-validation");
  });
});

describe("STANDARD_LOOP_FIXER_PAIRS", () => {
  it("maps all three review steps to their fixers", () => {
    expect(STANDARD_LOOP_FIXER_PAIRS).toEqual({
      "code-review": "code-fixer",
      "spec-review": "spec-fixer",
      "verification": "build-fixer",
    });
  });
});
