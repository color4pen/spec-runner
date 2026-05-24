/**
 * Tests for src/cli/flag-parser.ts
 *
 * Coverage:
 *  1-1.  --flag=value form (string flag)
 *  1-2.  --flag value form (space-separated, string flag)
 *  1-3.  boolean flags
 *  1-4.  boolean flag with =value (value ignored)
 *  1-5.  -h → help: true
 *  1-6.  positional extraction (no flags)
 *  1-7.  mixed positional and flags
 *  1-8.  unknown flag → FlagParseError
 *  1-9.  enum constraint violation → FlagParseError
 *  1-10. valid enum value passes through
 *  1-11. required positional missing → FlagParseError
 *  1-12. optional positional missing → no error
 *  1-13. string flag with no following value → FlagParseError
 *  1-14. flag before positional (order independence)
 */
import { describe, it, expect } from "vitest";
import { parseFlags, FlagParseError } from "../../../src/cli/flag-parser.js";

// 1-1. --flag=value form (string flag)
describe("1-1: --flag=value form", () => {
  it("parses string flag with = syntax", () => {
    const result = parseFlags(["--pr=123"], { pr: { type: "string" } });
    expect(result.flags["pr"]).toBe("123");
    expect(result.positional).toBeUndefined();
  });
});

// 1-2. --flag value form (space-separated)
describe("1-2: --flag value form (space-separated)", () => {
  it("consumes next arg as string flag value", () => {
    const result = parseFlags(["--type", "spec-change"], { type: { type: "string" } });
    expect(result.flags["type"]).toBe("spec-change");
    expect(result.positional).toBeUndefined();
  });
});

// 1-3. boolean flags
describe("1-3: boolean flags", () => {
  it("sets boolean flags to true", () => {
    const result = parseFlags(
      ["--verbose", "--force"],
      { verbose: { type: "boolean" }, force: { type: "boolean" } },
    );
    expect(result.flags["verbose"]).toBe(true);
    expect(result.flags["force"]).toBe(true);
  });
});

// 1-4. boolean flag with =value (value part ignored)
describe("1-4: boolean flag with =value (value ignored)", () => {
  it("ignores the value part for boolean flags", () => {
    const result = parseFlags(["--dry-run=anything"], { "dry-run": { type: "boolean" } });
    expect(result.flags["dry-run"]).toBe(true);
  });
});

// 1-5. -h → help: true
describe("1-5: -h maps to help: true", () => {
  it("maps -h to help: true", () => {
    const result = parseFlags(["-h"], { help: { type: "boolean" } });
    expect(result.flags["help"]).toBe(true);
  });
});

// 1-6. positional argument extraction
describe("1-6: positional argument extraction", () => {
  it("captures first non-flag argument as positional", () => {
    const result = parseFlags(
      ["my-slug"],
      {},
      { name: "slug", required: true },
    );
    expect(result.positional).toBe("my-slug");
  });
});

// 1-7. mixed positional and flags
describe("1-7: mixed positional and flags", () => {
  it("correctly parses positional and flags in any order", () => {
    const result = parseFlags(
      ["my-slug", "--force", "--from", "critic"],
      { force: { type: "boolean" }, from: { type: "string" } },
      { name: "slug", required: true },
    );
    expect(result.positional).toBe("my-slug");
    expect(result.flags["force"]).toBe(true);
    expect(result.flags["from"]).toBe("critic");
  });
});

// 1-8. unknown flag → FlagParseError
describe("1-8: unknown flag throws FlagParseError", () => {
  it("throws FlagParseError for unknown flags", () => {
    expect(() =>
      parseFlags(["--unknown-flag"], { force: { type: "boolean" } }),
    ).toThrow(FlagParseError);
  });

  it("error message contains the unknown flag name", () => {
    expect(() =>
      parseFlags(["--unknown-flag"], { force: { type: "boolean" } }),
    ).toThrow("--unknown-flag");
  });
});

// 1-9. enum constraint violation → FlagParseError
describe("1-9: enum constraint violation throws FlagParseError", () => {
  it("throws FlagParseError for invalid enum value", () => {
    expect(() =>
      parseFlags(
        ["--runtime=invalid"],
        { runtime: { type: "string", values: ["managed", "local"] as const } },
      ),
    ).toThrow(FlagParseError);
  });

  it("error message contains the invalid value and valid values", () => {
    try {
      parseFlags(
        ["--runtime=invalid"],
        { runtime: { type: "string", values: ["managed", "local"] as const } },
      );
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FlagParseError);
      expect((e as FlagParseError).message).toContain("invalid");
      expect((e as FlagParseError).message).toMatch(/managed|local/);
    }
  });
});

// 1-10. valid enum value passes
describe("1-10: valid enum value passes through", () => {
  it("accepts a value that is in the enum constraint", () => {
    const result = parseFlags(
      ["--from=fixer"],
      { from: { type: "string", values: ["critic", "fixer", "creator"] as const } },
    );
    expect(result.flags["from"]).toBe("fixer");
  });
});

// 1-11. required positional missing → FlagParseError
describe("1-11: required positional missing throws FlagParseError", () => {
  it("throws FlagParseError when required positional is absent", () => {
    expect(() =>
      parseFlags([], {}, { name: "file", required: true }),
    ).toThrow(FlagParseError);
  });

  it("error message contains the positional name", () => {
    expect(() =>
      parseFlags([], {}, { name: "file", required: true }),
    ).toThrow("file");
  });
});

// 1-12. optional positional missing → no error
describe("1-12: optional positional missing returns undefined", () => {
  it("returns undefined positional without throwing", () => {
    const result = parseFlags([], {}, { name: "slug", required: false });
    expect(result.positional).toBeUndefined();
  });
});

// 1-13. string flag with no following value → FlagParseError
describe("1-13: string flag with no following value", () => {
  it("throws FlagParseError when string flag has no value", () => {
    expect(() =>
      parseFlags(["--pr"], { pr: { type: "string" } }),
    ).toThrow(FlagParseError);
  });
});

// 1-14. flag before positional (order independence)
describe("1-14: flag before positional parses correctly", () => {
  it("captures positional even when flags come first", () => {
    const result = parseFlags(
      ["--verbose", "path/to/request.md"],
      { verbose: { type: "boolean" } },
      { name: "request", required: true },
    );
    expect(result.positional).toBe("path/to/request.md");
    expect(result.flags["verbose"]).toBe(true);
  });
});

// 1-15. positionals array collects all non-flag tokens
describe("1-15: positionals array collects all non-flag tokens", () => {
  it("captures multiple non-flag args in positionals array", () => {
    const result = parseFlags(
      ["implementer", "my-rule"],
      {},
      { name: "step-name rule-slug", required: true, count: 2 },
    );
    expect(result.positionals).toEqual(["implementer", "my-rule"]);
  });

  it("positional equals positionals[0]", () => {
    const result = parseFlags(
      ["implementer", "my-rule"],
      {},
      { name: "step-name rule-slug", required: true, count: 2 },
    );
    expect(result.positional).toBe(result.positionals[0]);
    expect(result.positional).toBe("implementer");
  });

  it("positionals is empty array when no non-flag tokens", () => {
    const result = parseFlags(["--verbose"], { verbose: { type: "boolean" } });
    expect(result.positionals).toEqual([]);
    expect(result.positional).toBeUndefined();
  });
});

// 1-16. count: 2 requires at least 2 positionals
describe("1-16: count: 2 requires two positionals", () => {
  it("throws FlagParseError when only one positional is provided", () => {
    expect(() =>
      parseFlags(
        ["implementer"],
        {},
        { name: "step-name rule-slug", required: true, count: 2 },
      ),
    ).toThrow(FlagParseError);
  });

  it("does not throw when exactly 2 positionals are provided", () => {
    expect(() =>
      parseFlags(
        ["implementer", "my-rule"],
        {},
        { name: "step-name rule-slug", required: true, count: 2 },
      ),
    ).not.toThrow();
  });
});
