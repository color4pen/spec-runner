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

describe("base-branch-required — charset validation", () => {
  it("returns error for git option injection '--upload-pack=evil'", () => {
    const result = baseBranchRequired.check(makeRaw({ baseBranch: "--upload-pack=evil" }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("base-branch-required");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.field).toBe("baseBranch");
  });

  it("returns error for leading dash '-flag'", () => {
    const result = baseBranchRequired.check(makeRaw({ baseBranch: "-flag" }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("base-branch-required");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.field).toBe("baseBranch");
  });

  it("returns error for shell metachar 'main; rm -rf /'", () => {
    const result = baseBranchRequired.check(makeRaw({ baseBranch: "main; rm -rf /" }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("base-branch-required");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.field).toBe("baseBranch");
  });

  it("returns error for branch name with space 'branch name'", () => {
    const result = baseBranchRequired.check(makeRaw({ baseBranch: "branch name" }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("base-branch-required");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.field).toBe("baseBranch");
  });

  it("returns [] for 'main'", () => {
    const result = baseBranchRequired.check(makeRaw({ baseBranch: "main" }));
    expect(result).toEqual([]);
  });

  it("returns [] for 'release/v1.0' (slash + dot)", () => {
    const result = baseBranchRequired.check(makeRaw({ baseBranch: "release/v1.0" }));
    expect(result).toEqual([]);
  });

  it("returns [] for 'feature/foo-bar' (slash + hyphen)", () => {
    const result = baseBranchRequired.check(makeRaw({ baseBranch: "feature/foo-bar" }));
    expect(result).toEqual([]);
  });

  it("returns [] for 'my_branch' (underscore)", () => {
    const result = baseBranchRequired.check(makeRaw({ baseBranch: "my_branch" }));
    expect(result).toEqual([]);
  });
});
