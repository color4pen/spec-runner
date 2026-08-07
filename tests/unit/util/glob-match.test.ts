/**
 * Unit tests for src/util/glob-match.ts
 *
 * Covers all scenarios from spec.md:
 *   - Single-segment wildcard matches one segment, not crossing slash
 *   - Double-star matches across segments
 *   - Leading double-star matches any directory depth
 *   - Literal pattern matches exact path only
 *   - Question mark matches one non-slash character
 */
import { describe, it, expect } from "vitest";
import { globMatch, matchesGlob } from "../../../src/util/glob-match.js";

describe("globMatch — single-segment wildcard (*)", () => {
  it("matches a filename within the same directory", () => {
    expect(globMatch(".github/workflows/release.yml", ".github/workflows/*")).toBe(true);
  });

  it("does not match across a slash", () => {
    expect(globMatch(".github/workflows/nested/deploy.yml", ".github/workflows/*")).toBe(false);
  });

  it("matches zero characters within a segment", () => {
    expect(globMatch("src/index.ts", "src/*.ts")).toBe(true);
  });
});

describe("globMatch — double-star (**)", () => {
  it("matches across directory boundaries", () => {
    expect(globMatch(".github/workflows/release.yml", ".github/**")).toBe(true);
  });

  it("matches deeply nested paths", () => {
    expect(globMatch(".github/workflows/ci/release.yml", ".github/**")).toBe(true);
  });

  it("matches exact same directory level", () => {
    expect(globMatch(".github/CODEOWNERS", ".github/**")).toBe(true);
  });
});

describe("globMatch — leading **/ matches any directory depth", () => {
  it("matches a/b/c.yml with **/*.yml", () => {
    expect(globMatch("a/b/c.yml", "**/*.yml")).toBe(true);
  });

  it("matches top-level file with **/*.yml", () => {
    expect(globMatch("release.yml", "**/*.yml")).toBe(true);
  });

  it("does not match wrong extension", () => {
    expect(globMatch("a/b/c.ts", "**/*.yml")).toBe(false);
  });
});

describe("globMatch — literal pattern", () => {
  it("matches exact path", () => {
    expect(globMatch("release-please-config.json", "release-please-config.json")).toBe(true);
  });

  it("does not match with directory prefix", () => {
    expect(globMatch("docs/release-please-config.json", "release-please-config.json")).toBe(false);
  });

  it("does not match with trailing suffix", () => {
    expect(globMatch("release-please-config.json.bak", "release-please-config.json")).toBe(false);
  });
});

describe("globMatch — question mark (?)", () => {
  it("matches exactly one non-slash character", () => {
    expect(globMatch("src/foox.ts", "src/foo?.ts")).toBe(true);
  });

  it("does not match zero characters", () => {
    expect(globMatch("src/foo.ts", "src/foo?.ts")).toBe(false);
  });

  it("does not match a slash", () => {
    expect(globMatch("src/foo/bar.ts", "src/foo?.ts")).toBe(false);
  });
});

describe("globMatch — negative cases", () => {
  it("pattern with no wildcards does not match different path", () => {
    expect(globMatch("src/foo.ts", "src/bar.ts")).toBe(false);
  });

  it("* does not match empty string in middle of path", () => {
    // pattern src/*.ts should NOT match src/a/b.ts
    expect(globMatch("src/a/b.ts", "src/*.ts")).toBe(false);
  });

  it("case-sensitive: uppercase does not match lowercase pattern", () => {
    expect(globMatch("SRC/foo.ts", "src/foo.ts")).toBe(false);
  });
});

describe("globMatch — edge cases", () => {
  it(".github/workflows/** matches .github/workflows/ci.yml", () => {
    expect(globMatch(".github/workflows/ci.yml", ".github/workflows/**")).toBe(true);
  });

  it("bare ** matches any path", () => {
    expect(globMatch("any/path/here.txt", "**")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-007, TC-008: **/ segment-non-empty semantics (semantic-pinning)
// ---------------------------------------------------------------------------

describe("TC-007/TC-008: globMatch — **/segment non-empty semantics (semantic-pinning)", () => {
  it(
    // TC-007
    "TC-007: a/**/b does NOT match a//b (empty segment rejected — git/minimatch semantics)",
    () => {
      // GIVEN globMatch("a//b", "a/**/b")
      // WHEN executed
      // THEN false — **/  requires at least one non-empty segment between a/ and b
      expect(globMatch("a//b", "a/**/b")).toBe(false);
    },
  );

  it(
    // TC-008
    "TC-008: a/**/b matches a/x/b (non-empty intermediate segment)",
    () => {
      // GIVEN globMatch("a/x/b", "a/**/b")
      // WHEN executed
      // THEN true
      expect(globMatch("a/x/b", "a/**/b")).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-009: production pattern representative cases
// ---------------------------------------------------------------------------

describe("TC-009: globMatch — production pattern representative cases", () => {
  it(
    // TC-009
    "TC-009: src/** matches src/foo.ts",
    () => {
      expect(globMatch("src/foo.ts", "src/**")).toBe(true);
    },
  );

  it(
    // TC-009
    "TC-009: vendor/** matches vendor/lib.ts",
    () => {
      expect(globMatch("vendor/lib.ts", "vendor/**")).toBe(true);
    },
  );

  it(
    // TC-009
    "TC-009: **/*.test.* matches top-level foo.test.ts",
    () => {
      expect(globMatch("foo.test.ts", "**/*.test.*")).toBe(true);
    },
  );

  it(
    // TC-009
    "TC-009: **/*.test.* matches nested src/foo.test.ts",
    () => {
      expect(globMatch("src/foo.test.ts", "**/*.test.*")).toBe(true);
    },
  );

  it(
    // TC-009
    "TC-009: exact path literal matches itself",
    () => {
      expect(globMatch("exact/path.ts", "exact/path.ts")).toBe(true);
    },
  );

  it(
    // TC-009
    "TC-009: exact path literal does not match a different path",
    () => {
      expect(globMatch("other/path.ts", "exact/path.ts")).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-014, TC-015: injection safety (migrated from src/core/reviewers/__tests__/glob-match.test.ts)
// ---------------------------------------------------------------------------

describe("TC-014/TC-015: globMatch — injection safety", () => {
  it(
    // TC-014
    "TC-014: literal '.' in pattern does not match arbitrary character (src/authXts ≠ src/auth.ts pattern)",
    () => {
      // GIVEN globMatch("src/auth.ts", "src/authXts")
      // WHEN executed
      // THEN false — '.' in pattern is escaped to '\.' and does not match 'X'
      expect(globMatch("src/auth.ts", "src/authXts")).toBe(false);
      expect(globMatch("src/auth.ts", "src/auth.ts")).toBe(true);
    },
  );

  it(
    // TC-015
    "TC-015: parentheses in pattern are escaped and do not cause regex parse error",
    () => {
      // GIVEN globMatch("(invalid)", "(invalid)") and globMatch("(invalid)", "invalid")
      // WHEN executed
      // THEN true and false respectively
      expect(globMatch("(invalid)", "(invalid)")).toBe(true);
      expect(globMatch("(invalid)", "invalid")).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-006, TC-016: matchesGlob delegates to globMatch (? now works as wildcard)
// ---------------------------------------------------------------------------

describe("TC-006/TC-016: matchesGlob — delegation to globMatch (? wildcard)", () => {
  it(
    // TC-006
    "TC-006: matchesGlob('src/foox.ts', 'src/foo?.ts') is true (? as wildcard via delegation)",
    () => {
      // GIVEN matchesGlob delegates to globMatch after T-01
      // WHEN matchesGlob("src/foox.ts", "src/foo?.ts")
      // THEN true — ? matches the single char 'x'
      // RED until T-01 makes matchesGlob delegate to globMatch
      expect(matchesGlob("src/foox.ts", "src/foo?.ts")).toBe(true);
    },
  );

  it(
    // TC-016
    "TC-016: matchesGlob('src/foo.ts', 'src/foo?.ts') is false (? must match exactly 1 char)",
    () => {
      // GIVEN matchesGlob("src/foo.ts", "src/foo?.ts")
      // WHEN executed
      // THEN false — ? requires exactly 1 char; 'foo.ts' has 0 chars at the ? position
      expect(matchesGlob("src/foo.ts", "src/foo?.ts")).toBe(false);
    },
  );
});
