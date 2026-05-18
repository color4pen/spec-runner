import { describe, it, expect } from "vitest";
import { adrValid } from "../../../../src/parser/rules/adr-valid.js";
import { makeRaw } from "./helpers.js";

// TC-PR-11
describe("TC-PR-11: adr-valid — violation when adrRaw=null but adrAnyValue is set", () => {
  it("returns violation when invalid adr value provided", () => {
    const result = adrValid.check(makeRaw({ adrRaw: null, adrAnyValue: "yes" }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("adr-valid");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.message).toContain("invalid value for 'adr'");
  });
});

// TC-PR-12
describe("TC-PR-12: adr-valid — pass when adrRaw is present", () => {
  it("returns [] when adrRaw is 'false'", () => {
    const result = adrValid.check(makeRaw({ adrRaw: "false", adrAnyValue: null }));
    expect(result).toEqual([]);
  });
});

// TC-PR-13
describe("TC-PR-13: adr-valid — pass when both null (adr-required handles this)", () => {
  it("returns [] when both adrRaw and adrAnyValue are null", () => {
    const result = adrValid.check(makeRaw({ adrRaw: null, adrAnyValue: null }));
    expect(result).toEqual([]);
  });
});
