import { describe, it, expect } from "vitest";
import { slugRequired } from "../../../../src/parser/rules/slug-required.js";
import { makeRaw } from "./helpers.js";

// TC-PR-07
describe("TC-PR-07: slug-required — violation", () => {
  it("returns violation when slug is null", () => {
    const result = slugRequired.check(makeRaw({ slug: null }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("slug-required");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.field).toBe("slug");
  });

  it("returns violation when slug is empty string", () => {
    const result = slugRequired.check(makeRaw({ slug: "" }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("slug-required");
  });
});

describe("slug-required — pass", () => {
  it("returns [] when slug is present", () => {
    const result = slugRequired.check(makeRaw({ slug: "my-slug" }));
    expect(result).toEqual([]);
  });
});
