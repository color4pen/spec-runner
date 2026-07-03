import { describe, it, expect } from "vitest";
import { getConventionalPrefix, isSpecRequired } from "../type-config.js";

describe("getConventionalPrefix", () => {
  it("returns feat for new-feature", () => {
    expect(getConventionalPrefix("new-feature")).toBe("feat");
  });

  it("returns fix for bug-fix", () => {
    expect(getConventionalPrefix("bug-fix")).toBe("fix");
  });

  it("returns feat for spec-change", () => {
    expect(getConventionalPrefix("spec-change")).toBe("feat");
  });

  it("returns refactor for refactoring", () => {
    expect(getConventionalPrefix("refactoring")).toBe("refactor");
  });

  it("returns chore for chore", () => {
    expect(getConventionalPrefix("chore")).toBe("chore");
  });

  it("falls back to feat for unknown type", () => {
    expect(getConventionalPrefix("unknown")).toBe("feat");
  });
});

// ---------------------------------------------------------------------------
// isSpecRequired — T-01
// ---------------------------------------------------------------------------

describe("isSpecRequired", () => {
  it("chore → false (spec-exempt)", () => {
    expect(isSpecRequired("chore")).toBe(false);
  });

  it("new-feature → true", () => {
    expect(isSpecRequired("new-feature")).toBe(true);
  });

  it("spec-change → true", () => {
    expect(isSpecRequired("spec-change")).toBe(true);
  });

  it("bug-fix → true", () => {
    expect(isSpecRequired("bug-fix")).toBe(true);
  });

  it("refactoring → true", () => {
    expect(isSpecRequired("refactoring")).toBe(true);
  });

  it("unknown type falls back to true (fail-closed)", () => {
    expect(isSpecRequired("unknown")).toBe(true);
  });

  it("empty string falls back to true (fail-closed)", () => {
    expect(isSpecRequired("")).toBe(true);
  });
});
