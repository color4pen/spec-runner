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
import { matchesGlob } from "../../../util/glob-match.js";
export { matchesGlob };

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
