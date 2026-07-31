/*
 * Unit tests for the shared test-file selection module.
 *
 * Covers:
 *   TC-001: non-test files are excluded from the materialized set
 *   TC-002: test-named files are included in the materialized set
 *   TC-003: pipeline artifacts remain excluded even when they match a pattern
 *   TC-004: default patterns apply when scopedTestPatterns is unset
 *   TC-005: configured patterns fully replace the default
 *   TC-015: "**\/" prefix matches both root-level and nested paths
 *   TC-016: "*" does not cross a directory separator
 *   TC-017: literal "." in a pattern is escaped and does not act as a regex wildcard
 *   TC-018: "**" not followed by "/" matches across directory boundaries
 *   TC-019: returns default when config is undefined
 *   TC-020: returns default when config.verification is undefined
 */

import { describe, it, expect } from "vitest";
import {
  selectMaterializedTestFiles,
  matchesGlob,
  resolveScopedTestPatterns,
  DEFAULT_SCOPED_TEST_PATTERNS,
} from "../test-file-selection.js";

// ---------------------------------------------------------------------------
// TC-001: non-test files are excluded from the materialized set
// ---------------------------------------------------------------------------

describe("TC-001: non-test files are excluded from the materialized set", () => {
  it("TC-001: fixture JSON, package.json, .rs, and implementation index.ts are NOT selected under default patterns", () => {
    // GIVEN a base commit whose changed files include non-test files
    const files = [
      "fixtures/data.json",
      "package.json",
      "src/lib.rs",
      "src/feature/index.ts",
    ];

    // WHEN materialized test files are selected with default patterns (no config)
    const selected = selectMaterializedTestFiles(files, undefined);

    // THEN none of those four paths is in the selected set
    expect(selected).not.toContain("fixtures/data.json");
    expect(selected).not.toContain("package.json");
    expect(selected).not.toContain("src/lib.rs");
    expect(selected).not.toContain("src/feature/index.ts");
    expect(selected).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-002: test-named files are included in the materialized set
// ---------------------------------------------------------------------------

describe("TC-002: test-named files are included in the materialized set", () => {
  it("TC-002: *.test.ts, *.spec.ts, and *_test.ts are all selected under default patterns", () => {
    // GIVEN a base commit whose changed files include test-named files
    const files = [
      "src/foo.test.ts",
      "pkg/bar.spec.ts",
      "mod/baz_test.ts",
    ];

    // WHEN materialized test files are selected with default patterns
    const selected = selectMaterializedTestFiles(files, undefined);

    // THEN all three paths are in the selected set
    expect(selected).toContain("src/foo.test.ts");
    expect(selected).toContain("pkg/bar.spec.ts");
    expect(selected).toContain("mod/baz_test.ts");
    expect(selected).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// TC-003: pipeline artifacts remain excluded even when they match a pattern
// ---------------------------------------------------------------------------

describe("TC-003: pipeline artifacts remain excluded even when they match a pattern", () => {
  it("TC-003: specrunner/changes/ artifact is excluded even if it matches a test pattern", () => {
    // GIVEN a base commit whose changed files include a pipeline artifact and a real test file
    const files = [
      "specrunner/changes/x/a.test.md",
      "src/real.test.ts",
    ];

    // WHEN materialized test files are selected
    const selected = selectMaterializedTestFiles(files, undefined);

    // THEN only src/real.test.ts is selected
    expect(selected).not.toContain("specrunner/changes/x/a.test.md");
    expect(selected).toContain("src/real.test.ts");
    expect(selected).toHaveLength(1);
  });

  it("TC-003: .specrunner/ artifact is excluded even if it matches a test pattern", () => {
    const files = [
      ".specrunner/some.test.ts",
      "src/real.test.ts",
    ];

    const selected = selectMaterializedTestFiles(files, undefined);

    expect(selected).not.toContain(".specrunner/some.test.ts");
    expect(selected).toContain("src/real.test.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-004: default patterns apply when scopedTestPatterns is unset
// ---------------------------------------------------------------------------

describe("TC-004: default patterns apply when scopedTestPatterns is unset", () => {
  it("TC-004: config with no verification field uses default — test-named selected, .rs not", () => {
    // GIVEN a config whose verification does not declare scopedTestPatterns
    const config = { version: 1 as const, agents: {} };

    // WHEN files are selected
    const files = ["src/a.test.ts", "src/a.rs"];
    const selected = selectMaterializedTestFiles(files, config);

    // THEN src/a.test.ts is selected and src/a.rs is not
    expect(selected).toContain("src/a.test.ts");
    expect(selected).not.toContain("src/a.rs");
  });

  it("TC-004: config with verification but no scopedTestPatterns uses default patterns", () => {
    const config = {
      version: 1 as const,
      agents: {},
      verification: { scopedTestCommand: "bun test" },
    };

    const files = ["src/b.spec.ts", "src/b.rs"];
    const selected = selectMaterializedTestFiles(files, config);

    expect(selected).toContain("src/b.spec.ts");
    expect(selected).not.toContain("src/b.rs");
  });
});

// ---------------------------------------------------------------------------
// TC-005: configured patterns fully replace the default
// ---------------------------------------------------------------------------

describe("TC-005: configured patterns fully replace the default", () => {
  it("TC-005: scopedTestPatterns: [\"**/*_spec.rb\"] selects _spec.rb but not *.test.ts", () => {
    // GIVEN a config with verification.scopedTestPatterns: ["**/*_spec.rb"]
    // (Ruby convention uses underscore separator: model_spec.rb, not model.spec.rb)
    const config = {
      version: 1 as const,
      agents: {},
      verification: {
        scopedTestPatterns: ["**/*_spec.rb"],
      },
    };

    // WHEN files spec/model_spec.rb and src/a.test.ts are selected
    const files = ["spec/model_spec.rb", "src/a.test.ts"];
    const selected = selectMaterializedTestFiles(files, config);

    // THEN spec/model_spec.rb is selected and src/a.test.ts is not
    expect(selected).toContain("spec/model_spec.rb");
    expect(selected).not.toContain("src/a.test.ts");
  });

  it("TC-005: custom patterns fully replace default — default-named files are excluded", () => {
    const config = {
      version: 1 as const,
      agents: {},
      verification: {
        scopedTestPatterns: ["**/*_test.go"],
      },
    };

    const files = ["pkg/foo_test.go", "src/bar.test.ts", "src/baz.spec.ts"];
    const selected = selectMaterializedTestFiles(files, config);

    expect(selected).toContain("pkg/foo_test.go");
    expect(selected).not.toContain("src/bar.test.ts");
    expect(selected).not.toContain("src/baz.spec.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-015: `**/` prefix matches both root-level and nested paths
// ---------------------------------------------------------------------------

describe("TC-015: `**/` prefix matches both root-level and nested paths", () => {
  it("TC-015: **/*.test.* matches foo.test.ts at root level", () => {
    // GIVEN the glob pattern **/*.test.*
    // WHEN matchesGlob is called with "foo.test.ts" (no directory)
    expect(matchesGlob("foo.test.ts", "**/*.test.*")).toBe(true);
  });

  it("TC-015: **/*.test.* matches a/b/foo.test.ts (nested)", () => {
    // WHEN matchesGlob is called with "a/b/foo.test.ts" (nested)
    expect(matchesGlob("a/b/foo.test.ts", "**/*.test.*")).toBe(true);
  });

  it("TC-015: **/*.test.* does not match src/lib.rs", () => {
    expect(matchesGlob("src/lib.rs", "**/*.test.*")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-016: `*` does not cross a directory separator
// ---------------------------------------------------------------------------

describe("TC-016: `*` does not cross a directory separator", () => {
  it("TC-016: *.test.ts matches foo.test.ts (no directory)", () => {
    // GIVEN the glob pattern *.test.ts (no **/ prefix)
    // WHEN matchesGlob is called with "foo.test.ts"
    expect(matchesGlob("foo.test.ts", "*.test.ts")).toBe(true);
  });

  it("TC-016: *.test.ts does NOT match src/foo.test.ts (crosses directory)", () => {
    // WHEN matchesGlob is called with "src/foo.test.ts"
    // THEN it does not match (single * stays within one path segment)
    expect(matchesGlob("src/foo.test.ts", "*.test.ts")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-017: literal `.` in a pattern is escaped
// ---------------------------------------------------------------------------

describe("TC-017: literal `.` in a pattern is escaped and does not act as a regex wildcard", () => {
  it("TC-017: **/*.test.* does NOT match foo_testXts (dot replaced with arbitrary char)", () => {
    // GIVEN the glob pattern **/*.test.*
    // WHEN matchesGlob is called with "foo_testXts" (dot replaced with an arbitrary character)
    // THEN returns false (the literal `.` in `.test.` is not treated as a regex `.`)
    expect(matchesGlob("foo_testXts", "**/*.test.*")).toBe(false);
  });

  it("TC-017: **/*.test.* does NOT match foo_testts (dot omitted)", () => {
    expect(matchesGlob("foo_testts", "**/*.test.*")).toBe(false);
  });

  it("TC-017: **/*.test.* DOES match foo.test.ts (literal dots)", () => {
    expect(matchesGlob("foo.test.ts", "**/*.test.*")).toBe(true);
  });

  it("TC-017: **/*.test.* does NOT match foo_test_ts (underscore in dot position)", () => {
    // "." in the pattern compiles to "\." — underscore is not a match.
    // A file named with underscores throughout has no literal "." where ".test." requires one.
    expect(matchesGlob("foo_test_ts", "**/*.test.*")).toBe(false);
  });

  it("TC-017: default patterns do NOT select x_test_helpers.ts (no literal dot after _test)", () => {
    // **/*_test.* requires "_test" followed immediately by a literal ".".
    // "x_test_helpers.ts" has "_" after "_test", not ".", so it is a helper — not a test entry.
    const selected = selectMaterializedTestFiles(["x_test_helpers.ts"], undefined);
    expect(selected).not.toContain("x_test_helpers.ts");
    expect(selected).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-018: `**` not followed by `/` matches across directory boundaries
// ---------------------------------------------------------------------------

describe("TC-018: `**` not followed by `/` matches across directory boundaries", () => {
  it("TC-018: src/**test.ts matches src/a/b/foo_test.ts (globstar without trailing slash)", () => {
    // GIVEN a glob pattern containing ** not followed by /
    // WHEN matchesGlob is called with a path crossing directories
    expect(matchesGlob("src/a/b/foo_test.ts", "src/**test.ts")).toBe(true);
  });

  it("TC-018: **_test.ts matches deeply nested path", () => {
    expect(matchesGlob("a/b/c/mod_test.ts", "**_test.ts")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-019: returns default when config is undefined
// ---------------------------------------------------------------------------

describe("TC-019: resolveScopedTestPatterns returns default when config is undefined", () => {
  it("TC-019: undefined config → returns a copy of DEFAULT_SCOPED_TEST_PATTERNS", () => {
    // GIVEN resolveScopedTestPatterns is called with undefined as the config argument
    const result = resolveScopedTestPatterns(undefined);

    // THEN it returns a copy of DEFAULT_SCOPED_TEST_PATTERNS
    expect(result).toEqual([...DEFAULT_SCOPED_TEST_PATTERNS]);
    expect(result).toHaveLength(DEFAULT_SCOPED_TEST_PATTERNS.length);
    // It is a copy, not the same reference
    expect(result).not.toBe(DEFAULT_SCOPED_TEST_PATTERNS);
  });

  it("TC-019: DEFAULT_SCOPED_TEST_PATTERNS contains the three expected patterns", () => {
    expect(DEFAULT_SCOPED_TEST_PATTERNS).toContain("**/*.test.*");
    expect(DEFAULT_SCOPED_TEST_PATTERNS).toContain("**/*.spec.*");
    expect(DEFAULT_SCOPED_TEST_PATTERNS).toContain("**/*_test.*");
  });
});

// ---------------------------------------------------------------------------
// TC-020: returns default when config.verification is undefined
// ---------------------------------------------------------------------------

describe("TC-020: resolveScopedTestPatterns returns default when config.verification is undefined", () => {
  it("TC-020: config with no verification property → returns DEFAULT_SCOPED_TEST_PATTERNS copy", () => {
    // GIVEN a config object whose verification property is absent
    const config = { version: 1 as const, agents: {} };

    // WHEN resolveScopedTestPatterns is called
    const result = resolveScopedTestPatterns(config);

    // THEN it returns a copy of DEFAULT_SCOPED_TEST_PATTERNS
    expect(result).toEqual([...DEFAULT_SCOPED_TEST_PATTERNS]);
  });

  it("TC-020: config with verification but no scopedTestPatterns → returns DEFAULT_SCOPED_TEST_PATTERNS", () => {
    const config = {
      version: 1 as const,
      agents: {},
      verification: { commands: ["bun test"] },
    };

    const result = resolveScopedTestPatterns(config);

    expect(result).toEqual([...DEFAULT_SCOPED_TEST_PATTERNS]);
  });
});
