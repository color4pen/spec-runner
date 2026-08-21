/**
 * Shared post-merge completion helpers for archive operations.
 *
 * Extracted so both runMergeThenArchive (--with-merge) and runPlainArchive (plain)
 * can reuse the same "mark archived then cleanup" and "merged-before-record escalation" logic.
 */
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "../finish/types.js";
import type { WorktreeManager } from "../worktree/manager.js";
import { markJobArchived } from "../finish/job-state-update.js";
import { runPostMergeCleanup } from "./post-merge-cleanup.js";
import { formatEscalation } from "../finish/escalation.js";
import { stderrWrite } from "../../logger/stdout.js";
import type { ArchiveResult } from "./orchestrator.js";

export interface CompleteAfterMergeInput {
  slug: string;
  /** Working tree where the archive-record commit was made. */
  recordDir: string;
  /** Main repo root. */
  cwd: string;
  branch: string | null;
  worktreePath: string | null;
  noWorktree: boolean;
  baseBranch: string;
  spawn: SpawnFn;
  fs: FinishFs;
  worktreeManagerFn?: () => WorktreeManager;
}

/**
 * Best-effort post-merge status transition + cleanup.
 *
 * 1. Calls `markJobArchived(slug, recordDir)` (awaiting-archive → archived).
 *    Failures emit a warning via stderrWrite and do NOT abort — the merge is
 *    already done and cleanup must proceed regardless.
 * 2. Calls `runPostMergeCleanup` unconditionally (worktree teardown + branch delete).
 */
export async function completeAfterMerge(
  input: CompleteAfterMergeInput,
  stdoutWrite: (msg: string) => void,
): Promise<void> {
  const { slug, recordDir, cwd, branch, worktreePath, noWorktree, baseBranch, spawn, fs, worktreeManagerFn } = input;

  try {
    await markJobArchived(slug, recordDir);
    stdoutWrite(`Job ${slug} marked as archived.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    stderrWrite(`Warning: failed to transition ${slug} to archived: ${message}. Continuing cleanup.`);
  }

  await runPostMergeCleanup(
    { slug, cwd, branch, worktreePath, noWorktree, baseBranch, spawn, fs, worktreeManagerFn },
    stdoutWrite,
  );
}

/**
 * Build the escalation result for when a PR was merged before the archive record was created.
 *
 * The `resumeCommand` is injected by the caller so it can differ between:
 * - plain archive: `specrunner job archive <slug>`
 * - --with-merge: `specrunner job archive --with-merge <slug>`
 */
export function mergedBeforeRecordEscalation({
  slug,
  prNumber,
  baseBranch,
  resumeCommand,
}: {
  slug: string;
  prNumber: number;
  baseBranch: string;
  resumeCommand: string;
}): ArchiveResult {
  return {
    exitCode: 1,
    escalation: formatEscalation({
      failedStep: "merge gate (PR merged before archive)",
      detectedState:
        `PR #${prNumber} is already merged but the archive was not recorded first ` +
        `(change folder is still at active location). The archive folder move rides the PR, ` +
        `so archiving must happen before the PR is merged.`,
      recommendedAction:
        `Archive before merging. The change folder for '${slug}' remains at its active location on ${baseBranch} ` +
        `and can only be relocated by a direct ${baseBranch} commit (which job archive does not perform).`,
      resumeCommand,
    }),
  };
}
