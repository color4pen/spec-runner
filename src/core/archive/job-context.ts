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

/**
 * Returns true when the change folder has been moved to archive/ (i.e. it is an archive record).
 *
 * Archive record path pattern: `.../specrunner/changes/archive/<YYYY-MM-DD-slug>/`
 * Active change folder pattern: `.../specrunner/changes/<slug>/`
 *
 * The single shared predicate ensures fallback slug resolution and resolveArchiveJobContext
 * agree on what constitutes an archive record — avoiding the risk that a fallback-resolved
 * slug is seen as archiveRecorded: false by the subsequent archive run.
 */
export function isArchiveRecordDir(sourceChangeDir: string): boolean {
  return nodePath.basename(nodePath.dirname(sourceChangeDir)) === "archive";
}

/**
 * Resolve the slug of an archive record from jobId + issueNumber.
 *
 * After merge, the base branch (main) holds the archive record in
 * `specrunner/changes/archive/<YYYY-MM-DD-slug>/`. The feature branch that
 * carried the checkpoint may have been deleted by GitHub on merge. This
 * function lets `runArchiveFromIssue` bypass the branch-fetch path and go
 * directly to `runArchive` using the slug from the base-borne record.
 *
 * Matching requires both jobId AND issueNumber to match, following the same
 * two-field identity approach as `resolveArchiveBranchFromIssue`. This guards
 * against archiving the wrong job when a completed marker is copied to another
 * issue.
 *
 * Only archive records (`isArchiveRecordDir`) are considered. An active change
 * folder in `specrunner/changes/<slug>/` with the same jobId indicates the job
 * has not been archived yet (merge is still pending) — the closing-PR path
 * handles that case.
 *
 * Returns the slug string, or null if no matching archive record is found or
 * if the derived slug is empty.
 */
export async function resolveArchivedSlugByJobId({
  cwd,
  jobId,
  issueNumber,
}: {
  cwd: string;
  jobId: string;
  issueNumber: number;
}): Promise<string | null> {
  const allEntries = await JobStateStore.listWithSourceDirs(cwd, { includeArchived: true });

  const match = allEntries.find(
    (e) =>
      e.state.jobId === jobId &&
      e.state.issueNumber === issueNumber &&
      isArchiveRecordDir(e.sourceChangeDir),
  );

  if (!match) return null;

  const slug = getJobSlug(match.state);
  return slug || null;
}

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
  const archiveRecorded = isArchiveRecordDir(sourceChangeDir);

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
