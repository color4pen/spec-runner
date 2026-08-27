/**
 * Post-merge completion helpers for `job archive --with-merge`.
 *
 * This module is ONLY used by `merge-then-archive.ts` (the `--with-merge` path).
 * Plain archive (`plain-archive.ts`) does NOT import from this module.
 *
 * Provides:
 * - `completeAfterMerge`: mark archived + run cleanup after a successful PR merge.
 * - `mergedBeforeRecordEscalation`: escalation for when PR merged before archive was recorded.
 */
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "../finish/types.js";
import type { WorktreeManager } from "../worktree/manager.js";
import { markJobArchived } from "../finish/job-state-update.js";
import { runArchiveCleanup } from "./cleanup.js";
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
 * Called only from `merge-then-archive.ts` (the `--with-merge` path).
 * Not called from `plain-archive.ts`.
 *
 * 1. Calls `markJobArchived(slug, recordDir)` (awaiting-archive → archived).
 *    Failures emit a warning via stderrWrite and do NOT abort — the merge is
 *    already done and cleanup must proceed regardless.
 * 2. Calls `runArchiveCleanup` unconditionally (worktree teardown + branch delete).
 *    Remote branch is deleted (`deleteRemoteBranch` defaults to `true`) because
 *    the PR has already been merged by the time this function runs.
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

  await runArchiveCleanup(
    { slug, cwd, branch, worktreePath, noWorktree, baseBranch, spawn, fs, worktreeManagerFn },
    stdoutWrite,
  );
}

/**
 * Build the escalation result for when a PR was merged before the archive record was created.
 *
 * Only called from `merge-then-archive.ts` (the `--with-merge` path).
 * The `resumeCommand` is injected by the caller.
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
