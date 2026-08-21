/**
 * Shared archive job context resolver.
 *
 * Extracts job-state lookup + derived fields (archiveRecorded, recordDir, etc.)
 * so they can be reused by both runMergeThenArchive and runPlainArchive.
 */
import * as nodePath from "node:path";
import { JobStateStore } from "../../store/job-state-store.js";
import { getJobSlug } from "../../state/job-slug.js";
import type { JobState } from "../../state/schema.js";
import { resolveWorktreePathForArchive } from "./orchestrator.js";

export type ResolvedArchiveJobContext =
  | {
      found: true;
      state: JobState;
      prNumber?: number;
      branch: string | null;
      worktreePath: string | null;
      noWorktree: boolean;
      /** True when the change folder has been moved to archive/ (archive record was committed). */
      archiveRecorded: boolean;
      /** Working tree where the archive-record commit was (or will be) made. */
      recordDir: string;
    }
  | { found: false; message: string };

/**
 * Resolve archive job context from slug.
 *
 * Uses `listWithSourceDirs(cwd, { includeArchived: true })` and picks the most-recent
 * entry for the slug (by updatedAt descending).
 *
 * Derives:
 * - `archiveRecorded` = `basename(dirname(sourceChangeDir)) === "archive"` (move-to-archive/ signal)
 * - `recordDir` = `noWorktree ? cwd : (worktreePath ?? cwd)`
 *
 * Returns `{ found: false, message }` when no matching job exists.
 */
export async function resolveArchiveJobContext({
  cwd,
  slug,
}: {
  cwd: string;
  slug: string;
}): Promise<ResolvedArchiveJobContext> {
  const allEntries = await JobStateStore.listWithSourceDirs(cwd, { includeArchived: true });
  const matching = allEntries.filter((e) => getJobSlug(e.state) === slug);

  if (matching.length === 0) {
    return {
      found: false,
      message: `No job found with slug '${slug}'. Run 'specrunner ps' to see available jobs.`,
    };
  }

  matching.sort(
    (a, b) => new Date(b.state.updatedAt).getTime() - new Date(a.state.updatedAt).getTime(),
  );
  const { state, sourceChangeDir } = matching[0]!;

  const worktreePath = await resolveWorktreePathForArchive(state, cwd);
  const noWorktree = state.noWorktree === true;

  // D2: "archive recorded" signal — change folder is in archive/ if dirname basename === "archive".
  // e.g. ".../specrunner/changes/archive/2026-01-01-slug" → dirname "archive"
  // e.g. ".../specrunner/changes/slug" → dirname "changes"
  const archiveRecorded = nodePath.basename(nodePath.dirname(sourceChangeDir)) === "archive";

  // D3: recordDir — the working tree where the archive-record commit was/will be made.
  const recordDir = noWorktree ? cwd : (worktreePath ?? cwd);

  const prNumber = state.pullRequest?.number ?? undefined;
  const branch = state.branch;

  return {
    found: true,
    state,
    prNumber,
    branch,
    worktreePath,
    noWorktree,
    archiveRecorded,
    recordDir,
  };
}
