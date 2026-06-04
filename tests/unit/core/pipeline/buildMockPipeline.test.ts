import { describe, it, expect } from "vitest";
import { STANDARD_LOOP_NAMES, STANDARD_LOOP_FIXER_PAIRS } from "../../../../src/core/pipeline/run.js";
import { STANDARD_DESCRIPTOR } from "../../../../src/core/pipeline/registry.js";

describe("STANDARD_LOOP_NAMES", () => {
  it("matches STANDARD_DESCRIPTOR.loopNames and does not include delta-spec-validation", () => {
    expect(STANDARD_LOOP_NAMES).toEqual(STANDARD_DESCRIPTOR.loopNames);
    expect(STANDARD_LOOP_NAMES).not.toContain("delta-spec-validation");
  });
});

describe("STANDARD_LOOP_FIXER_PAIRS", () => {
  it("matches STANDARD_DESCRIPTOR.loopFixerPairs", () => {
    expect(STANDARD_LOOP_FIXER_PAIRS).toEqual(STANDARD_DESCRIPTOR.loopFixerPairs);
  });
});
