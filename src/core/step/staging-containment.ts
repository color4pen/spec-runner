/**
 * Guarded-staging containment utilities.
 *
 * Two-layer protection for guarded write steps (implementer / code-fixer / adr-gen):
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
 *   3. Byte-size guard — fail-closed halt before commit when the post-exclusion
 *      total worktree byte size (uncompressed, via lstat) exceeds
 *      `pipeline.maxStagedBytes`. Independent of the file-count guard.
 *
 * Leaf module: imports only `matchesGlob` from shared util, `join` from
 * `node:path` (stdlib), and the `SpecRunnerConfig` type. No new runtime
 * dependencies.
 */

import { join as pathJoin } from "node:path";
import { matchesGlob } from "../../util/glob-match.js";
import type { SpecRunnerConfig } from "../../config/schema.js";

/**
 * Default maximum number of post-exclusion files that a guarded step may
 * stage. Exceeding this halts (escalation) before commit.
 */
export const DEFAULT_MAX_STAGED_FILES = 2000;

/**
 * Default maximum post-exclusion total worktree byte size (uncompressed, via
 * lstat) that a GUARDED step may stage. Exceeding it halts (escalation) before
 * commit.
 *
 * 52,428,800 bytes = 50 MiB. Legitimate source changes virtually never exceed
 * this uncompressed; exceedance is a strong signal of generated-artifact
 * contamination.
 */
export const DEFAULT_MAX_STAGED_BYTES = 52_428_800;

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
 * Resolve the effective max-staged-bytes limit from config.
 *
 * Returns `config?.pipeline?.maxStagedBytes` when it is a positive integer,
 * otherwise returns `DEFAULT_MAX_STAGED_BYTES` (52428800 = 50 MiB).
 */
export function resolveMaxStagedBytes(config: SpecRunnerConfig | undefined): number {
  const configured = config?.pipeline?.maxStagedBytes;
  if (typeof configured === "number" && Number.isInteger(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_MAX_STAGED_BYTES;
}

/**
 * Injectable lstat-like probe for the staged byte-size guard.
 *
 * Resolves with the entry's byte `size`. Rejects with an error whose
 * `.code === "ENOENT"` when the path is absent (delete-pending / not in
 * worktree). Any other rejection (e.g. EACCES) propagates to the caller
 * as a fail-closed measurement error.
 */
export type StagedPathSizeProbe = (absPath: string) => Promise<{ size: number }>;

/** Per-path byte-size entry produced by `measureStagedBytes`. */
export interface StagedSizeEntry {
  path: string;
  bytes: number;
}

/**
 * Measure the total worktree byte size of a post-exclusion staged path set.
 *
 * For each path `p`:
 *   - Calls `probe(pathJoin(cwd, p))`.
 *   - On success, contributes `size` bytes.
 *   - On error with `code === "ENOENT"` (delete-pending / not in worktree),
 *     contributes `0`.
 *   - On any OTHER error, rethrows (fail-closed — does NOT swallow, does NOT
 *     count as 0).
 *
 * Returns `{ totalBytes, entries }` where `entries` has one entry per path.
 */
export async function measureStagedBytes(
  paths: string[],
  cwd: string,
  probe: StagedPathSizeProbe,
): Promise<{ totalBytes: number; entries: StagedSizeEntry[] }> {
  let totalBytes = 0;
  const entries: StagedSizeEntry[] = [];

  for (const p of paths) {
    let bytes: number;
    try {
      const result = await probe(pathJoin(cwd, p));
      bytes = result.size;
    } catch (err) {
      const errCode = (err as { code?: string }).code;
      if (errCode === "ENOENT") {
        // Delete-pending: path not in worktree → contributes 0
        bytes = 0;
      } else {
        // Any other error → fail-closed: rethrow
        throw err;
      }
    }
    totalBytes += bytes;
    entries.push({ path: p, bytes });
  }

  return { totalBytes, entries };
}

/**
 * Group staged-size entries by their first path segment and return the top-N
 * groups by total bytes, descending. Ties are broken by directory name
 * ascending.
 *
 * Paths with no `/` are grouped under `"."`.
 *
 * Mirror of `summarizeTopDirectories` but summing bytes instead of counting.
 *
 * @param entries  Array of `{ path, bytes }` entries.
 * @param topN     Maximum number of entries to return. Default 10.
 * @returns        Array of `{ dir, bytes }` sorted by bytes descending.
 */
export function summarizeTopDirectoriesBySize(
  entries: Array<{ path: string; bytes: number }>,
  topN = 10,
): Array<{ dir: string; bytes: number }> {
  const totals = new Map<string, number>();
  for (const e of entries) {
    const slashIdx = e.path.indexOf("/");
    const dir = slashIdx === -1 ? "." : e.path.slice(0, slashIdx);
    totals.set(dir, (totals.get(dir) ?? 0) + e.bytes);
  }
  return Array.from(totals.entries())
    .sort(([dirA, bytesA], [dirB, bytesB]) => {
      if (bytesB !== bytesA) return bytesB - bytesA; // descending by bytes
      return dirA < dirB ? -1 : dirA > dirB ? 1 : 0; // ascending by name
    })
    .slice(0, topN)
    .map(([dir, bytes]) => ({ dir, bytes }));
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
