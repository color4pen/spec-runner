/**
 * Unit tests for src/core/verification/lcov.ts
 *
 * TC-LCOV-01: Basic SF/DA parsing — file → line → count map
 * TC-LCOV-02: Multiple files in one lcov text
 * TC-LCOV-03: SF absolute path under cwd → normalized to relative
 * TC-LCOV-04: SF with leading "./" → stripped
 * TC-LCOV-05: SF already relative (no "./" prefix) → unchanged
 * TC-LCOV-06: Empty string → empty Map
 * TC-LCOV-07: No SF records → empty Map
 * TC-LCOV-08: Non-DA records (FN, LF, LH, BRDA) are ignored
 * TC-LCOV-09: Multiple DA records on same line → counts summed
 * TC-LCOV-10: DA line with checksum field → parsed correctly
 * TC-LCOV-11: Missing end_of_record → last section still captured
 * TC-LCOV-12: SF absolute path NOT under cwd → kept as-is
 */
import { describe, it, expect } from "vitest";
import { parseLcov, normalizeSfPath } from "../../../../src/core/verification/lcov.js";

const CWD = "/repo/root";

// ---------------------------------------------------------------------------
// normalizeSfPath tests
// ---------------------------------------------------------------------------

describe("normalizeSfPath", () => {
  it("TC-LCOV-03: absolute path under cwd → stripped to relative", () => {
    expect(normalizeSfPath("/repo/root/src/foo.ts", CWD)).toBe("src/foo.ts");
  });

  it("TC-LCOV-04: relative path with leading './' → stripped", () => {
    expect(normalizeSfPath("./src/foo.ts", CWD)).toBe("src/foo.ts");
  });

  it("TC-LCOV-05: relative path without './' → unchanged", () => {
    expect(normalizeSfPath("src/foo.ts", CWD)).toBe("src/foo.ts");
  });

  it("TC-LCOV-12: absolute path NOT under cwd → kept as-is", () => {
    // Should not panic — just keep as absolute (won't match any changed file key)
    const result = normalizeSfPath("/other/path/file.ts", CWD);
    expect(result).toBe("/other/path/file.ts");
  });

  it("absolute path with trailing slashes in cwd → handled correctly", () => {
    expect(normalizeSfPath("/repo/root/src/bar.ts", "/repo/root/")).toBe("src/bar.ts");
  });

  it("multiple leading './' → all stripped", () => {
    expect(normalizeSfPath("././src/foo.ts", CWD)).toBe("src/foo.ts");
  });
});

// ---------------------------------------------------------------------------
// parseLcov tests
// ---------------------------------------------------------------------------

const BASIC_LCOV = `
SF:src/foo.ts
DA:1,0
DA:2,3
DA:5,1
end_of_record
`.trim();

describe("TC-LCOV-01: Basic SF/DA parsing", () => {
  it("returns correct line → count map for a single file", () => {
    const result = parseLcov(BASIC_LCOV, CWD);
    expect(result.size).toBe(1);
    expect(result.has("src/foo.ts")).toBe(true);
    const lines = result.get("src/foo.ts")!;
    expect(lines.get(1)).toBe(0);
    expect(lines.get(2)).toBe(3);
    expect(lines.get(5)).toBe(1);
  });
});

describe("TC-LCOV-02: Multiple files", () => {
  it("returns correct maps for each file", () => {
    const lcov = `
SF:src/foo.ts
DA:1,0
end_of_record
SF:src/bar.ts
DA:10,5
DA:11,0
end_of_record
`.trim();

    const result = parseLcov(lcov, CWD);
    expect(result.size).toBe(2);

    const foo = result.get("src/foo.ts")!;
    expect(foo.get(1)).toBe(0);

    const bar = result.get("src/bar.ts")!;
    expect(bar.get(10)).toBe(5);
    expect(bar.get(11)).toBe(0);
  });
});

describe("TC-LCOV-03: Absolute SF paths normalized", () => {
  it("absolute path under cwd → normalized key in result", () => {
    const lcov = `SF:${CWD}/src/foo.ts\nDA:1,1\nend_of_record`;
    const result = parseLcov(lcov, CWD);
    expect(result.has("src/foo.ts")).toBe(true);
    expect(result.has(`${CWD}/src/foo.ts`)).toBe(false);
  });
});

describe("TC-LCOV-04: './'-prefixed SF paths normalized", () => {
  it("'./src/foo.ts' → normalized to 'src/foo.ts'", () => {
    const lcov = `SF:./src/foo.ts\nDA:5,2\nend_of_record`;
    const result = parseLcov(lcov, CWD);
    expect(result.has("src/foo.ts")).toBe(true);
  });
});

describe("TC-LCOV-06: Empty string → empty Map", () => {
  it("empty text → empty Map", () => {
    expect(parseLcov("", CWD).size).toBe(0);
  });
});

describe("TC-LCOV-07: No SF records → empty Map", () => {
  it("text without SF lines → empty Map", () => {
    const text = "LF:10\nLH:8\nend_of_record\n";
    expect(parseLcov(text, CWD).size).toBe(0);
  });
});

describe("TC-LCOV-08: Non-DA records ignored", () => {
  it("FN, LF, LH, BRDA lines are ignored; only DA lines are captured", () => {
    const lcov = `
SF:src/foo.ts
FN:1,myFunc
FNDA:1,myFunc
FNF:1
FNH:1
BRDA:1,0,0,1
LF:5
LH:3
DA:1,2
DA:2,0
end_of_record
`.trim();

    const result = parseLcov(lcov, CWD);
    expect(result.has("src/foo.ts")).toBe(true);
    const lines = result.get("src/foo.ts")!;
    expect(lines.size).toBe(2);
    expect(lines.get(1)).toBe(2);
    expect(lines.get(2)).toBe(0);
  });
});

describe("TC-LCOV-09: Multiple DA on same line → counts summed", () => {
  it("two DA:3,2 and DA:3,5 → line 3 count = 7", () => {
    const lcov = `SF:src/foo.ts\nDA:3,2\nDA:3,5\nend_of_record`;
    const result = parseLcov(lcov, CWD);
    expect(result.get("src/foo.ts")?.get(3)).toBe(7);
  });
});

describe("TC-LCOV-10: DA with checksum field", () => {
  it("DA:1,3,abc123 → line 1, count 3", () => {
    const lcov = `SF:src/foo.ts\nDA:1,3,abc123\nend_of_record`;
    const result = parseLcov(lcov, CWD);
    expect(result.get("src/foo.ts")?.get(1)).toBe(3);
  });
});

describe("TC-LCOV-11: Missing end_of_record → last section still captured", () => {
  it("file without end_of_record terminator → still included in result", () => {
    const lcov = `SF:src/foo.ts\nDA:1,1\nDA:2,0`;
    const result = parseLcov(lcov, CWD);
    expect(result.has("src/foo.ts")).toBe(true);
    const lines = result.get("src/foo.ts")!;
    expect(lines.get(1)).toBe(1);
    expect(lines.get(2)).toBe(0);
  });
});
