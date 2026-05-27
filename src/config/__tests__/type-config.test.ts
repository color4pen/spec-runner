import { describe, it, expect } from "vitest";
import { getConventionalPrefix } from "../type-config.js";

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
