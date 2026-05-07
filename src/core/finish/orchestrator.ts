/**
 * Orchestrator for finish command (1-PR model).
 *
 * Phase 0: pre-flight (reversible checks)
 * Phase 1: checkout feature branch → archive → git mv → commit
 * Phase 2: git push origin <feature-branch>
 * Phase 3: gh pr merge --squash --delete-branch
 * Phase 4: markJobArchived → git checkout main → git pull --ff-only
 *
 * TC-101: legacy /tmp/... request.path → PR merge succeeds
 * TC-103: archive folder absent → skip archive+commit+push, merge+markJobArchived
 * TC-106: feature PR already MERGED → Phase 1-3 skip, Phase 4 only
 * TC-122: chore/archive-<slug> branch NOT created
 * TC-123: normal success flow (archive present, CLEAN)
 * TC-124: markJobArchived called AFTER git pull --ff-only
 * TC-125: Phase 1 escalation → markJobArchived NOT called
 * TC-126: state.status=archived → "Already archived" no-op
 */
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs, FinishFlags } from "./types.js";
import { loadJobState, updateJobState } from "../../state/store.js";
import { resolveTarget } from "./resolve-target.js";
import {
  runPreflight,
  fetchPrViewWithRetryForTest as fetchPrViewWithRetry,
  pollMergeStateAfterPushForTest as pollMergeStateAfterPush,
} from "./preflight.js";
import { archiveOpenspec } from "./archive-openspec.js";
import { moveRequestsDir } from "./move-requests-dir.js";
import { assertJobFinishable, markJobArchived } from "./job-state-update.js";
import { isFullyFinished } from "./idempotency.js";
import { formatEscalation } from "./escalation.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import { createWorktreeManager } from "../worktree/manager.js";

export interface FinishInput {
  /** Positional slug argument. */
  slug?: string;
  /** --pr <num>: reverse lookup. */
  prNumber?: number;
  /** --job <jobId>: forensics / debug. */
  jobId?: string;
  flags: FinishFlags;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  /** Injectable sleep for testing (defaults to real setTimeout-based sleep). */
  sleepFn?: (ms: number) => Promise<void>;
  /** Injectable WorktreeManager for testing (defaults to createWorktreeManager()). */
  worktreeManagerFn?: () => import("../worktree/manager.js").WorktreeManager;
}

export type FinishResult =
  | { exitCode: 0 }
  | { exitCode: 1; escalation: string }
  | { exitCode: 2; message: string };

/**
 * Run the full finish orchestration.
 * Returns exit code to caller (CLI entry does process.exit()).
 */
export async function runFinishOrchestrator(
  input: FinishInput,
  stdoutWrite: (msg: string) => void = (m) => process.stdout.write(m + "\n"),
): Promise<FinishResult> {
  const { slug, prNumber, jobId, flags, cwd, spawn, fs, sleepFn, worktreeManagerFn } = input;

  // Step 1: Resolve target job
  const resolveResult = await resolveTarget(
    { slug, prNumber, jobId, cwd, spawn },
    stdoutWrite,
  );
  if (!resolveResult.ok) {
    return { exitCode: 2, message: resolveResult.message };
  }

  const target = resolveResult.target;

  // Step 2: Load job state and check eligibility
  let state;
  try {
    state = await loadJobState(target.jobId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 2, message };
  }

  // TC-126: Already archived → no-op
  if (isFullyFinished(state)) {
    stdoutWrite("Already archived.");
    return { exitCode: 0 };
  }

  // Reject running jobs
  try {
    assertJobFinishable(state);
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOB_NOT_FINISHABLE) {
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "job-state-gate",
          detectedState: `JOB_NOT_FINISHABLE (status=${state.status})`,
          recommendedAction: `Wait for the running job to complete, or check its progress with \`specrunner ps\`.`,
          resumeCommand: `specrunner finish ${target.slug}`,
        }),
      };
    }
    throw err;
  }

  // Phase 0: pre-flight
  stdoutWrite("Phase 0: pre-flight checks...");
  const preflightResult = await runPreflight({
    target,
    cwd,
    spawn,
    fs,
    dryRun: flags.dryRun ?? false,
    sleepFn,
  });

  if (!preflightResult.ok) {
    return { exitCode: 1, escalation: preflightResult.escalation };
  }

  const { prViewData } = preflightResult;

  // --dry-run: output plan and exit
  if (flags.dryRun) {
    outputDryRunPlan(target, prViewData, stdoutWrite);
    return { exitCode: 0 };
  }

  // Resume path: feature PR already merged
  const prAlreadyMerged = prViewData.state === "MERGED";

  // Design D6: Phase 1 operations run in worktree (if available) or main cwd (after checkout).
  // operationCwd is the directory where archive / git mv / commit / push run.
  const operationCwd = target.worktreePath ?? null;

  if (!prAlreadyMerged) {
    // Phase 1: archive on feature branch
    stdoutWrite(`Phase 1: archive on feature branch ${target.branch}...`);

    // If no worktree path, checkout feature branch in main cwd (managed mode / crash recovery)
    if (!operationCwd) {
      const checkoutResult = await checkoutFeatureBranch({ branch: target.branch, cwd, spawn, slug: target.slug });
      if (!checkoutResult.ok) {
        return { exitCode: 1, escalation: checkoutResult.escalation };
      }
    }

    // Determine the directory to use for archive / git mv / push
    const archiveCwd = operationCwd ?? cwd;

    // openspec archive
    const openspecResult = await archiveOpenspec({
      slug: target.slug,
      cwd: archiveCwd,
      spawn,
      fs,
    });
    if (!openspecResult.ok) {
      return { exitCode: 1, escalation: openspecResult.escalation };
    }
    if (!openspecResult.skipped) {
      stdoutWrite(openspecResult.message);
    }

    // git mv active → merged + commit
    const moveResult = await moveRequestsDir({
      slug: target.slug,
      cwd: archiveCwd,
      spawn,
      fs,
    });
    if (!moveResult.ok) {
      return { exitCode: 1, escalation: moveResult.escalation };
    }
    if (!moveResult.skipped) {
      stdoutWrite(moveResult.message);
    }

    // Phase 2: git push origin <feature-branch>
    stdoutWrite(`Phase 2: git push origin ${target.branch}...`);
    const pushResult = await pushFeatureBranch({ branch: target.branch, cwd: archiveCwd, spawn, slug: target.slug });
    if (!pushResult.ok) {
      return { exitCode: 1, escalation: pushResult.escalation };
    }
    if (!pushResult.skipped) {
      stdoutWrite(`Pushed ${target.branch} to origin.`);
    }

    // Phase 2 post-push: poll mergeStateStatus until CLEAN (Design D1)
    // After push, GitHub recalculates mergeability asynchronously.
    // Poll up to 5 times (3s interval) to wait for CLEAN.
    // On exhaustion, proceed with current status — Phase 3 will attempt merge anyway.
    const postPushPoll = await pollMergeStateAfterPush({
      prNumber: target.prNumber,
      cwd,
      spawn,
      slug: target.slug,
      sleepFn,
    });
    const mergeStateAfterPush = postPushPoll.mergeStateStatus || (prViewData.mergeStateStatus ?? "");

    // Phase 3: gh pr merge --squash --delete-branch
    stdoutWrite(`Phase 3: merging PR #${target.prNumber}...`);
    const mergeResult = await mergeFeaturePrPhase3({
      prNumber: target.prNumber,
      mergeStateStatus: mergeStateAfterPush,
      force: flags.force ?? false,
      cwd,
      spawn,
      slug: target.slug,
    });
    if (!mergeResult.ok) {
      return { exitCode: 1, escalation: mergeResult.escalation };
    }
    stdoutWrite(`PR #${target.prNumber} merged successfully.`);
  } else {
    stdoutWrite(`PR #${target.prNumber} already merged. Skipping Phase 1-3.`);
  }

  // Phase 4: worktree cleanup (local runtime) + markJobArchived + git checkout/pull (managed only)
  stdoutWrite("Phase 4: finalizing...");

  if (operationCwd) {
    // Local runtime: remove the job worktree and update state
    const manager = worktreeManagerFn ? worktreeManagerFn() : createWorktreeManager();
    try {
      await manager.remove(operationCwd, cwd);
      await manager.prune(cwd);
    } catch {
      // Best-effort: don't fail finish if worktree cleanup fails
      process.stderr.write(`Warning: failed to remove worktree at ${operationCwd}. Run 'git worktree prune' manually.\n`);
    }
    // Clear worktreePath in state
    await updateJobState(target.jobId, (s) => ({ ...s, worktreePath: null }));
    // main cwd is clean — no checkout/pull needed
  } else {
    // Managed mode / no worktree: checkout main + pull
    const headResult = await spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    const currentBranch = headResult.exitCode === 0 ? headResult.stdout.trim() : "";
    const isOnMain = currentBranch === "main";

    if (isOnMain) {
      // git checkout main
      const checkoutMainResult = await spawn("git", ["checkout", "main"], { cwd });
      if (checkoutMainResult.exitCode !== 0) {
        return {
          exitCode: 1,
          escalation: formatEscalation({
            failedStep: "Phase 4 (git checkout main)",
            detectedState: `git checkout main failed (exit ${checkoutMainResult.exitCode})`,
            recommendedAction: `Check git error: ${checkoutMainResult.stderr.trim()}. Then re-run: specrunner finish ${target.slug}`,
            resumeCommand: `specrunner finish ${target.slug}`,
          }),
        };
      }

      // git pull --ff-only
      const pullResult = await spawn("git", ["pull", "--ff-only"], { cwd });
      if (pullResult.exitCode !== 0) {
        return {
          exitCode: 1,
          escalation: formatEscalation({
            failedStep: "Phase 4 (git pull --ff-only)",
            detectedState: `git pull --ff-only failed (exit ${pullResult.exitCode})`,
            recommendedAction: `Check git error: ${pullResult.stderr.trim()}. Then re-run: specrunner finish ${target.slug}`,
            resumeCommand: `specrunner finish ${target.slug}`,
          }),
        };
      }
    } else {
      // Running from a linked worktree — skip checkout/pull to avoid the
      // "already checked out" error. The main worktree holds the main branch.
      stdoutWrite(
        `Warning: cwd is on branch '${currentBranch}' (linked worktree). ` +
        `Skipping 'git checkout main' and 'git pull --ff-only'. ` +
        `Run these manually in the main worktree if needed.`,
      );
    }
  }

  // Delete feature branch (best-effort, after worktree is freed)
  const localDelResult = await spawn("git", ["branch", "-D", target.branch], { cwd });
  if (localDelResult.exitCode !== 0) {
    process.stderr.write(`Warning: failed to delete local branch ${target.branch}\n`);
  }
  const remoteDelResult = await spawn("git", ["push", "origin", "--delete", target.branch], { cwd });
  if (remoteDelResult.exitCode !== 0) {
    process.stderr.write(`Warning: failed to delete remote branch ${target.branch}\n`);
  }

  // markJobArchived AFTER Phase 4 operations
  await markJobArchived(target.jobId);
  stdoutWrite(`Job ${target.jobId} marked as archived.`);

  return { exitCode: 0 };
}

// ---------------------------------------------------------------------------
// Phase helpers
// ---------------------------------------------------------------------------

type PhaseResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; escalation: string; exitCode: 1 };

/**
 * Checkout feature branch from origin.
 * Uses: git fetch origin <branch> + git checkout -B <branch> origin/<branch>
 */
async function checkoutFeatureBranch(params: {
  branch: string;
  cwd: string;
  spawn: SpawnFn;
  slug: string;
}): Promise<PhaseResult> {
  const { branch, cwd, spawn, slug } = params;

  // git fetch origin <branch>
  const fetchResult = await spawn("git", ["fetch", "origin", branch], { cwd });
  if (fetchResult.exitCode !== 0) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "Phase 1 (git fetch)",
        detectedState: `git fetch origin ${branch} failed (exit ${fetchResult.exitCode})`,
        recommendedAction: `Check network: ${fetchResult.stderr.trim()}. Then re-run: specrunner finish ${slug}`,
        resumeCommand: `specrunner finish ${slug}`,
      }),
      exitCode: 1,
    };
  }

  // git checkout -B <branch> origin/<branch>
  const checkoutResult = await spawn(
    "git",
    ["checkout", "-B", branch, `origin/${branch}`],
    { cwd },
  );
  if (checkoutResult.exitCode !== 0) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "Phase 1 (git checkout -B)",
        detectedState: `git checkout -B ${branch} failed (exit ${checkoutResult.exitCode})`,
        recommendedAction: `Check git error: ${checkoutResult.stderr.trim()}. Then re-run: specrunner finish ${slug}`,
        resumeCommand: `specrunner finish ${slug}`,
      }),
      exitCode: 1,
    };
  }

  return { ok: true };
}

/**
 * Push feature branch.
 * Skips if no commits to push (git rev-list check).
 */
async function pushFeatureBranch(params: {
  branch: string;
  cwd: string;
  spawn: SpawnFn;
  slug: string;
}): Promise<PhaseResult> {
  const { branch, cwd, spawn, slug } = params;

  const pushResult = await spawn("git", ["push", "origin", branch], { cwd });
  if (pushResult.exitCode !== 0) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "Phase 2 (git push)",
        detectedState: `git push origin ${branch} failed (exit ${pushResult.exitCode})`,
        recommendedAction: `Check git error: ${pushResult.stderr.trim()}. Then re-run: specrunner finish ${slug}`,
        resumeCommand: `specrunner finish ${slug}`,
      }),
      exitCode: 1,
    };
  }

  return { ok: true };
}

interface MergePhase3Params {
  prNumber: number;
  mergeStateStatus: string;
  force: boolean;
  cwd: string;
  spawn: SpawnFn;
  slug: string;
}

/**
 * Merge feature PR (Phase 3).
 * --admin is added ONLY when mergeStateStatus=BLOCKED AND force=true OR
 * when mergeStateStatus=BLOCKED (blocking checks) per spec.
 */
async function mergeFeaturePrPhase3(params: MergePhase3Params): Promise<PhaseResult> {
  const { prNumber, mergeStateStatus, force, cwd, spawn, slug } = params;

  const mergeArgs = ["pr", "merge", String(prNumber), "--squash"];

  // --admin: only when BLOCKED (required status checks blocking) or force flag
  const status = mergeStateStatus.toUpperCase();
  if (status === "BLOCKED" || force) {
    mergeArgs.push("--admin");
  }

  const result = await spawn("gh", mergeArgs, { cwd });

  if (result.exitCode !== 0) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "Phase 3 (gh pr merge)",
        detectedState: `gh pr merge failed (exit ${result.exitCode})`,
        recommendedAction: `Check gh error: ${result.stderr.trim()}. Then re-run: specrunner finish ${slug}`,
        resumeCommand: `specrunner finish ${slug}`,
      }),
      exitCode: 1,
    };
  }

  return { ok: true };
}

/**
 * Output dry-run plan to stdout.
 */
function outputDryRunPlan(
  target: { slug: string; prNumber: number; branch: string },
  prViewData: { state: string; mergeStateStatus?: string },
  stdoutWrite: (msg: string) => void,
): void {
  const archivePlan = "archive openspec changes + move active to merged";
  const mergeStrategy = "gh pr merge --squash";
  const adminFlag = (prViewData.mergeStateStatus ?? "").toUpperCase() === "BLOCKED" ? "yes" : "no";
  const expectedStatus = "archived";

  stdoutWrite("--- dry-run plan ---");
  stdoutWrite(`- slug: ${target.slug}`);
  stdoutWrite(`- source: resolved`);
  stdoutWrite(`- pr-state: ${prViewData.state}`);
  stdoutWrite(`- merge-state-status: ${prViewData.mergeStateStatus ?? "unknown"}`);
  stdoutWrite(`- archive-plan: ${archivePlan}`);
  stdoutWrite(`- merge-strategy: ${mergeStrategy}`);
  stdoutWrite(`- admin-flag: ${adminFlag}`);
  stdoutWrite(`- expected-status: ${expectedStatus}`);
}
