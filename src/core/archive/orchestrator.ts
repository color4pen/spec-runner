/**
 * Archive orchestrator — client-closed final cleanup.
 *
 * Design invariant: does NOT import GitHubClient — no GitHub API calls.
 *
 * Phase 0: pre-flight (job state load + finishable gate + terminal status check)
 * Phase 1: git checkout main → derive usage → archiveChangeFolder (mv/skip) →
 *          markJobArchived (slug, cwd) → git add specrunner/changes/ → commitArchive → git push origin main
 * Phase 2: worktree remove + feature branch delete (best-effort)
 */
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "../finish/types.js";
import type { WorktreeManager } from "../worktree/manager.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { getJobSlug } from "../../state/job-slug.js";
import { TERMINAL_STATUSES } from "../../state/lifecycle.js";
import { assertJobFinishable, markJobArchived } from "../finish/job-state-update.js";
import { deriveAndWriteUsage } from "../finish/derive-usage.js";
import { archiveChangeFolder } from "../finish/archive-change-folder.js";
import { commitArchive } from "../finish/commit-archive.js";
import { buildWorktreePath, createWorktreeManager } from "../worktree/manager.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import { formatEscalation } from "../finish/escalation.js";
import { logResult, stderrWrite } from "../../logger/stdout.js";
import { KeepAlive } from "../lifecycle/keepalive.js";
import { livenessJsonPath, managedMarkerPath } from "../../util/paths.js";

export interface ArchiveInput {
  /** Slug of the job to archive. */
  slug: string;
  /** Main repo root (cwd). Must not be inside a worktree. */
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  /** Base branch name (default: "main"). */
  baseBranch?: string;
  /** Injectable WorktreeManager for testing. */
  worktreeManagerFn?: () => WorktreeManager;
}

export type ArchiveResult =
  | { exitCode: 0 }
  | { exitCode: 1; escalation: string }
  | { exitCode: 2; message: string };

/**
 * Resolve worktree path for archive Phase 2 cleanup.
 * Falls back from state.worktreePath → liveness sidecar → buildWorktreePath convention.
 */
async function resolveWorktreePathForArchive(
  state: import("../../state/schema.js").JobState,
  cwd: string,
): Promise<string | null> {
  // 1. Already present in state (split-layout mode)
  if (state.worktreePath) return state.worktreePath;

  const slug = getJobSlug(state);
  if (!slug) return null;

  // 2. Liveness sidecar
  try {
    const sidecarPath = nodePath.join(cwd, livenessJsonPath(slug));
    const raw = await fs.readFile(sidecarPath, "utf-8");
    const sidecar = JSON.parse(raw) as Record<string, unknown>;
    if (typeof sidecar["worktreePath"] === "string" && sidecar["jobId"] === state.jobId) {
      return sidecar["worktreePath"];
    }
  } catch {
    // No sidecar — fall through
  }

  // 3. Convention-derived path (best-effort; remove() is already wrapped in try-catch)
  return buildWorktreePath(cwd, slug, state.jobId);
}

/**
 * Run the archive orchestration.
 * Returns exit code to caller (CLI entry does process.exit()).
 */
export async function runArchiveOrchestrator(
  input: ArchiveInput,
  stdoutWrite: (msg: string) => void = logResult,
): Promise<ArchiveResult> {
  const { slug, cwd, spawn, fs, worktreeManagerFn } = input;
  const baseBranch = input.baseBranch ?? "main";

  // ---------------------------------------------------------------------------
  // Phase 0: resolve job state + finishable gate
  // ---------------------------------------------------------------------------

  let jobId: string;
  let worktreePath: string | null;
  let branch: string | null;

  try {
    const allStates = await JobStateStore.list(cwd);
    const matching = allStates.filter((s) => getJobSlug(s) === slug);

    if (matching.length === 0) {
      return { exitCode: 2, message: `No job found with slug '${slug}'. Run 'specrunner ps' to see available jobs.` };
    }

    // Use most recent state when multiple exist
    matching.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const state = matching[0]!;

    jobId = state.jobId;
    worktreePath = await resolveWorktreePathForArchive(state, cwd);
    branch = state.branch;

    // Terminal status → no-op
    if (TERMINAL_STATUSES.has(state.status)) {
      stdoutWrite(`Already finished (${state.status}).`);
      return { exitCode: 0 };
    }

    // Finishable gate
    try {
      assertJobFinishable(state);
    } catch (err: unknown) {
      if (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOB_NOT_FINISHABLE) {
        return {
          exitCode: 1,
          escalation: formatEscalation({
            failedStep: "job-state-gate",
            detectedState: `JOB_NOT_FINISHABLE (status=${state.status})`,
            recommendedAction: `Wait for the running job to complete, or check its progress with 'specrunner ps'.`,
            resumeCommand: `specrunner job archive ${slug}`,
          }),
        };
      }
      throw err;
    }
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 2, message };
  }

  // Keep the event loop alive for the duration of the orchestration.
  const keepAlive = new KeepAlive();
  keepAlive.acquire();

  try {
    // -------------------------------------------------------------------------
    // Phase 1: main checkout → derive usage → archive change folder → commit → push
    // -------------------------------------------------------------------------
    stdoutWrite(`Phase 1: archiving on ${baseBranch}...`);

    // git checkout main
    const checkoutResult = await spawn("git", ["checkout", baseBranch], { cwd });
    if (checkoutResult.exitCode !== 0) {
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "Phase 1 (git checkout)",
          detectedState: `git checkout ${baseBranch} failed (exit ${checkoutResult.exitCode}): ${checkoutResult.stderr.trim()}`,
          recommendedAction: `Ensure you are on the ${baseBranch} branch and resolve any local changes, then re-run: specrunner job archive ${slug}`,
          resumeCommand: `specrunner job archive ${slug}`,
        }),
      };
    }

    // git pull --ff-only (best-effort to get merged changes)
    const pullResult = await spawn("git", ["pull", "--ff-only"], { cwd });
    if (pullResult.exitCode !== 0) {
      stderrWrite(`Warning: git pull --ff-only failed. Continuing with local state.`);
    }

    // Derive pipeline usage into changes/<slug>/usage.json (before archive moves it)
    try {
      const usageResult = await deriveAndWriteUsage({
        jobId,
        slug,
        cwd,
        repoRoot: cwd,
        spawn,
        fs,
      });
      if (!usageResult.skipped) stdoutWrite(usageResult.message);
    } catch {
      stderrWrite(`Warning: failed to derive usage for ${slug}. Continuing archive.`);
    }

    // Archive change folder (git mv; skips if already moved)
    const archiveResult = await archiveChangeFolder({ slug, cwd, spawn, fs });
    if (!archiveResult.ok) {
      return { exitCode: 1, escalation: archiveResult.escalation };
    }
    if (!archiveResult.skipped) stdoutWrite(archiveResult.message);

    // Mark job archived (D1/D2/D3): resolve slug canonical state dir and transition to archived
    try {
      await markJobArchived(slug, cwd);
      stdoutWrite(`Job ${slug} marked as archived.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "Phase 1 (markJobArchived)",
          detectedState: message,
          recommendedAction: `Re-run: specrunner job archive ${slug}`,
          resumeCommand: `specrunner job archive ${slug}`,
        }),
      };
    }

    // Stage mv + archived status change together so they land in one commit
    const addResult = await spawn("git", ["add", "specrunner/changes/"], { cwd });
    if (addResult.exitCode !== 0) {
      stderrWrite(`Warning: git add specrunner/changes/ failed: ${addResult.stderr.trim()}. Continuing.`);
    }

    // Commit staged changes
    const commitResult = await commitArchive({ slug, cwd, spawn });
    if (!commitResult.ok) {
      return { exitCode: 1, escalation: commitResult.escalation };
    }
    if (!commitResult.skipped) stdoutWrite(commitResult.message);

    // Push to main
    const pushResult = await spawn("git", ["push", "origin", baseBranch], { cwd });
    if (pushResult.exitCode !== 0) {
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "Phase 1 (git push origin main)",
          detectedState: `git push origin ${baseBranch} failed (exit ${pushResult.exitCode}): ${pushResult.stderr.trim()}`,
          recommendedAction: `Check network/auth and re-run: specrunner job archive ${slug}`,
          resumeCommand: `specrunner job archive ${slug}`,
        }),
      };
    }
    stdoutWrite(`Pushed ${baseBranch} to origin.`);

    // -------------------------------------------------------------------------
    // Phase 2: worktree teardown + feature branch delete (best-effort)
    // -------------------------------------------------------------------------
    stdoutWrite("Phase 2: cleaning up worktree...");

    if (worktreePath) {
      const manager = worktreeManagerFn ? worktreeManagerFn() : createWorktreeManager();
      try {
        await manager.remove(worktreePath, cwd);
        await manager.prune(cwd);
      } catch {
        stderrWrite(`Warning: failed to remove worktree at ${worktreePath}. Run 'git worktree prune' manually.`);
      }
    }

    // Delete liveness.json sidecar (best-effort)
    try {
      await fs.unlink(nodePath.join(cwd, livenessJsonPath(slug)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        stderrWrite(`Warning: failed to delete liveness sidecar for ${slug}.`);
      }
    }

    // Delete managed marker (best-effort)
    try {
      await fs.unlink(nodePath.join(cwd, managedMarkerPath(slug)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        stderrWrite(`Warning: failed to delete managed marker for ${slug}.`);
      }
    }

    // Delete feature branch (best-effort)
    if (branch) {
      const localDelResult = await spawn("git", ["branch", "-D", branch], { cwd });
      if (localDelResult.exitCode !== 0) {
        stderrWrite(`Warning: failed to delete local branch ${branch}.`);
      }
      const remoteDelResult = await spawn("git", ["push", "origin", "--delete", branch], { cwd });
      if (remoteDelResult.exitCode !== 0) {
        stderrWrite(`Warning: failed to delete remote branch ${branch}.`);
      }
    }

    return { exitCode: 0 };
  } finally {
    keepAlive.release();
  }
}
