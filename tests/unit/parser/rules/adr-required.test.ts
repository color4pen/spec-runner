import { describe, it, expect } from "vitest";
import { adrRequired } from "../../../../src/parser/rules/adr-required.js";
import { makeRaw } from "./helpers.js";

// TC-PR-09
describe("TC-PR-09: adr-required — violation when both null", () => {
  it("returns violation when adrRaw and adrAnyValue are both null", () => {
    const result = adrRequired.check(makeRaw({ adrRaw: null, adrAnyValue: null }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("adr-required");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.field).toBe("adr");
    expect(result[0]!.message).toContain("missing 'adr' in Meta section");
  });
});

// TC-PR-10
describe("TC-PR-10: adr-required — pass when adrRaw is present", () => {
  it("returns [] when adrRaw is 'true'", () => {
    const result = adrRequired.check(makeRaw({ adrRaw: "true", adrAnyValue: null }));
    expect(result).toEqual([]);
  });
});

describe("adr-required — pass when adrAnyValue is non-null", () => {
  it("returns [] when adrAnyValue is non-null (adr-valid handles this case)", () => {
    const result = adrRequired.check(makeRaw({ adrRaw: null, adrAnyValue: "yes" }));
    expect(result).toEqual([]);
  });
});
