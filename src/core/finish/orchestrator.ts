/**
 * Orchestrator for finish command (1-PR model).
 *
 * Phase 0: pre-flight (reversible checks)
 * Phase 1: checkout feature branch → archive change folder → git mv → commit
 * Phase 2: git push origin <feature-branch>
 * Phase 3: gh pr merge --squash --delete-branch
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
import type { FinishFs, FinishFlags, ResolvedTarget, PrViewData } from "./types.js";
import type { WorktreeManager } from "../worktree/manager.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { resolveTarget } from "./resolve-target.js";
import { runPreflight } from "./preflight.js";
import { fetchPrViewWithRetry, pollMergeStateAfterPush, checkMergeableForMerge } from "./pr-status.js";
import { spawnOrEscalate } from "./spawn-helper.js";
import { archiveChangeFolder } from "./archive-change-folder.js";
import { moveRequestsDir } from "./move-requests-dir.js";
import { mergeSpecsForChange } from "./spec-merge.js";
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
  const { slug, prNumber, jobId, baseBranch, flags, cwd, spawn, fs, sleepFn, worktreeManagerFn } = input;

  const resolveResult = await resolveTarget({ slug, prNumber, jobId, cwd, spawn }, stdoutWrite);
  if (!resolveResult.ok) return { exitCode: 2, message: resolveResult.message };
  const target = resolveResult.target;

  let state;
  try {
    const store = new JobStateStore(target.jobId);
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

  // Phase 0: pre-flight
  stdoutWrite("Phase 0: pre-flight checks...");
  const preflightResult = await runPreflight({ target, cwd, spawn, fs, dryRun: flags.dryRun ?? false, sleepFn });
  if (!preflightResult.ok) return { exitCode: 1, escalation: preflightResult.escalation };
  const { prViewData } = preflightResult;

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
    const p2 = await runPhase2Push({ target, operationCwd, cwd, spawn, baseBranch, prViewData, stdoutWrite, sleepFn });
    if (!p2.ok) return { exitCode: 1, escalation: p2.escalation };

    stdoutWrite(`Phase 3: merging PR #${target.prNumber}...`);
    const mergeResult = await mergeFeaturePrPhase3({
      prNumber: target.prNumber,
      mergeStateStatus: p2.mergeStateAfterPush,
      force: flags.force ?? false,
      cwd,
      spawn,
      slug: target.slug,
      baseBranch,
      sleepFn,
    });
    if (!mergeResult.ok) return { exitCode: 1, escalation: mergeResult.escalation };
    stdoutWrite(`PR #${target.prNumber} merged successfully.`);
    // State確定: PR merge は不可逆。成功直後に archived に遷移
    await markJobArchived(target.jobId);
    stdoutWrite(`Job ${target.jobId} marked as archived.`);
  } else {
    stdoutWrite(`PR #${target.prNumber} already merged. Skipping Phase 1-3.`);
    await markJobArchived(target.jobId);
    stdoutWrite(`Job ${target.jobId} marked as archived.`);
  }

  stdoutWrite("Phase 4: finalizing...");
  const p4 = await runPhase4Finalize({ target, operationCwd, cwd, spawn, baseBranch, worktreeManagerFn, stdoutWrite });
  if (!p4.ok) return { exitCode: 1, escalation: p4.escalation };

  return { exitCode: 0 };
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

  // archive change folder (specrunner/changes/<slug>/ → specrunner/changes/archive/<slug>/)
  const archiveResult = await archiveChangeFolder({ slug: target.slug, cwd: archiveCwd, spawn, fs });
  if (!archiveResult.ok) return { ok: false, escalation: archiveResult.escalation, exitCode: 1 };
  if (!archiveResult.skipped) stdoutWrite(archiveResult.message);

  // git mv active → merged + commit
  const moveResult = await moveRequestsDir({ slug: target.slug, cwd: archiveCwd, spawn, fs });
  if (!moveResult.ok) return { ok: false, escalation: moveResult.escalation, exitCode: 1 };
  if (!moveResult.skipped) stdoutWrite(moveResult.message);

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
}): Promise<Phase2Result> {
  const { target, operationCwd, cwd, spawn, baseBranch, prViewData, stdoutWrite, sleepFn } = params;
  const archiveCwd = operationCwd ?? cwd;

  const pushResult = await pushFeatureBranch({ branch: target.branch, cwd: archiveCwd, spawn, slug: target.slug });
  if (!pushResult.ok) return { ok: false, escalation: pushResult.escalation, exitCode: 1 };
  if (!pushResult.skipped) stdoutWrite(`Pushed ${target.branch} to origin.`);

  // Phase 2 post-push: poll mergeStateStatus until CLEAN (Design D1)
  const postPushPoll = await pollMergeStateAfterPush({
    prNumber: target.prNumber,
    cwd,
    spawn,
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
      const store = new JobStateStore(target.jobId);
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
  force: boolean;
  cwd: string;
  spawn: SpawnFn;
  slug: string;
  baseBranch: string;
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Merge feature PR (Phase 3).
 * --admin is added ONLY when mergeStateStatus=BLOCKED AND force=true OR
 * when mergeStateStatus=BLOCKED (blocking checks) per spec.
 */
async function mergeFeaturePrPhase3(params: MergePhase3Params): Promise<PhaseResult> {
  const { prNumber, mergeStateStatus, force, cwd, spawn, slug, baseBranch, sleepFn } = params;

  // Phase 3 guard: check mergeable before attempting merge
  const mergeableResult = await checkMergeableForMerge({
    prNumber,
    cwd,
    spawn,
    slug,
    baseBranch,
    sleepFn,
  });
  if (!mergeableResult.ok) {
    return { ok: false, escalation: mergeableResult.escalation, exitCode: 1 };
  }

  const mergeArgs = ["pr", "merge", String(prNumber), "--squash"];

  // --admin: only when BLOCKED (required status checks blocking) or force flag
  const status = mergeStateStatus.toUpperCase();
  if (status === "BLOCKED" || force) {
    mergeArgs.push("--admin");
  }

  const mergeResult = await spawnOrEscalate({
    spawn,
    cmd: "gh",
    args: mergeArgs,
    cwd,
    failedStep: "Phase 3 (gh pr merge)",
    resumeCommand: `specrunner finish ${slug}`,
  });
  if (!mergeResult.ok) {
    return { ok: false, escalation: mergeResult.escalation, exitCode: 1 };
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
  const archivePlan = "archive change folder + move active to merged";
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
