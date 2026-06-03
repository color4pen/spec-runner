/**
 * Merge-then-archive orchestrator for `job archive --with-merge`.
 *
 * Flow:
 * 1. Load job state → resolve PR number
 * 2. getPullRequest to check PR status
 * 3. Already MERGED → call archive orchestrator directly
 * 4. mergeStateStatus check → CLEAN required; BLOCKED/UNSTABLE/DIRTY → escalation
 * 5. CLEAN → checkMergeableForMerge + squash merge
 * 6. merge success → call archive orchestrator
 */
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "../finish/types.js";
import type { GitHubClient } from "../port/github-client.js";
import type { WorktreeManager } from "../worktree/manager.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { getJobSlug } from "../../state/job-slug.js";
import { runArchiveOrchestrator } from "./orchestrator.js";
import type { ArchiveResult } from "./orchestrator.js";
import { pollMergeStateAfterPush, checkMergeableForMerge } from "../finish/pr-status.js";
import { formatEscalation } from "../finish/escalation.js";
import { logResult } from "../../logger/stdout.js";

export interface MergeThenArchiveInput {
  /** Slug of the job to archive. */
  slug: string;
  /** Main repo root (cwd). */
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  githubClient: GitHubClient;
  owner: string;
  repo: string;
  /** Base branch name (default: "main"). */
  baseBranch?: string;
  /** Injectable sleep for testing. */
  sleepFn?: (ms: number) => Promise<void>;
  /** Injectable WorktreeManager for testing. */
  worktreeManagerFn?: () => WorktreeManager;
}

export type MergeThenArchiveResult = ArchiveResult;

/**
 * Run merge-then-archive for `job archive --with-merge`.
 * Merges the feature PR (if not already merged) then runs archive.
 */
export async function runMergeThenArchive(
  input: MergeThenArchiveInput,
  stdoutWrite: (msg: string) => void = logResult,
): Promise<MergeThenArchiveResult> {
  const { slug, cwd, spawn, fs, githubClient, owner, repo, baseBranch, sleepFn, worktreeManagerFn } = input;

  // ---------------------------------------------------------------------------
  // Step 1: Load job state → resolve PR number
  // ---------------------------------------------------------------------------
  let prNumber: number;

  try {
    const allStates = await JobStateStore.list(cwd);
    const matching = allStates.filter((s) => getJobSlug(s) === slug);

    if (matching.length === 0) {
      return { exitCode: 2, message: `No job found with slug '${slug}'. Run 'specrunner ps' to see available jobs.` };
    }

    matching.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const state = matching[0]!;

    if (!state.pullRequest?.number) {
      return {
        exitCode: 2,
        message: `Job ${state.jobId} is missing PR number. Was the pr-create step completed?`,
      };
    }

    prNumber = state.pullRequest.number;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 2, message };
  }

  // ---------------------------------------------------------------------------
  // Step 2: Check PR status
  // ---------------------------------------------------------------------------
  let prState: string;
  try {
    const pr = await githubClient.getPullRequest(owner, repo, prNumber);
    prState = pr.state ?? "OPEN";
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      escalation: formatEscalation({
        failedStep: "PR status check (getPullRequest)",
        detectedState: `getPullRequest #${prNumber} failed: ${detail}`,
        recommendedAction: `Check GitHub token: specrunner login. Then re-run: specrunner job archive --with-merge ${slug}`,
        resumeCommand: `specrunner job archive --with-merge ${slug}`,
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // Step 3: Already MERGED → skip to archive
  // ---------------------------------------------------------------------------
  if (prState === "MERGED") {
    stdoutWrite(`PR #${prNumber} already merged. Running archive directly.`);
    return runArchiveOrchestrator({ slug, cwd, spawn, fs, baseBranch, worktreeManagerFn }, stdoutWrite);
  }

  // ---------------------------------------------------------------------------
  // Step 4: mergeStateStatus check via polling
  // ---------------------------------------------------------------------------
  stdoutWrite(`Checking PR #${prNumber} merge state...`);
  const pollResult = await pollMergeStateAfterPush({
    prNumber,
    githubClient,
    owner,
    repo,
    slug,
    sleepFn,
  });

  const mergeStateStatus = pollResult.mergeStateStatus.toUpperCase();

  if (mergeStateStatus === "BLOCKED") {
    return {
      exitCode: 1,
      escalation: formatEscalation({
        failedStep: "merge gate (mergeStateStatus BLOCKED)",
        detectedState: "mergeStateStatus is BLOCKED (branch protection requirements not met)",
        recommendedAction: `Satisfy branch protection requirements, then re-run: specrunner job archive --with-merge ${slug}`,
        resumeCommand: `specrunner job archive --with-merge ${slug}`,
      }),
    };
  }

  if (mergeStateStatus === "UNSTABLE") {
    return {
      exitCode: 1,
      escalation: formatEscalation({
        failedStep: "merge gate (mergeStateStatus UNSTABLE)",
        detectedState: "mergeStateStatus is UNSTABLE (required checks failed)",
        recommendedAction: `Fix failing checks, then re-run: specrunner job archive --with-merge ${slug}`,
        resumeCommand: `specrunner job archive --with-merge ${slug}`,
      }),
    };
  }

  if (mergeStateStatus === "DIRTY") {
    return {
      exitCode: 1,
      escalation: formatEscalation({
        failedStep: "merge gate (mergeStateStatus DIRTY)",
        detectedState: "mergeStateStatus is DIRTY (merge conflicts exist)",
        recommendedAction: `Resolve merge conflicts, then re-run: specrunner job archive --with-merge ${slug}`,
        resumeCommand: `specrunner job archive --with-merge ${slug}`,
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // Step 5: CLEAN (or unknown/exhausted) → checkMergeableForMerge + squash merge
  // ---------------------------------------------------------------------------
  const mergeableResult = await checkMergeableForMerge({
    prNumber,
    githubClient,
    owner,
    repo,
    slug,
    baseBranch: baseBranch ?? "main",
    sleepFn,
  });

  if (!mergeableResult.ok) {
    return { exitCode: 1, escalation: mergeableResult.escalation };
  }

  stdoutWrite(`Merging PR #${prNumber}...`);

  let mergeResult: { merged: boolean; message: string };
  try {
    mergeResult = await githubClient.mergePullRequest(owner, repo, prNumber, { mergeMethod: "squash" });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      escalation: formatEscalation({
        failedStep: "squash merge (REST API)",
        detectedState: `mergePullRequest #${prNumber} threw: ${detail}`,
        recommendedAction: `Check branch protection requirements, then re-run: specrunner job archive --with-merge ${slug}`,
        resumeCommand: `specrunner job archive --with-merge ${slug}`,
      }),
    };
  }

  if (!mergeResult.merged) {
    return {
      exitCode: 1,
      escalation: formatEscalation({
        failedStep: "squash merge (REST API)",
        detectedState: `merge failed: ${mergeResult.message}`,
        recommendedAction: `Check branch protection requirements, then re-run: specrunner job archive --with-merge ${slug}`,
        resumeCommand: `specrunner job archive --with-merge ${slug}`,
      }),
    };
  }

  stdoutWrite(`PR #${prNumber} merged successfully.`);

  // ---------------------------------------------------------------------------
  // Step 6: merge success → run archive orchestrator
  // ---------------------------------------------------------------------------
  return runArchiveOrchestrator({ slug, cwd, spawn, fs, baseBranch, worktreeManagerFn }, stdoutWrite);
}
