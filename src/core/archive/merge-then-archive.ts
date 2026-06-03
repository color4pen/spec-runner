/**
 * Merge-then-archive orchestrator for `job archive --with-merge`.
 *
 * Flow:
 * 1. Load job state → resolve PR number
 * 2. getPullRequest to check PR status
 * 3. Already MERGED → call archive orchestrator directly
 * 4. Wait loop: poll check status until terminal (success/failure) or timeout
 *    - DIRTY / CONFLICTING → conflict escalation (no merge)
 *    - BLOCKED → branch protection escalation (no merge)
 *    - check failure → escalation (no merge)
 *    - check success or none → proceed to merge
 *    - check pending → wait (sleepFn), check deadline, repeat
 *    - timeout → escalation (no merge)
 * 5. checkMergeableForMerge + squash merge
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
import { checkMergeableForMerge } from "../finish/pr-status.js";
import { formatEscalation } from "../finish/escalation.js";
import { logResult } from "../../logger/stdout.js";
import { DEFAULT_MERGE_WAIT_TIMEOUT_MS, DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS } from "../../config/schema.js";

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
  /**
   * Maximum wait time in milliseconds for checks to resolve.
   * null = wait indefinitely.
   * undefined = use DEFAULT_MERGE_WAIT_TIMEOUT_MS.
   */
  waitTimeoutMs?: number | null;
  /** Poll interval in milliseconds between check-status calls. Default: DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS. */
  pollIntervalMs?: number;
  /** Injectable clock for testing. Default: Date.now. */
  nowFn?: () => number;
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
  const {
    slug,
    cwd,
    spawn,
    fs,
    githubClient,
    owner,
    repo,
    baseBranch,
    sleepFn = defaultSleep,
    worktreeManagerFn,
    waitTimeoutMs,
    pollIntervalMs = DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS,
    nowFn = Date.now,
  } = input;

  // Resolve effective timeout: undefined → default, null → unlimited, number → as-is
  const effectiveTimeoutMs = waitTimeoutMs === undefined ? DEFAULT_MERGE_WAIT_TIMEOUT_MS : waitTimeoutMs;

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
  // Step 2: Initial PR status check
  // ---------------------------------------------------------------------------
  let prData: { state: string; mergeStateStatus?: string; mergeable?: string; headSha?: string };
  try {
    prData = await githubClient.getPullRequest(owner, repo, prNumber);
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
  if (prData.state === "MERGED") {
    stdoutWrite(`PR #${prNumber} already merged. Running archive directly.`);
    return runArchiveOrchestrator({ slug, cwd, spawn, fs, baseBranch, worktreeManagerFn }, stdoutWrite);
  }

  // ---------------------------------------------------------------------------
  // Step 4: Wait loop — poll check status until terminal or timeout
  // ---------------------------------------------------------------------------
  const start = nowFn();

  stdoutWrite(`Waiting for PR #${prNumber} checks to resolve...`);

  while (true) {
    // Re-fetch PR to get current state and headSha
    try {
      prData = await githubClient.getPullRequest(owner, repo, prNumber);
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

    // Already merged (e.g. merged by another process)
    if (prData.state === "MERGED") {
      stdoutWrite(`PR #${prNumber} already merged. Running archive directly.`);
      return runArchiveOrchestrator({ slug, cwd, spawn, fs, baseBranch, worktreeManagerFn }, stdoutWrite);
    }

    // Conflict check
    const mergeStateStatus = (prData.mergeStateStatus ?? "").toUpperCase();
    if (mergeStateStatus === "DIRTY" || prData.mergeable === "CONFLICTING") {
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "merge gate (conflict)",
          detectedState: "PR has merge conflicts (mergeStateStatus DIRTY or mergeable CONFLICTING)",
          recommendedAction: `Rebase the feature branch onto ${baseBranch ?? "main"} and re-run:\n  git rebase ${baseBranch ?? "main"}\n  git push --force-with-lease\n  specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    // Branch protection not met
    if (mergeStateStatus === "BLOCKED") {
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "merge gate (branch protection)",
          detectedState: "branch protection requirements not met (mergeStateStatus BLOCKED)",
          recommendedAction: `Satisfy branch protection requirements, then re-run: specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    // headSha required for check status
    const headSha = prData.headSha;
    if (!headSha) {
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "check status (getCheckStatus)",
          detectedState: "unexpected: PR head SHA missing",
          recommendedAction: `Re-run: specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    // Poll check status
    let rollup: Awaited<ReturnType<GitHubClient["getCheckStatus"]>>;
    try {
      rollup = await githubClient.getCheckStatus(owner, repo, headSha);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "check status (getCheckStatus)",
          detectedState: `getCheckStatus failed: ${detail}`,
          recommendedAction: `Check GitHub token: specrunner login. Then re-run: specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    if (rollup.state === "failure") {
      const failingList = rollup.failing.length > 0 ? `: ${rollup.failing.join(", ")}` : "";
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "check status (failed checks)",
          detectedState: `PR checks failed${failingList}`,
          recommendedAction: `Fix failing checks, then re-run: specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    if (rollup.state === "success" || rollup.state === "none") {
      // Checks are green (or no checks exist) — proceed to merge
      stdoutWrite(`PR #${prNumber} checks passed. Proceeding to merge...`);
      break;
    }

    // rollup.state === "pending" — check deadline
    if (effectiveTimeoutMs !== null) {
      const elapsed = nowFn() - start;
      if (elapsed >= effectiveTimeoutMs) {
        const pendingList = rollup.pending.length > 0 ? `: ${rollup.pending.join(", ")}` : "";
        return {
          exitCode: 1,
          escalation: formatEscalation({
            failedStep: "check status (timeout)",
            detectedState: `Timed out waiting for checks to resolve after ${Math.round(elapsed / 1000)}s. Still pending${pendingList}`,
            recommendedAction: `Wait for checks to complete, then re-run: specrunner job archive --with-merge ${slug}`,
            resumeCommand: `specrunner job archive --with-merge ${slug}`,
          }),
        };
      }
    }

    const pendingList = rollup.pending.length > 0 ? ` (${rollup.pending.join(", ")})` : "";
    stdoutWrite(`PR #${prNumber} checks still pending${pendingList}. Waiting ${pollIntervalMs / 1000}s...`);
    await sleepFn(pollIntervalMs);
  }

  // ---------------------------------------------------------------------------
  // Step 5: checkMergeableForMerge + squash merge
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

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
