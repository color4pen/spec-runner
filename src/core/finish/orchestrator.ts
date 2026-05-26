/**
 * Orchestrator for finish command (1-PR model).
 *
 * Phase 0: pre-flight (reversible checks)
 * Phase 1: checkout feature branch → archive change folder → git mv → commit
 * Phase 2: git push origin <feature-branch>
 * Phase 3: REST API squash merge
 * Phase 4: git checkout main → git pull --ff-only (best-effort cleanup)
 *
 * TC-101: legacy /tmp/... request.path → PR merge succeeds
 * TC-103: archive folder absent → skip archive+commit+push, merge+markJobArchived
 * TC-106: feature PR already MERGED → Phase 1-3 skip, Phase 4 only
 * TC-122: chore/archive-<slug> branch NOT created
 * TC-123: normal success flow (archive present, CLEAN)
 * TC-124: markJobArchived called AFTER Phase 3 merge (BEFORE Phase 4 cleanup)
 * TC-125: Phase 1 escalation → markJobArchived NOT called
 * TC-126: state.status=archived → "Already archived" no-op
 */
import type { SpawnFn } from "../../util/spawn.js";
import { KeepAlive } from "../lifecycle/keepalive.js";
import type { GitHubClient } from "../../core/port/github-client.js";
import type { FinishFs, FinishFlags, ResolvedTarget, PrViewData } from "./types.js";
import type { WorktreeManager } from "../worktree/manager.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { resolveTarget } from "./resolve-target.js";
import { runPreflight } from "./preflight.js";
import { runLocalConflictCheck } from "./local-conflict-check.js";
import { pollMergeStateAfterPush, checkMergeableForMerge } from "./pr-status.js";
import { spawnOrEscalate } from "./spawn-helper.js";
import { archiveChangeFolder } from "./archive-change-folder.js";
import { mergeSpecsForChange } from "./spec-merge.js";
import { commitArchive } from "./commit-archive.js";
import { deriveAndWriteUsage } from "./derive-usage.js";
import { assertJobFinishable, markJobArchived } from "./job-state-update.js";
import { TERMINAL_STATUSES } from "../../state/lifecycle.js";
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
  /** Base branch name (e.g. "main" or "master"). */
  baseBranch: string;
  flags: FinishFlags;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  /** GitHub REST API client for PR operations. */
  githubClient: GitHubClient;
  /** GitHub repository owner. */
  owner: string;
  /** GitHub repository name. */
  repo: string;
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
  const { slug, prNumber, jobId, baseBranch, flags, cwd, spawn, fs, sleepFn, worktreeManagerFn, githubClient, owner, repo } = input;

  const resolveResult = await resolveTarget(
    { slug, prNumber, jobId, cwd, githubClient, owner, repo },
    stdoutWrite,
  );
  if (!resolveResult.ok) return { exitCode: 2, message: resolveResult.message };
  const target = resolveResult.target;

  let state;
  try {
    const store = new JobStateStore(target.jobId, cwd);
    state = await store.load();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 2, message };
  }

  // TC-126: Already finished (archived or canceled) → no-op
  if (TERMINAL_STATUSES.has(state.status)) {
    stdoutWrite(`Already finished (${state.status}).`);
    return { exitCode: 0 };
  }

  try {
    assertJobFinishable(state);
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOB_NOT_FINISHABLE) {
      return { exitCode: 1, escalation: formatEscalation({
        failedStep: "job-state-gate",
        detectedState: `JOB_NOT_FINISHABLE (status=${state.status})`,
        recommendedAction: `Wait for the running job to complete, or check its progress with \`specrunner ps\`.`,
        resumeCommand: `specrunner finish ${target.slug}`,
      }) };
    }
    throw err;
  }

  // Keep the event loop alive for the duration of the orchestration.
  const keepAlive = new KeepAlive();
  keepAlive.acquire();

  try {
  // Phase 0: pre-flight
  stdoutWrite("Phase 0: pre-flight checks...");
  const preflightResult = await runPreflight({
    target,
    cwd,
    spawn,
    fs,
    dryRun: flags.dryRun ?? false,
    githubClient,
    owner,
    repo,
    sleepFn,
  });
  if (!preflightResult.ok) return { exitCode: 1, escalation: preflightResult.escalation };
  const { prViewData } = preflightResult;

  // Phase 0 (continued): local conflict check
  if (!flags.dryRun && prViewData.state !== "MERGED") {
    stdoutWrite("Phase 0: local conflict check...");
    const localCheckCwd = target.worktreePath ?? cwd;
    try {
      const conflictResult = await runLocalConflictCheck({
        baseBranch,
        cwd: localCheckCwd,
        spawn,
      });
      if (!conflictResult.ok) {
        const pathList = conflictResult.conflictPaths.length > 0
          ? conflictResult.conflictPaths.map(p => `  - ${p}`).join("\n")
          : "  (paths could not be determined)";
        return {
          exitCode: 1,
          escalation: formatEscalation({
            failedStep: "Phase 0 local conflict check",
            detectedState: `${target.slug} conflicts with origin/${baseBranch}`,
            recommendedAction: `Resolve conflicts:\n${pathList}\n\n  1. git rebase origin/${baseBranch}\n  2. Re-run: specrunner finish ${target.slug}`,
            resumeCommand: `specrunner finish ${target.slug}`,
          }),
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "Phase 0 git fetch",
          detectedState: `git fetch origin ${baseBranch} failed`,
          recommendedAction: `Check network/auth: ${message}. Then re-run: specrunner finish ${target.slug}`,
          resumeCommand: `specrunner finish ${target.slug}`,
        }),
      };
    }
  }

  // --dry-run: output plan and exit
  if (flags.dryRun) {
    outputDryRunPlan(target, prViewData, stdoutWrite);
    return { exitCode: 0 };
  }

  const prAlreadyMerged = prViewData.state === "MERGED";
  const operationCwd = target.worktreePath ?? null;

  if (!prAlreadyMerged) {
    stdoutWrite(`Phase 1: archive on feature branch ${target.branch}...`);
    const p1 = await runPhase1Archive({ target, operationCwd, cwd, spawn, fs, stdoutWrite });
    if (!p1.ok) return { exitCode: 1, escalation: p1.escalation };

    stdoutWrite(`Phase 2: git push origin ${target.branch}...`);
    const p2 = await runPhase2Push({
      target,
      operationCwd,
      cwd,
      spawn,
      baseBranch,
      prViewData,
      stdoutWrite,
      sleepFn,
      githubClient,
      owner,
      repo,
    });
    if (!p2.ok) return { exitCode: 1, escalation: p2.escalation };

    stdoutWrite(`Phase 3: merging PR #${target.prNumber}...`);
    const mergeResult = await mergeFeaturePrPhase3({
      prNumber: target.prNumber,
      mergeStateStatus: p2.mergeStateAfterPush,
      githubClient,
      owner,
      repo,
      slug: target.slug,
      baseBranch,
      sleepFn,
    });
    if (!mergeResult.ok) return { exitCode: 1, escalation: mergeResult.escalation };
    stdoutWrite(`PR #${target.prNumber} merged successfully.`);
    // State確定: PR merge は不可逆。成功直後に archived に遷移
    await markJobArchived(target.jobId, cwd);
    stdoutWrite(`Job ${target.jobId} marked as archived.`);
  } else {
    stdoutWrite(`PR #${target.prNumber} already merged. Skipping Phase 1-3.`);
    await markJobArchived(target.jobId, cwd);
    stdoutWrite(`Job ${target.jobId} marked as archived.`);
  }

  stdoutWrite("Phase 4: finalizing...");
  const p4 = await runPhase4Finalize({ target, operationCwd, cwd, spawn, baseBranch, worktreeManagerFn, stdoutWrite });
  if (!p4.ok) return { exitCode: 1, escalation: p4.escalation };

  return { exitCode: 0 };
  } finally {
    keepAlive.release();
  }
}

// ---------------------------------------------------------------------------
// Phase helpers
// ---------------------------------------------------------------------------

type PhaseResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; escalation: string; exitCode: 1 };

type Phase2Result =
  | { ok: true; mergeStateAfterPush: string }
  | { ok: false; escalation: string; exitCode: 1 };

/**
 * Phase 1: checkout feature branch (if needed) → archive change folder → git mv requests → commit.
 */
async function runPhase1Archive(params: {
  target: ResolvedTarget;
  operationCwd: string | null;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  stdoutWrite: (msg: string) => void;
}): Promise<PhaseResult> {
  const { target, operationCwd, cwd, spawn, fs, stdoutWrite } = params;

  // If no worktree path, checkout feature branch in main cwd (managed mode / crash recovery)
  if (!operationCwd) {
    const checkoutResult = await checkoutFeatureBranch({ branch: target.branch, cwd, spawn, slug: target.slug });
    if (!checkoutResult.ok) return { ok: false, escalation: checkoutResult.escalation, exitCode: 1 };
  }

  const archiveCwd = operationCwd ?? cwd;

  // merge delta specs into baseline specs before archive
  const mergeResult = await mergeSpecsForChange({ slug: target.slug, cwd: archiveCwd, spawn, fs });
  if (!mergeResult.ok) return { ok: false, escalation: mergeResult.escalation, exitCode: 1 };
  if (!mergeResult.skipped) stdoutWrite(mergeResult.message);

  // derive pipeline usage into changes/<slug>/usage.json (before archive moves it)
  try {
    const usageResult = await deriveAndWriteUsage({
      jobId: target.jobId,
      slug: target.slug,
      cwd: archiveCwd,
      repoRoot: cwd,
      spawn,
      fs,
    });
    if (!usageResult.skipped) stdoutWrite(usageResult.message);
  } catch {
    // Best-effort: failure must not block finish
    process.stderr.write(`Warning: failed to derive usage for ${target.slug}. Continuing finish.\n`);
  }

  // archive change folder (specrunner/changes/<slug>/ → specrunner/changes/archive/<slug>/)
  const archiveResult = await archiveChangeFolder({ slug: target.slug, cwd: archiveCwd, spawn, fs });
  if (!archiveResult.ok) return { ok: false, escalation: archiveResult.escalation, exitCode: 1 };
  if (!archiveResult.skipped) stdoutWrite(archiveResult.message);

  // commit staged changes (spec-merge + archive) as a single commit
  const commitResult = await commitArchive({ slug: target.slug, cwd: archiveCwd, spawn });
  if (!commitResult.ok) return { ok: false, escalation: commitResult.escalation, exitCode: 1 };
  if (!commitResult.skipped) stdoutWrite(commitResult.message);

  return { ok: true };
}

/**
 * Phase 2: git push origin <feature-branch> + poll mergeStateStatus.
 */
async function runPhase2Push(params: {
  target: ResolvedTarget;
  operationCwd: string | null;
  cwd: string;
  spawn: SpawnFn;
  baseBranch: string;
  prViewData: PrViewData;
  stdoutWrite: (msg: string) => void;
  sleepFn?: (ms: number) => Promise<void>;
  githubClient: GitHubClient;
  owner: string;
  repo: string;
}): Promise<Phase2Result> {
  const { target, operationCwd, cwd, spawn, baseBranch, prViewData, stdoutWrite, sleepFn, githubClient, owner, repo } = params;
  const archiveCwd = operationCwd ?? cwd;

  const pushResult = await pushFeatureBranch({ branch: target.branch, cwd: archiveCwd, spawn, slug: target.slug });
  if (!pushResult.ok) return { ok: false, escalation: pushResult.escalation, exitCode: 1 };
  if (!pushResult.skipped) stdoutWrite(`Pushed ${target.branch} to origin.`);

  // Phase 2 post-push: poll mergeStateStatus until CLEAN (Design D1)
  const postPushPoll = await pollMergeStateAfterPush({
    prNumber: target.prNumber,
    githubClient,
    owner,
    repo,
    slug: target.slug,
    sleepFn,
  });
  const mergeStateAfterPush = postPushPoll.mergeStateStatus || (prViewData.mergeStateStatus ?? "");

  // DIRTY = merge conflicts confirmed. Escalate before attempting merge.
  if (mergeStateAfterPush === "DIRTY") {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "Phase 3 guard (mergeStateStatus DIRTY)",
        detectedState: "mergeStateStatus is DIRTY (merge conflicts exist)",
        recommendedAction: `PR has merge conflicts (DIRTY). Rebase the feature branch onto ${baseBranch} and re-run: specrunner finish ${target.slug}`,
        resumeCommand: `specrunner finish ${target.slug}`,
      }),
      exitCode: 1,
    };
  }

  return { ok: true, mergeStateAfterPush };
}

/**
 * Phase 4: worktree cleanup / git checkout+pull (best-effort) / branch deletion.
 * State is already archived before this phase runs (markJobArchived called in main flow).
 */
async function runPhase4Finalize(params: {
  target: ResolvedTarget;
  operationCwd: string | null;
  cwd: string;
  spawn: SpawnFn;
  baseBranch: string;
  worktreeManagerFn?: () => WorktreeManager;
  stdoutWrite: (msg: string) => void;
}): Promise<PhaseResult> {
  const { target, operationCwd, cwd, spawn, baseBranch, worktreeManagerFn, stdoutWrite } = params;

  if (operationCwd) {
    // Local runtime: remove the job worktree and update state (best-effort)
    const manager = worktreeManagerFn ? worktreeManagerFn() : createWorktreeManager();
    try {
      await manager.remove(operationCwd, cwd);
      await manager.prune(cwd);
    } catch {
      // Best-effort: don't fail finish if worktree cleanup fails
      process.stderr.write(`Warning: failed to remove worktree at ${operationCwd}. Run 'git worktree prune' manually.\n`);
    }
    // Clear worktreePath in state (best-effort — state is already archived)
    try {
      const store = new JobStateStore(target.jobId, cwd);
      const current = await store.load();
      await store.persist({ ...current, worktreePath: null });
    } catch {
      process.stderr.write(`Warning: failed to clear worktreePath for job ${target.jobId}.\n`);
    }
    // main cwd is clean — no checkout/pull needed
  } else {
    // Managed mode / no worktree: checkout main + pull (best-effort)
    const headResult = await spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    const currentBranch = headResult.exitCode === 0 ? headResult.stdout.trim() : "";
    const isOnMain = currentBranch === baseBranch;

    if (isOnMain) {
      const checkoutResult = await spawn("git", ["checkout", baseBranch], { cwd });
      if (checkoutResult.exitCode !== 0) {
        process.stderr.write(`Warning: failed to checkout ${baseBranch} in Phase 4. Run manually: git checkout ${baseBranch}\n`);
      } else {
        const pullResult = await spawn("git", ["pull", "--ff-only"], { cwd });
        if (pullResult.exitCode !== 0) {
          process.stderr.write(`Warning: failed to git pull --ff-only in Phase 4. Run manually: git pull --ff-only\n`);
        }
      }
    } else {
      // Running from a linked worktree — skip checkout/pull to avoid the
      // "already checked out" error. The main worktree holds the main branch.
      stdoutWrite(
        `Warning: cwd is on branch '${currentBranch}' (linked worktree). ` +
        `Skipping 'git checkout ${baseBranch}' and 'git pull --ff-only'. ` +
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

  return { ok: true };
}

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
  const fetchResult = await spawnOrEscalate({
    spawn,
    cmd: "git",
    args: ["fetch", "origin", branch],
    cwd,
    failedStep: "Phase 1 (git fetch)",
    resumeCommand: `specrunner finish ${slug}`,
  });
  if (!fetchResult.ok) {
    return { ok: false, escalation: fetchResult.escalation, exitCode: 1 };
  }

  // git checkout -B <branch> origin/<branch>
  const checkoutResult = await spawnOrEscalate({
    spawn,
    cmd: "git",
    args: ["checkout", "-B", branch, `origin/${branch}`],
    cwd,
    failedStep: "Phase 1 (git checkout -B)",
    resumeCommand: `specrunner finish ${slug}`,
  });
  if (!checkoutResult.ok) {
    return { ok: false, escalation: checkoutResult.escalation, exitCode: 1 };
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

  const pushResult = await spawnOrEscalate({
    spawn,
    cmd: "git",
    args: ["push", "origin", branch],
    cwd,
    failedStep: "Phase 2 (git push)",
    resumeCommand: `specrunner finish ${slug}`,
  });
  if (!pushResult.ok) {
    return { ok: false, escalation: pushResult.escalation, exitCode: 1 };
  }

  return { ok: true };
}

interface MergePhase3Params {
  prNumber: number;
  mergeStateStatus: string;
  githubClient: GitHubClient;
  owner: string;
  repo: string;
  slug: string;
  baseBranch: string;
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Merge feature PR (Phase 3) via REST API.
 * D4: --admin equivalent is handled implicitly by admin token; 405 → escalation.
 */
async function mergeFeaturePrPhase3(params: MergePhase3Params): Promise<PhaseResult> {
  const { prNumber, githubClient, owner, repo, slug, baseBranch, sleepFn } = params;

  // Phase 3 guard: check mergeable before attempting merge
  const mergeableResult = await checkMergeableForMerge({
    prNumber,
    githubClient,
    owner,
    repo,
    slug,
    baseBranch,
    sleepFn,
  });
  if (!mergeableResult.ok) {
    return { ok: false, escalation: mergeableResult.escalation, exitCode: 1 };
  }

  // REST API squash merge (D4: admin bypass is implicit via token permissions)
  let mergeResult: { merged: boolean; message: string };
  try {
    mergeResult = await githubClient.mergePullRequest(owner, repo, prNumber, { mergeMethod: "squash" });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "Phase 3 (REST API squash merge)",
        detectedState: `mergePullRequest #${prNumber} threw: ${detail}`,
        recommendedAction: `Check GitHub token permissions and re-run: specrunner finish ${slug}`,
        resumeCommand: `specrunner finish ${slug}`,
      }),
      exitCode: 1,
    };
  }

  if (!mergeResult.merged) {
    return {
      ok: false,
      escalation: formatEscalation({
        failedStep: "Phase 3 (REST API squash merge)",
        detectedState: `merge failed: ${mergeResult.message}`,
        recommendedAction: `${mergeResult.message}\n\nCheck branch protection rules or token permissions, then re-run: specrunner finish ${slug}`,
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
  const archivePlan = "archive change folder";
  const mergeStrategy = "REST API squash merge";
  const expectedStatus = "archived";

  stdoutWrite("--- dry-run plan ---");
  stdoutWrite(`- slug: ${target.slug}`);
  stdoutWrite(`- source: resolved`);
  stdoutWrite(`- pr-state: ${prViewData.state}`);
  stdoutWrite(`- merge-state-status: ${prViewData.mergeStateStatus ?? "unknown"}`);
  stdoutWrite(`- archive-plan: ${archivePlan}`);
  stdoutWrite(`- merge-strategy: ${mergeStrategy}`);
  stdoutWrite(`- expected-status: ${expectedStatus}`);
}
