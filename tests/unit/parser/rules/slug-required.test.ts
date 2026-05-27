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

describe("slug-required — charset validation", () => {
  it("returns error for path traversal slug '../etc/passwd'", () => {
    const result = slugRequired.check(makeRaw({ slug: "../etc/passwd" }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("slug-required");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.field).toBe("slug");
  });

  it("returns error for option injection slug '--upload-pack=evil'", () => {
    const result = slugRequired.check(makeRaw({ slug: "--upload-pack=evil" }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("slug-required");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.field).toBe("slug");
  });

  it("returns error for uppercase slug 'UPPERCASE'", () => {
    const result = slugRequired.check(makeRaw({ slug: "UPPERCASE" }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("slug-required");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.field).toBe("slug");
  });

  it("returns error for slug with spaces 'a b c'", () => {
    const result = slugRequired.check(makeRaw({ slug: "a b c" }));
    expect(result).toHaveLength(1);
    expect(result[0]!.rule).toBe("slug-required");
    expect(result[0]!.severity).toBe("error");
    expect(result[0]!.field).toBe("slug");
  });

  it("returns [] for valid slug 'valid-slug-123'", () => {
    const result = slugRequired.check(makeRaw({ slug: "valid-slug-123" }));
    expect(result).toEqual([]);
  });

  it("returns [] for single character slug 'a'", () => {
    const result = slugRequired.check(makeRaw({ slug: "a" }));
    expect(result).toEqual([]);
  });
});
