/**
 * Unit tests for the guarded-staging containment module.
 *
 * Covers:
 *   TC-010 (must):   applyStagingExclusions with empty patterns returns all paths unchanged
 *   TC-011 (must):   resolveMaxStagedFiles returns default 2000 when config absent / no pipeline block
 *   TC-012 (must):   resolveMaxStagedFiles returns configured value when pipeline.maxStagedFiles is set
 *   TC-013 (must):   resolveStagingExcludePatterns returns [] when field is absent
 *   TC-014 (must):   resolveStagingExcludePatterns returns a copy of the configured array when present
 *   TC-015 (must):   summarizeTopDirectories groups by first path segment, sorts by count descending
 *   TC-016 (should): summarizeTopDirectories truncates to topN entries
 *   TC-017 (must):   stagingLimitExceededError message includes total count, top-directory breakdown,
 *                    and both remedy hints
 *   TC-019 (should): matchesGlob from shared util handles **\/ prefix, * non-crossing, vendor/**
 *
 * RED state: all tests fail until:
 *   - src/core/step/staging-containment.ts is created (T-02)
 *   - src/util/glob-match.ts is created (T-01)
 *   - stagingLimitExceededError is added to src/errors.ts (T-04)
 */

import { describe, it, expect } from "vitest";
import {
  applyStagingExclusions,
  resolveMaxStagedFiles,
  resolveStagingExcludePatterns,
  summarizeTopDirectories,
  DEFAULT_MAX_STAGED_FILES,
} from "../staging-containment.js";
import { stagingLimitExceededError } from "../../../errors.js";
import { matchesGlob } from "../../../util/glob-match.js";

// ---------------------------------------------------------------------------
// TC-010: applyStagingExclusions with empty patterns returns all paths unchanged
// ---------------------------------------------------------------------------

describe("TC-010: applyStagingExclusions with empty patterns returns all paths unchanged", () => {
  it(
    // TC-010
    "TC-010: empty excludePatterns returns the input paths array unchanged",
    () => {
      // GIVEN applyStagingExclusions is called with a non-empty paths array and empty patterns
      const paths = [
        ".cargo-tmp/registry/cache.json",
        "vendor/lodash/index.js",
        "src/lib.rs",
      ];

      // WHEN the function returns with empty patterns []
      const result = applyStagingExclusions(paths, []);

      // THEN the returned array equals the input paths array with no elements removed
      expect(result).toEqual(paths);
      expect(result).toHaveLength(3);
    },
  );

  it(
    // TC-010
    "TC-010: applyStagingExclusions with matching patterns removes the matching paths",
    () => {
      // Also validates the positive case (non-empty patterns do exclude)
      const paths = [
        ".cargo-tmp/registry/cache.json",
        "vendor/lodash/index.js",
        "src/lib.rs",
      ];
      const patterns = ["**/.cargo-tmp/**", ".cargo-tmp/**", "vendor/**"];

      const result = applyStagingExclusions(paths, patterns);

      expect(result).toEqual(["src/lib.rs"]);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-011: resolveMaxStagedFiles returns default 2000 when config absent or has no pipeline block
// ---------------------------------------------------------------------------

describe("TC-011: resolveMaxStagedFiles returns default 2000 when config absent or has no pipeline block", () => {
  it(
    // TC-011
    "TC-011: resolveMaxStagedFiles(undefined) returns DEFAULT_MAX_STAGED_FILES (2000)",
    () => {
      // GIVEN resolveMaxStagedFiles is called with undefined
      // WHEN the function returns
      // THEN the return value is 2000
      expect(resolveMaxStagedFiles(undefined)).toBe(2000);
    },
  );

  it(
    // TC-011
    "TC-011: resolveMaxStagedFiles({}) returns DEFAULT_MAX_STAGED_FILES (2000)",
    () => {
      // GIVEN resolveMaxStagedFiles is called with {} (no pipeline key)
      expect(resolveMaxStagedFiles({} as never)).toBe(2000);
    },
  );

  it(
    // TC-011
    "TC-011: DEFAULT_MAX_STAGED_FILES constant equals 2000",
    () => {
      expect(DEFAULT_MAX_STAGED_FILES).toBe(2000);
    },
  );

  it(
    // TC-011
    "TC-011: resolveMaxStagedFiles with pipeline block but no maxStagedFiles returns 2000",
    () => {
      const config = { version: 1 as const, agents: {}, pipeline: {} };
      expect(resolveMaxStagedFiles(config as never)).toBe(2000);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-012: resolveMaxStagedFiles returns configured value when pipeline.maxStagedFiles is set
// ---------------------------------------------------------------------------

describe("TC-012: resolveMaxStagedFiles returns configured value when pipeline.maxStagedFiles is set", () => {
  it(
    // TC-012
    "TC-012: resolveMaxStagedFiles({ pipeline: { maxStagedFiles: 5000 } }) returns 5000",
    () => {
      // GIVEN resolveMaxStagedFiles is called with { pipeline: { maxStagedFiles: 5000 } }
      // WHEN the function returns
      // THEN the return value is 5000
      const config = { version: 1 as const, agents: {}, pipeline: { maxStagedFiles: 5000 } };
      expect(resolveMaxStagedFiles(config as never)).toBe(5000);
    },
  );

  it(
    // TC-012
    "TC-012: resolveMaxStagedFiles with maxStagedFiles: 1 returns 1",
    () => {
      const config = { version: 1 as const, agents: {}, pipeline: { maxStagedFiles: 1 } };
      expect(resolveMaxStagedFiles(config as never)).toBe(1);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-013: resolveStagingExcludePatterns returns [] when field is absent
// ---------------------------------------------------------------------------

describe("TC-013: resolveStagingExcludePatterns returns [] when field is absent", () => {
  it(
    // TC-013
    "TC-013: resolveStagingExcludePatterns(undefined) returns []",
    () => {
      // GIVEN resolveStagingExcludePatterns is called with undefined
      // WHEN the function returns
      // THEN the return value is an empty array []
      expect(resolveStagingExcludePatterns(undefined)).toEqual([]);
    },
  );

  it(
    // TC-013
    "TC-013: resolveStagingExcludePatterns with no pipeline block returns []",
    () => {
      const config = { version: 1 as const, agents: {} };
      expect(resolveStagingExcludePatterns(config as never)).toEqual([]);
    },
  );

  it(
    // TC-013
    "TC-013: resolveStagingExcludePatterns with pipeline but no stagingExcludePatterns returns []",
    () => {
      const config = { version: 1 as const, agents: {}, pipeline: {} };
      expect(resolveStagingExcludePatterns(config as never)).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-014: resolveStagingExcludePatterns returns a copy of the configured array when present
// ---------------------------------------------------------------------------

describe("TC-014: resolveStagingExcludePatterns returns a copy of the configured array when present", () => {
  it(
    // TC-014
    "TC-014: resolveStagingExcludePatterns with configured patterns returns the patterns",
    () => {
      // GIVEN resolveStagingExcludePatterns is called with { pipeline: { stagingExcludePatterns: [...] } }
      const patterns = ["vendor/**", ".cargo-tmp/**"];
      const config = {
        version: 1 as const,
        agents: {},
        pipeline: { stagingExcludePatterns: patterns },
      };

      // WHEN the function returns
      const result = resolveStagingExcludePatterns(config as never);

      // THEN the return value contains exactly the configured patterns (order preserved)
      expect(result).toEqual(["vendor/**", ".cargo-tmp/**"]);
    },
  );

  it(
    // TC-014
    "TC-014: resolveStagingExcludePatterns returns a distinct array reference from the config value",
    () => {
      const patterns = ["vendor/**", ".cargo-tmp/**"];
      const config = {
        version: 1 as const,
        agents: {},
        pipeline: { stagingExcludePatterns: patterns },
      };

      const result = resolveStagingExcludePatterns(config as never);

      // Must be a copy, not the same reference
      expect(result).not.toBe(patterns);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-015: summarizeTopDirectories groups by first path segment, sorts by count descending
// ---------------------------------------------------------------------------

describe("TC-015: summarizeTopDirectories groups by first path segment, sorts by count descending", () => {
  it(
    // TC-015
    "TC-015: 3 vendor + 2 .cargo-tmp + 1 src + 1 root-file → [vendor:3, .cargo-tmp:2, .:1, src:1]",
    () => {
      // GIVEN a mixed paths array:
      //   3 files under vendor/
      //   2 files under .cargo-tmp/
      //   1 file under src/
      //   1 path with no / (grouped under ".")
      const paths = [
        "vendor/lodash/index.js",
        "vendor/react/index.js",
        "vendor/react/react.js",
        ".cargo-tmp/registry/cache.json",
        ".cargo-tmp/registry/index.json",
        "src/lib.rs",
        "README.md", // no slash → grouped under "."
      ];

      // WHEN summarizeTopDirectories is called
      const result = summarizeTopDirectories(paths);

      // THEN count-descending order, ties broken by dir name ascending
      // vendor (3), .cargo-tmp (2), then .(1) and src(1) in ascending dir-name order
      expect(result[0]).toEqual({ dir: "vendor", count: 3 });
      expect(result[1]).toEqual({ dir: ".cargo-tmp", count: 2 });
      // The two tie entries: "." and "src" — ascending puts "." before "src" (ASCII '.' < 's')
      expect(result[2]).toMatchObject({ count: 1 });
      expect(result[3]).toMatchObject({ count: 1 });
      // Both entries must have count 1 and cover "." and "src"
      const tiedDirs = new Set([result[2]!.dir, result[3]!.dir]);
      expect(tiedDirs).toEqual(new Set([".", "src"]));
    },
  );

  it(
    // TC-015
    "TC-015: each entry has { dir, count } shape",
    () => {
      const paths = ["vendor/a.js", "src/lib.rs"];
      const result = summarizeTopDirectories(paths);
      for (const entry of result) {
        expect(entry).toHaveProperty("dir");
        expect(entry).toHaveProperty("count");
        expect(typeof entry.dir).toBe("string");
        expect(typeof entry.count).toBe("number");
      }
    },
  );

  it(
    // TC-015
    "TC-015: paths with no slash are grouped under '.'",
    () => {
      const paths = ["README.md", "LICENSE", "Makefile"];
      const result = summarizeTopDirectories(paths);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ dir: ".", count: 3 });
    },
  );
});

// ---------------------------------------------------------------------------
// TC-016 (should): summarizeTopDirectories truncates to topN entries
// ---------------------------------------------------------------------------

describe("TC-016 (should): summarizeTopDirectories truncates to topN entries", () => {
  it(
    // TC-016
    "TC-016: topN=2 returns at most 2 entries when there are more than 2 distinct first segments",
    () => {
      // GIVEN paths spanning more than topN distinct first segments
      const paths = [
        "vendor/a.js",
        "vendor/b.js",
        ".cargo-tmp/c.json",
        "src/d.rs",
        "lib/e.ts",
        "tests/f.ts",
      ];

      // WHEN summarizeTopDirectories is called with topN = 2
      const result = summarizeTopDirectories(paths, 2);

      // THEN the result array has exactly 2 entries (the 2 highest-count directories)
      expect(result).toHaveLength(2);
    },
  );

  it(
    // TC-016
    "TC-016: topN=2 returns the 2 entries with the highest counts",
    () => {
      const paths = [
        "vendor/a.js",
        "vendor/b.js",
        ".cargo-tmp/c.json",
        "src/d.rs",
      ];
      // vendor: 2, .cargo-tmp: 1, src: 1

      const result = summarizeTopDirectories(paths, 2);

      expect(result[0]).toEqual({ dir: "vendor", count: 2 });
      // Second entry is one of the count-1 dirs
      expect(result[1]).toMatchObject({ count: 1 });
    },
  );
});

// ---------------------------------------------------------------------------
// TC-017 (must): stagingLimitExceededError message includes total, top-dirs, and remedy hints
// ---------------------------------------------------------------------------

describe("TC-017: stagingLimitExceededError message includes total count, top-dir breakdown, and remedy hints", () => {
  it(
    // TC-017
    "TC-017: error.code is STAGING_LIMIT_EXCEEDED",
    () => {
      // GIVEN stagingLimitExceededError is called with representative args
      const err = stagingLimitExceededError(
        "implementer",
        "change/test-branch",
        48000,
        2000,
        [
          { dir: ".cargo-tmp", count: 24000 },
          { dir: "vendor", count: 20000 },
        ],
      );

      // WHEN the error is constructed
      // THEN error.code === "STAGING_LIMIT_EXCEEDED"
      expect(err.code).toBe("STAGING_LIMIT_EXCEEDED");
    },
  );

  it(
    // TC-017
    "TC-017: message contains total (48000) and limit (2000)",
    () => {
      const err = stagingLimitExceededError(
        "implementer",
        "change/test-branch",
        48000,
        2000,
        [
          { dir: ".cargo-tmp", count: 24000 },
          { dir: "vendor", count: 20000 },
        ],
      );

      const msg = err.message;
      expect(msg).toContain("48000");
      expect(msg).toContain("2000");
    },
  );

  it(
    // TC-017
    "TC-017: message contains top-directory names and their counts",
    () => {
      const err = stagingLimitExceededError(
        "implementer",
        "change/test-branch",
        48000,
        2000,
        [
          { dir: ".cargo-tmp", count: 24000 },
          { dir: "vendor", count: 20000 },
        ],
      );

      const msg = err.message + (err as { hint?: string }).hint;
      expect(msg).toContain(".cargo-tmp");
      expect(msg).toContain("24000");
    },
  );

  it(
    // TC-017
    "TC-017: message (or hint) mentions stagingExcludePatterns or .gitignore as one remedy",
    () => {
      const err = stagingLimitExceededError(
        "implementer",
        "change/test-branch",
        48000,
        2000,
        [{ dir: ".cargo-tmp", count: 24000 }],
      );

      // The hint + message must name the stagingExcludePatterns / .gitignore remedy
      const fullText = err.message + ((err as { hint?: string }).hint ?? "");
      const hasStagingExclude = fullText.includes("stagingExcludePatterns");
      const hasGitignore = fullText.includes(".gitignore");
      expect(hasStagingExclude || hasGitignore).toBe(true);
    },
  );

  it(
    // TC-017
    "TC-017: message (or hint) mentions maxStagedFiles as the other remedy",
    () => {
      const err = stagingLimitExceededError(
        "implementer",
        "change/test-branch",
        48000,
        2000,
        [{ dir: ".cargo-tmp", count: 24000 }],
      );

      const fullText = err.message + ((err as { hint?: string }).hint ?? "");
      expect(fullText).toContain("maxStagedFiles");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-019 (should): matchesGlob from shared util handles **/, *, and dir-prefix vendor/**
// ---------------------------------------------------------------------------

describe("TC-019 (should): matchesGlob from src/util/glob-match.ts handles key patterns", () => {
  it(
    // TC-019
    "TC-019: **/*.test.ts matches foo/bar/baz.test.ts (nested, **/ prefix)",
    () => {
      expect(matchesGlob("foo/bar/baz.test.ts", "**/*.test.ts")).toBe(true);
    },
  );

  it(
    // TC-019
    "TC-019: *.ts does NOT match foo/bar.ts (single * does not cross directory separator)",
    () => {
      expect(matchesGlob("foo/bar.ts", "*.ts")).toBe(false);
    },
  );

  it(
    // TC-019
    "TC-019: vendor/** matches vendor/lodash/index.js (dir-prefix pattern)",
    () => {
      expect(matchesGlob("vendor/lodash/index.js", "vendor/**")).toBe(true);
    },
  );

  it(
    // TC-019
    "TC-019: **/.cargo-tmp/** matches .cargo-tmp/registry/cache.json (nested **/ both sides)",
    () => {
      expect(matchesGlob(".cargo-tmp/registry/cache.json", "**/.cargo-tmp/**")).toBe(true);
    },
  );
});
