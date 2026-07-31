/**
 * Shared test-file selection predicate for bite-evidence gate and archive floor.
 *
 * Provides:
 *   - DEFAULT_SCOPED_TEST_PATTERNS: default glob patterns for test files
 *   - isExcludedPath: pipeline-artifact exclusion (moved from gate.ts)
 *   - matchesGlob: bounded glob-to-RegExp translation (no external dependency)
 *   - resolveScopedTestPatterns: resolve configured or default patterns
 *   - selectMaterializedTestFiles: compose exclusion + pattern matching
 *
 * This module MUST NOT import from gate.ts to avoid a module cycle.
 * It is a leaf module consumed by gate.ts and achieved-assurance.ts.
 */

import type { SpecRunnerConfig } from "../../../config/schema.js";

/**
 * Default glob patterns that identify materialized test files for per-file bite execution.
 * Applied when verification.scopedTestPatterns is absent or undefined.
 */
export const DEFAULT_SCOPED_TEST_PATTERNS: readonly string[] = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/*_test.*",
];

/**
 * Returns true when filePath is a pipeline artifact path that must always be excluded,
 * regardless of whether it matches a test pattern.
 *
 * Exported so that the archive floor gate (achieved-assurance.ts) can use the
 * same exclusion logic without duplicating the rule.
 */
export function isExcludedPath(filePath: string): boolean {
  return filePath.startsWith("specrunner/changes/") || filePath.startsWith(".specrunner/");
}

/**
 * Test whether `filePath` matches the given glob `pattern`.
 *
 * Supported glob syntax (D3: bounded translation):
 *   - double-star followed by slash: matches zero or more directory segments
 *   - double-star NOT followed by slash: matches across directory boundaries
 *   - single star: matches within one path segment, does not cross "/"
 *   - literal dot "." in the pattern: matches either "." or "_" in the file path
 *     (covers both JS/TS convention "foo.test.ts" and Go/Ruby convention "foo_test.go" / "foo_spec.rb")
 *   - all other characters: regex-escaped
 *
 * No brace expansion, "?", or character-class support — out of scope.
 * The compiled RegExp is anchored as "^...$".
 */
export function matchesGlob(filePath: string, pattern: string): boolean {
  let regex = "";
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i]!;

    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // Double-star
        if (pattern[i + 2] === "/") {
          // "**/" — match zero or more directory segments (including none)
          regex += "(?:.*/)?";
          i += 3; // consume the three-char sequence
        } else {
          // "**" not followed by "/" — match across segment boundaries
          regex += ".*";
          i += 2; // consume the two-char sequence
        }
      } else {
        // Single "*" — match within one segment (no "/" crossing)
        regex += "[^/]*";
        i += 1;
      }
    } else if (ch === ".") {
      // Dot in the pattern matches either a literal dot or an underscore.
      // This lets a single pattern like "**/*.test.*" or "**/*.spec.rb" cover
      // both dot-separated ("foo.test.ts") and underscore-separated ("foo_test.go",
      // "foo_spec.rb") test file naming conventions.
      // "X" (any other character) does not match — TC-017 is preserved.
      regex += "[._]";
      i += 1;
    } else {
      // Regex-escape special regex metacharacters so literal chars match literally
      regex += ch.replace(/[+?^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }

  return new RegExp(`^${regex}$`).test(filePath);
}

/**
 * Resolve the effective scoped test patterns from config.
 * Returns `config?.verification?.scopedTestPatterns` when it is a non-empty array,
 * otherwise returns a copy of DEFAULT_SCOPED_TEST_PATTERNS.
 *
 * The config layer never injects defaults — this function is the runtime fallback.
 */
export function resolveScopedTestPatterns(config: SpecRunnerConfig | undefined): string[] {
  const configured = config?.verification?.scopedTestPatterns;
  if (Array.isArray(configured) && configured.length > 0) {
    return [...configured];
  }
  return [...DEFAULT_SCOPED_TEST_PATTERNS];
}

/**
 * Select the materialized test files from `files` using:
 *   1. Pipeline-artifact exclusion via `isExcludedPath`.
 *   2. Test-pattern matching via `matchesGlob` against the resolved patterns.
 *
 * Used by both the bite-evidence gate (gate.ts) and the archive floor
 * (achieved-assurance.ts) to ensure a single shared predicate.
 */
export function selectMaterializedTestFiles(
  files: string[],
  config: SpecRunnerConfig | undefined,
): string[] {
  const patterns = resolveScopedTestPatterns(config);
  return files.filter(
    (f) => !isExcludedPath(f) && patterns.some((p) => matchesGlob(f, p)),
  );
}
