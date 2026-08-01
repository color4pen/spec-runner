/**
 * Guarded-staging containment utilities.
 *
 * Two-layer protection for guarded write steps (implementer / build-fixer /
 * code-fixer / test-materialize / adr-gen):
 *
 *   1. Exclusion — repo-declared glob patterns that remove known scratch
 *      artifacts from the stage set. Matched paths are not staged and remain
 *      in the worktree. The target repo's .gitignore is the first line of
 *      defense; this is the second.
 *
 *   2. Volume guard — fail-closed halt before commit when the post-exclusion
 *      file count exceeds `pipeline.maxStagedFiles`. Converts a push-time
 *      HTTP 400 (giant pack) into a pre-commit escalation with actionable
 *      remediation hints.
 *
 * Leaf module: imports only `matchesGlob` from shared util and the
 * `SpecRunnerConfig` type. No new runtime dependencies.
 */

import { matchesGlob } from "../../util/glob-match.js";
import type { SpecRunnerConfig } from "../../config/schema.js";

/**
 * Default maximum number of post-exclusion files that a guarded step may
 * stage. Exceeding this halts (escalation) before commit.
 */
export const DEFAULT_MAX_STAGED_FILES = 2000;

/**
 * Resolve the effective staging exclude patterns from config.
 *
 * Returns a copy of `config?.pipeline?.stagingExcludePatterns` when it is a
 * non-empty array, otherwise returns `[]`.
 *
 * The config layer never injects defaults — this function is the runtime
 * fallback (consistent with `resolveScopedTestPatterns`).
 */
export function resolveStagingExcludePatterns(config: SpecRunnerConfig | undefined): string[] {
  const configured = config?.pipeline?.stagingExcludePatterns;
  if (Array.isArray(configured) && configured.length > 0) {
    return [...configured];
  }
  return [];
}

/**
 * Resolve the effective max-staged-files limit from config.
 *
 * Returns `config?.pipeline?.maxStagedFiles` when it is a positive integer,
 * otherwise returns `DEFAULT_MAX_STAGED_FILES` (2000).
 */
export function resolveMaxStagedFiles(config: SpecRunnerConfig | undefined): number {
  const configured = config?.pipeline?.maxStagedFiles;
  if (typeof configured === "number" && Number.isInteger(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_MAX_STAGED_FILES;
}

/**
 * Remove paths that match any of the given glob `excludePatterns`.
 *
 * When `excludePatterns` is empty, returns `paths` unchanged (no exclusion).
 * Uses the shared bounded `matchesGlob` (no external glob library).
 */
export function applyStagingExclusions(paths: string[], excludePatterns: string[]): string[] {
  if (excludePatterns.length === 0) return paths;
  return paths.filter((p) => !excludePatterns.some((pat) => matchesGlob(p, pat)));
}

/**
 * Group paths by their first path segment and return the top-N groups by
 * count, descending. Ties are broken by directory name ascending.
 *
 * Paths with no `/` are grouped under `"."`.
 *
 * @param paths      Repo-root-relative POSIX paths.
 * @param topN       Maximum number of entries to return. Default 10.
 * @returns          Array of `{ dir, count }` sorted by count descending.
 */
export function summarizeTopDirectories(
  paths: string[],
  topN = 10,
): Array<{ dir: string; count: number }> {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const slashIdx = p.indexOf("/");
    const dir = slashIdx === -1 ? "." : p.slice(0, slashIdx);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([dirA, cntA], [dirB, cntB]) => {
      if (cntB !== cntA) return cntB - cntA; // descending by count
      return dirA < dirB ? -1 : dirA > dirB ? 1 : 0; // ascending by name
    })
    .slice(0, topN)
    .map(([dir, count]) => ({ dir, count }));
}
