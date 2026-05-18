import { describe, it, expect } from "vitest";
import { typeRequired } from "../../../../src/parser/rules/type-required.js";
import { makeRaw } from "./helpers.js";

// TC-PR-03
describe("TC-PR-03: type-required — violation", () => {
  it("returns violation when type is null", () => {
    const result = typeRequired.check(makeRaw({ type: null }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("type-required");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.field).toBe("type");
  });
});

// TC-PR-04
describe("TC-PR-04: type-required — pass", () => {
  it("returns [] when type is new-feature", () => {
    const result = typeRequired.check(makeRaw({ type: "new-feature" }));
    expect(result).toEqual([]);
  });
});
