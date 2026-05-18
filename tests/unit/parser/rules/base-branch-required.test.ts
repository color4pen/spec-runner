import { describe, it, expect } from "vitest";
import { baseBranchRequired } from "../../../../src/parser/rules/base-branch-required.js";
import { makeRaw } from "./helpers.js";

// TC-PR-08
describe("TC-PR-08: base-branch-required — violation", () => {
  it("returns violation when baseBranch is null", () => {
    const result = baseBranchRequired.check(makeRaw({ baseBranch: null }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("base-branch-required");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.field).toBe("baseBranch");
  });

  it("returns violation when baseBranch is empty string", () => {
    const result = baseBranchRequired.check(makeRaw({ baseBranch: "" }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("base-branch-required");
  });
});

describe("base-branch-required — pass", () => {
  it("returns [] when baseBranch is present", () => {
    const result = baseBranchRequired.check(makeRaw({ baseBranch: "main" }));
    expect(result).toEqual([]);
  });
});
