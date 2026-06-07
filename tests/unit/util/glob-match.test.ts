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
import { globMatch } from "../../../src/util/glob-match.js";

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
