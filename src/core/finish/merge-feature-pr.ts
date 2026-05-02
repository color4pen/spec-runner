/**
 * Feature PR merge step for finish command.
 *
 * TC-015: OPEN_MERGEABLE → gh pr merge --squash --delete-branch
 * TC-016: OPEN_CHECKS_FAILING + --force → gh pr merge --squash --delete-branch --admin
 * TC-017: MERGED → skip
 * TC-018: --cleanup-only → skip
 * TC-042: non-zero exit → escalation
 */
import type { NormalizedPrState } from "./types.js";
import type { SpawnFn } from "../../util/spawn.js";
import { formatEscalation, getRecommendedAction } from "./escalation.js";

export type MergeFeaturePrResult =
  | { ok: true; skipped: boolean; message: string }
  | { ok: false; escalation: string; exitCode: 1 };

/**
 * Merge the feature PR.
 *
 * @param prNumber - PR number to merge
 * @param prState - Normalized PR state
 * @param flags.force - Use --admin for OPEN_CHECKS_FAILING
 * @param flags.cleanupOnly - Skip merge entirely
 * @param cwd - Working directory for gh CLI
 * @param spawn - Injected spawn function
 * @param jobId - Used in resume command in escalation
 */
export async function mergeFeaturePr(params: {
  prNumber: number;
  prState: NormalizedPrState;
  force: boolean;
  cleanupOnly: boolean;
  cwd: string;
  spawn: SpawnFn;
  jobId: string;
}): Promise<MergeFeaturePrResult> {
  const { prNumber, prState, force, cleanupOnly, cwd, spawn, jobId } = params;

  // --cleanup-only: skip merge entirely
  if (cleanupOnly) {
    return {
      ok: true,
      skipped: true,
      message: `Skipping feature PR merge (--cleanup-only).`,
    };
  }

  // Already merged: idempotent skip (TC-017, TC-101)
  if (prState === "MERGED") {
    return {
      ok: true,
      skipped: true,
      message: `Feature PR #${prNumber} is already merged, skipping merge step.`,
    };
  }

  // States that require escalation (cannot merge)
  if (prState === "OPEN_BEHIND" || prState === "OPEN_CONFLICTS") {
    const escalation = formatEscalation({
      failedStep: "merge-feature-pr",
      detectedState: prState,
      recommendedAction: getRecommendedAction(prState, jobId, force),
      resumeCommand: `specrunner finish ${jobId}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  // CLOSED: escalation
  if (prState === "CLOSED") {
    const escalation = formatEscalation({
      failedStep: "merge-feature-pr",
      detectedState: prState,
      recommendedAction: getRecommendedAction(prState, jobId, force),
      resumeCommand: `specrunner finish ${jobId}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  // OPEN_CHECKS_FAILING without --force: escalation
  if (prState === "OPEN_CHECKS_FAILING" && !force) {
    const escalation = formatEscalation({
      failedStep: "merge-feature-pr",
      detectedState: prState,
      recommendedAction: getRecommendedAction(prState, jobId, force),
      resumeCommand: `specrunner finish ${jobId}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  // Build merge args
  const mergeArgs = ["pr", "merge", String(prNumber), "--squash", "--delete-branch"];
  if (prState === "OPEN_CHECKS_FAILING" && force) {
    mergeArgs.push("--admin");
  }

  const result = await spawn("gh", mergeArgs, { cwd });

  if (result.exitCode !== 0) {
    const escalation = formatEscalation({
      failedStep: "merge-feature-pr",
      detectedState: `gh pr merge failed (exit ${result.exitCode})`,
      recommendedAction: `Check gh error: ${result.stderr.trim()}. Then re-run: specrunner finish ${jobId}`,
      resumeCommand: `specrunner finish ${jobId}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  return {
    ok: true,
    skipped: false,
    message: `Feature PR #${prNumber} merged successfully.`,
  };
}
