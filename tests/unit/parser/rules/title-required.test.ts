import { describe, it, expect } from "vitest";
import { titleRequired } from "../../../../src/parser/rules/title-required.js";
import { makeRaw } from "./helpers.js";

// TC-PR-01: title is null → violation
describe("TC-PR-01: title-required — violation", () => {
  it("returns violation when title is null", () => {
    const result = titleRequired.check(makeRaw({ title: null }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("title-required");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.field).toBe("title");
  });
});

// TC-PR-02: title is non-null → empty array
describe("TC-PR-02: title-required — pass", () => {
  it("returns [] when title is present", () => {
    const result = titleRequired.check(makeRaw({ title: "Hello" }));
    expect(result).toEqual([]);
  });
});
