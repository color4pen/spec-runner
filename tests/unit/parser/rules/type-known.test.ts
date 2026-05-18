import { describe, it, expect } from "vitest";
import { typeKnown } from "../../../../src/parser/rules/type-known.js";
import { makeRaw } from "./helpers.js";

// TC-PR-05
describe("TC-PR-05: type-known — violation for unknown type", () => {
  it("returns warning violation when type is not in allowlist", () => {
    const result = typeKnown.check(makeRaw({ type: "unknown-type" }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("type-known");
    expect(result[0]!.severity).toBe("warning");
  });
});

// TC-PR-06: type is null → empty (null is type-required's responsibility)
describe("TC-PR-06: type-known — pass when type is null", () => {
  it("returns [] when type is null", () => {
    const result = typeKnown.check(makeRaw({ type: null }));
    expect(result).toEqual([]);
  });
});

describe("type-known — pass for known type", () => {
  it("returns [] for known type bug-fix", () => {
    const result = typeKnown.check(makeRaw({ type: "bug-fix" }));
    expect(result).toEqual([]);
  });
});
