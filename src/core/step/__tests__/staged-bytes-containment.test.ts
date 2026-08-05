/**
 * Unit tests for the staged byte-size containment helpers.
 *
 * Covers:
 *   TC-035 (must): DEFAULT_MAX_STAGED_BYTES constant value and resolveMaxStagedBytes resolver defaults
 *   TC-036 (must): measureStagedBytes sums sizes, treats ENOENT as zero, fails closed on other errors
 *   TC-037 (should): summarizeTopDirectoriesBySize groups by first segment, sums bytes, sorts bytes-desc
 *   TC-034 (must): stagedBytesLimitExceededError carries correct code and actionable message
 *
 * RED state: all tests fail until:
 *   - T-01: DEFAULT_MAX_STAGED_BYTES, resolveMaxStagedBytes, measureStagedBytes,
 *            summarizeTopDirectoriesBySize added to staging-containment.ts
 *   - T-02: STAGED_BYTES_LIMIT_EXCEEDED error code and stagedBytesLimitExceededError added to errors.ts
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_MAX_STAGED_BYTES,
  resolveMaxStagedBytes,
  measureStagedBytes,
  summarizeTopDirectoriesBySize,
} from "../staging-containment.js";
import { stagedBytesLimitExceededError } from "../../../errors.js";
import type { StagedPathSizeProbe } from "../staging-containment.js";

// ---------------------------------------------------------------------------
// TC-035: DEFAULT_MAX_STAGED_BYTES constant value and resolveMaxStagedBytes resolver defaults
// ---------------------------------------------------------------------------

describe("TC-035: DEFAULT_MAX_STAGED_BYTES constant value and resolveMaxStagedBytes defaults", () => {
  it(
    // TC-035
    "TC-035: DEFAULT_MAX_STAGED_BYTES equals 52428800 (50 MiB)",
    () => {
      // GIVEN DEFAULT_MAX_STAGED_BYTES exported from staging-containment.ts
      // WHEN the constant is read
      // THEN its value is 52428800
      expect(DEFAULT_MAX_STAGED_BYTES).toBe(52_428_800);
    },
  );

  it(
    // TC-035
    "TC-035: resolveMaxStagedBytes(undefined) returns 52428800",
    () => {
      // GIVEN resolveMaxStagedBytes called with undefined
      // WHEN the function returns
      // THEN the default 52428800 is returned
      expect(resolveMaxStagedBytes(undefined)).toBe(52_428_800);
    },
  );

  it(
    // TC-035
    "TC-035: resolveMaxStagedBytes({}) returns 52428800 (no pipeline block)",
    () => {
      // GIVEN resolveMaxStagedBytes called with {} (no pipeline key)
      expect(resolveMaxStagedBytes({} as never)).toBe(52_428_800);
    },
  );

  it(
    // TC-035
    "TC-035: resolveMaxStagedBytes with pipeline block but no maxStagedBytes returns 52428800",
    () => {
      // GIVEN config with pipeline block but no maxStagedBytes field
      const config = { version: 1 as const, agents: {}, pipeline: {} };
      expect(resolveMaxStagedBytes(config as never)).toBe(52_428_800);
    },
  );

  it(
    // TC-035
    "TC-035: resolveMaxStagedBytes({ pipeline: { maxStagedBytes: 104857600 } }) returns 104857600",
    () => {
      // GIVEN config with pipeline.maxStagedBytes: 104857600
      const config = {
        version: 1 as const,
        agents: {},
        pipeline: { maxStagedBytes: 104_857_600 },
      };
      // WHEN the function returns
      // THEN the configured value is returned
      expect(resolveMaxStagedBytes(config as never)).toBe(104_857_600);
    },
  );

  it(
    // TC-035
    "TC-035: resolveMaxStagedBytes with pipeline.maxStagedBytes: 1 (minimum positive integer) returns 1",
    () => {
      const config = {
        version: 1 as const,
        agents: {},
        pipeline: { maxStagedBytes: 1 },
      };
      expect(resolveMaxStagedBytes(config as never)).toBe(1);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-036: measureStagedBytes sums sizes, treats ENOENT as zero, fails closed on other errors
// ---------------------------------------------------------------------------

describe("TC-036: measureStagedBytes sums sizes, ENOENT→0, non-ENOENT→reject (fail-closed)", () => {
  it(
    // TC-036
    "TC-036: probe returning fixed sizes — totalBytes equals the sum",
    async () => {
      // GIVEN a set of staged paths with a probe returning fixed sizes
      const paths = ["src/a.ts", "src/b.ts", "vendor/lib.js"];
      const sizeMap = new Map([
        ["/fake/cwd/src/a.ts", 1000],
        ["/fake/cwd/src/b.ts", 2000],
        ["/fake/cwd/vendor/lib.js", 3000],
      ]);

      const probe: StagedPathSizeProbe = async (absPath: string) => {
        const size = sizeMap.get(absPath);
        if (size === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        return { size };
      };

      // WHEN measureStagedBytes is called
      const result = await measureStagedBytes(paths, "/fake/cwd", probe);

      // THEN totalBytes equals 6000 (sum of all sizes)
      expect(result.totalBytes).toBe(6000);
      expect(result.entries).toHaveLength(3);
      expect(result.entries).toContainEqual({ path: "src/a.ts", bytes: 1000 });
      expect(result.entries).toContainEqual({ path: "src/b.ts", bytes: 2000 });
      expect(result.entries).toContainEqual({ path: "vendor/lib.js", bytes: 3000 });
    },
  );

  it(
    // TC-036
    "TC-036: probe rejecting with ENOENT for a delete-pending path contributes 0 and resolves",
    async () => {
      // GIVEN a probe that rejects with ENOENT for one path (delete-pending)
      // and returns sizes for others
      const paths = ["src/a.ts", "deleted-file.ts", "src/b.ts"];
      const sizeMap = new Map([
        ["/fake/cwd/src/a.ts", 500],
        ["/fake/cwd/src/b.ts", 1500],
      ]);

      const probe: StagedPathSizeProbe = async (absPath: string) => {
        const size = sizeMap.get(absPath);
        if (size !== undefined) return { size };
        // Simulate delete-pending: ENOENT
        const err = Object.assign(new Error(`ENOENT: no such file, lstat '${absPath}'`), {
          code: "ENOENT",
        });
        throw err;
      };

      // WHEN measureStagedBytes is called
      const result = await measureStagedBytes(paths, "/fake/cwd", probe);

      // THEN the ENOENT path contributes 0 (not treated as failure)
      expect(result.totalBytes).toBe(2000); // 500 + 0 + 1500
      expect(result.entries).toContainEqual({ path: "deleted-file.ts", bytes: 0 });
      expect(result.entries).toContainEqual({ path: "src/a.ts", bytes: 500 });
      expect(result.entries).toContainEqual({ path: "src/b.ts", bytes: 1500 });
    },
  );

  it(
    // TC-036
    "TC-036: probe rejecting with non-ENOENT error causes measureStagedBytes to reject (fail-closed)",
    async () => {
      // GIVEN a probe that rejects with a non-ENOENT error for a path
      const paths = ["src/a.ts", "src/b.ts"];
      const probe: StagedPathSizeProbe = async (absPath: string) => {
        if (absPath.endsWith("src/b.ts")) {
          // Simulate permission denied (non-ENOENT)
          const err = Object.assign(new Error(`EACCES: permission denied, lstat '${absPath}'`), {
            code: "EACCES",
          });
          throw err;
        }
        return { size: 1000 };
      };

      // WHEN measureStagedBytes is called
      // THEN it rejects (fail-closed — does NOT return a result, does NOT treat as 0)
      await expect(measureStagedBytes(paths, "/fake/cwd", probe)).rejects.toThrow();
    },
  );

  it(
    // TC-036
    "TC-036: empty paths array returns totalBytes: 0 and empty entries",
    async () => {
      // GIVEN an empty paths array
      const probe: StagedPathSizeProbe = async () => ({ size: 0 });

      // WHEN measureStagedBytes is called with empty array
      const result = await measureStagedBytes([], "/fake/cwd", probe);

      // THEN totalBytes is 0 and entries is empty
      expect(result.totalBytes).toBe(0);
      expect(result.entries).toHaveLength(0);
    },
  );

  it(
    // TC-036
    "TC-036: measureStagedBytes resolves the path against cwd before probing",
    async () => {
      // GIVEN a probe that records the absolute path it receives
      const receivedPaths: string[] = [];
      const probe: StagedPathSizeProbe = async (absPath: string) => {
        receivedPaths.push(absPath);
        return { size: 100 };
      };

      // WHEN measureStagedBytes is called with a relative path
      await measureStagedBytes(["src/foo.ts"], "/my/cwd", probe);

      // THEN the probe received the absolute path (cwd + path)
      expect(receivedPaths).toHaveLength(1);
      expect(receivedPaths[0]).toBe("/my/cwd/src/foo.ts");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-037 (should): summarizeTopDirectoriesBySize groups by first segment, sums bytes, sorts desc
// ---------------------------------------------------------------------------

describe("TC-037 (should): summarizeTopDirectoriesBySize groups by first segment, sums bytes, sorts bytes-desc", () => {
  it(
    // TC-037
    "TC-037: groups by first path segment and sums bytes per group",
    () => {
      // GIVEN entries vendor/a (30), vendor/b (10), src/x (5)
      const entries = [
        { path: "vendor/a", bytes: 30 },
        { path: "vendor/b", bytes: 10 },
        { path: "src/x", bytes: 5 },
      ];

      // WHEN summarizeTopDirectoriesBySize is called
      const result = summarizeTopDirectoriesBySize(entries);

      // THEN returns [{ dir: "vendor", bytes: 40 }, { dir: "src", bytes: 5 }]
      expect(result[0]).toEqual({ dir: "vendor", bytes: 40 });
      expect(result[1]).toEqual({ dir: "src", bytes: 5 });
      expect(result).toHaveLength(2);
    },
  );

  it(
    // TC-037
    "TC-037: topN=1 returns only the largest entry",
    () => {
      // GIVEN the same entries with topN=1
      const entries = [
        { path: "vendor/a", bytes: 30 },
        { path: "vendor/b", bytes: 10 },
        { path: "src/x", bytes: 5 },
      ];

      // WHEN called with topN=1
      const result = summarizeTopDirectoriesBySize(entries, 1);

      // THEN only the highest-bytes group is returned
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ dir: "vendor", bytes: 40 });
    },
  );

  it(
    // TC-037
    "TC-037: equal-byte groups are ordered by directory name ascending",
    () => {
      // GIVEN groups with equal byte totals
      const entries = [
        { path: "zeta/a", bytes: 100 },
        { path: "alpha/a", bytes: 100 },
        { path: "beta/a", bytes: 100 },
      ];

      // WHEN summarizeTopDirectoriesBySize is called
      const result = summarizeTopDirectoriesBySize(entries);

      // THEN tied groups are ordered by dir name ascending
      expect(result[0]!.dir).toBe("alpha");
      expect(result[1]!.dir).toBe("beta");
      expect(result[2]!.dir).toBe("zeta");
    },
  );

  it(
    // TC-037
    "TC-037: paths with no slash are grouped under '.'",
    () => {
      // GIVEN entries with no path separator
      const entries = [
        { path: "README.md", bytes: 50 },
        { path: "LICENSE", bytes: 20 },
      ];

      // WHEN summarizeTopDirectoriesBySize is called
      const result = summarizeTopDirectoriesBySize(entries);

      // THEN they are grouped under "." with summed bytes
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ dir: ".", bytes: 70 });
    },
  );

  it(
    // TC-037
    "TC-037: result entries have { dir: string; bytes: number } shape",
    () => {
      // GIVEN any entries
      const entries = [{ path: "src/a.ts", bytes: 100 }];
      const result = summarizeTopDirectoriesBySize(entries);

      for (const entry of result) {
        expect(entry).toHaveProperty("dir");
        expect(entry).toHaveProperty("bytes");
        expect(typeof entry.dir).toBe("string");
        expect(typeof entry.bytes).toBe("number");
      }
    },
  );

  it(
    // TC-037
    "TC-037: default topN of 10 returns at most 10 entries",
    () => {
      // GIVEN 15 distinct directories with 1 entry each
      const entries = Array.from({ length: 15 }, (_, i) => ({
        path: `dir${i}/file.ts`,
        bytes: i + 1,
      }));

      // WHEN called with default topN
      const result = summarizeTopDirectoriesBySize(entries);

      // THEN result has at most 10 entries
      expect(result.length).toBeLessThanOrEqual(10);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-034: stagedBytesLimitExceededError carries correct code and actionable message (unit)
// ---------------------------------------------------------------------------

describe("TC-034: stagedBytesLimitExceededError carries correct code and actionable message", () => {
  it(
    // TC-034
    "TC-034: error.code is STAGED_BYTES_LIMIT_EXCEEDED",
    () => {
      // GIVEN stagedBytesLimitExceededError is called with representative args
      const err = stagedBytesLimitExceededError(
        "implementer",
        "change/test-branch",
        73_400_320,
        52_428_800,
        [{ dir: "assets", bytes: 73_400_320 }],
      );

      // WHEN the error is constructed
      // THEN error.code === "STAGED_BYTES_LIMIT_EXCEEDED"
      expect(err.code).toBe("STAGED_BYTES_LIMIT_EXCEEDED");
    },
  );

  it(
    // TC-034
    "TC-034: message contains total bytes (73400320)",
    () => {
      const err = stagedBytesLimitExceededError(
        "implementer",
        "change/test-branch",
        73_400_320,
        52_428_800,
        [{ dir: "assets", bytes: 73_400_320 }],
      );

      // The message must contain the total byte count
      expect(err.message).toContain("73400320");
    },
  );

  it(
    // TC-034
    "TC-034: message contains threshold bytes (52428800)",
    () => {
      const err = stagedBytesLimitExceededError(
        "implementer",
        "change/test-branch",
        73_400_320,
        52_428_800,
        [{ dir: "assets", bytes: 73_400_320 }],
      );

      // The message must contain the threshold
      expect(err.message).toContain("52428800");
    },
  );

  it(
    // TC-034
    "TC-034: message or hint contains top-directory name (assets) and its bytes",
    () => {
      const err = stagedBytesLimitExceededError(
        "implementer",
        "change/test-branch",
        73_400_320,
        52_428_800,
        [{ dir: "assets", bytes: 73_400_320 }],
      );

      const fullText = err.message + ((err as { hint?: string }).hint ?? "");
      expect(fullText).toContain("assets");
      expect(fullText).toContain("73400320");
    },
  );

  it(
    // TC-034
    "TC-034: message or hint mentions stagingExcludePatterns or .gitignore as one remedy",
    () => {
      const err = stagedBytesLimitExceededError(
        "implementer",
        "change/test-branch",
        73_400_320,
        52_428_800,
        [{ dir: "assets", bytes: 73_400_320 }],
      );

      const fullText = err.message + ((err as { hint?: string }).hint ?? "");
      const hasStagingExclude = fullText.includes("stagingExcludePatterns");
      const hasGitignore = fullText.includes(".gitignore");
      expect(hasStagingExclude || hasGitignore).toBe(true);
    },
  );

  it(
    // TC-034
    "TC-034: message or hint mentions maxStagedBytes as the raise-limit remedy",
    () => {
      const err = stagedBytesLimitExceededError(
        "implementer",
        "change/test-branch",
        73_400_320,
        52_428_800,
        [{ dir: "assets", bytes: 73_400_320 }],
      );

      const fullText = err.message + ((err as { hint?: string }).hint ?? "");
      expect(fullText).toContain("maxStagedBytes");
    },
  );

  it(
    // TC-034
    "TC-034: message contains a size breakdown (Top directories by size section)",
    () => {
      const err = stagedBytesLimitExceededError(
        "implementer",
        "change/test-branch",
        100_000_000,
        52_428_800,
        [
          { dir: "dist", bytes: 60_000_000 },
          { dir: "node_modules", bytes: 40_000_000 },
        ],
      );

      const fullText = err.message + ((err as { hint?: string }).hint ?? "");
      // Must contain both directory names from the breakdown
      expect(fullText).toContain("dist");
      expect(fullText).toContain("node_modules");
    },
  );
});
