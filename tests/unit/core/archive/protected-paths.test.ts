/**
 * Unit tests for src/core/archive/protected-paths.ts
 *
 * Covers all scenarios from spec.md § "Evaluate protected-path decision":
 *   - Empty patterns → not blocked (even with truncated=true)
 *   - Non-empty patterns + truncated → blocked (reason: "truncated")
 *   - Matching changed file → blocked (reason: "match", matched list populated)
 *   - No matching changed file → not blocked
 */
import { describe, it, expect } from "vitest";
import { evaluateProtectedPaths } from "../../../../src/core/archive/protected-paths.js";

describe("evaluateProtectedPaths — empty patterns", () => {
  it("returns not-blocked when patterns is empty, even with truncated=true", () => {
    const result = evaluateProtectedPaths({
      changedFiles: [".github/workflows/ci.yml", "src/foo.ts"],
      truncated: true,
      patterns: [],
    });
    expect(result).toEqual({ blocked: false, reason: "none", matched: [] });
  });

  it("returns not-blocked when patterns is empty and no changed files", () => {
    const result = evaluateProtectedPaths({
      changedFiles: [],
      truncated: false,
      patterns: [],
    });
    expect(result).toEqual({ blocked: false, reason: "none", matched: [] });
  });
});

describe("evaluateProtectedPaths — truncated list with non-empty patterns", () => {
  it("blocks with reason 'truncated' when file list is truncated", () => {
    const result = evaluateProtectedPaths({
      changedFiles: [],
      truncated: true,
      patterns: [".github/workflows/**"],
    });
    expect(result).toEqual({ blocked: true, reason: "truncated", matched: [] });
  });

  it("blocks with reason 'truncated' regardless of changedFiles content", () => {
    const result = evaluateProtectedPaths({
      changedFiles: ["src/foo.ts", "README.md"],
      truncated: true,
      patterns: [".github/workflows/**"],
    });
    expect(result).toEqual({ blocked: true, reason: "truncated", matched: [] });
  });
});

describe("evaluateProtectedPaths — matching changed files", () => {
  it("blocks with matched list when a changed file matches the pattern", () => {
    const result = evaluateProtectedPaths({
      changedFiles: [".github/workflows/ci.yml", "src/foo.ts"],
      truncated: false,
      patterns: [".github/workflows/**"],
    });
    expect(result).toEqual({
      blocked: true,
      reason: "match",
      matched: [".github/workflows/ci.yml"],
    });
  });

  it("includes all matching files in the matched list", () => {
    const result = evaluateProtectedPaths({
      changedFiles: [".github/workflows/ci.yml", ".github/workflows/release.yml", "src/foo.ts"],
      truncated: false,
      patterns: [".github/workflows/**"],
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("match");
    expect(result.matched).toContain(".github/workflows/ci.yml");
    expect(result.matched).toContain(".github/workflows/release.yml");
    expect(result.matched).not.toContain("src/foo.ts");
  });

  it("matches against multiple patterns and includes all matched files", () => {
    const result = evaluateProtectedPaths({
      changedFiles: [".github/workflows/ci.yml", "release-please-config.json", "src/foo.ts"],
      truncated: false,
      patterns: [".github/workflows/**", "release-please-config.json"],
    });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("match");
    expect(result.matched).toContain(".github/workflows/ci.yml");
    expect(result.matched).toContain("release-please-config.json");
  });

  it("does not duplicate a file matched by multiple patterns", () => {
    const result = evaluateProtectedPaths({
      changedFiles: [".github/workflows/ci.yml"],
      truncated: false,
      patterns: [".github/**", ".github/workflows/**"],
    });
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toBe(".github/workflows/ci.yml");
  });
});

describe("evaluateProtectedPaths — no matching changed files", () => {
  it("returns not-blocked when no changed file matches any pattern", () => {
    const result = evaluateProtectedPaths({
      changedFiles: ["src/foo.ts", "README.md"],
      truncated: false,
      patterns: [".github/workflows/**"],
    });
    expect(result).toEqual({ blocked: false, reason: "none", matched: [] });
  });

  it("returns not-blocked when changed files is empty and not truncated", () => {
    const result = evaluateProtectedPaths({
      changedFiles: [],
      truncated: false,
      patterns: [".github/workflows/**"],
    });
    expect(result).toEqual({ blocked: false, reason: "none", matched: [] });
  });
});
