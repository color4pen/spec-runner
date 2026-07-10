import * as path from "node:path";
import { JobStateStore } from "../../store/job-state-store.js";
import { transitionJob } from "../../state/lifecycle.js";
import { stderrWrite } from "../../logger/stdout.js";
import { resolveStateStoreByJobId } from "../job-access/resolve-state-store.js";
import { isSignalHandlerFired } from "./signal-state.js";

/**
 * Returns a handler that can be called multiple times but only executes once (fired guard).
 *
 * When jobId is provided (per-job mode, T-13):
 *   - If opts.noWorktree && opts.slug: uses cwd-based state directly (no worktree scan).
 *   - Otherwise: scans .git/specrunner-worktrees/ for a dir ending with `-<jobId.slice(0,8)>`,
 *     derives the slug from that dir's changes/ subdirectory, and updates only that
 *     job's branch state (slug-based store).
 *
 * When jobId is not provided (global scan mode):
 *   Scans all running jobs via JobStateStore.list() and transitions them.
 *
 * All I/O is best-effort — errors are swallowed to avoid masking original exit cause.
 */
export function createExitGuardHandler(
  repoRoot: string,
  jobId?: string,
  opts?: { noWorktree?: boolean; slug?: string },
): () => void {
  let fired = false;
  return () => {
    if (fired) return;
    fired = true;
    void (async () => {
      try {
        if (jobId) {
          if (opts?.noWorktree && opts.slug) {
            // No-worktree mode: cwd is the repo root, state lives in specrunner/changes/<slug>/
            await handleNoWorktreeExit(repoRoot, jobId, opts.slug);
          } else {
            // Per-job worktree mode: find slug-based store for this specific job
            await handlePerJobExit(repoRoot, jobId);
          }
        } else {
          // Global scan mode: transition all running jobs
          await handleGlobalExit(repoRoot);
        }
      } catch {
        // best-effort — ignore scan errors
      }
    })();
  };
}

/**
 * No-worktree exit guard: load state from cwd-based store and transition to awaiting-resume.
 */
async function handleNoWorktreeExit(repoRoot: string, jobId: string, slug: string): Promise<void> {
  // Signal handler is responsible — skip to avoid duplicate interruption record
  if (isSignalHandlerFired()) return;
  try {
    stderrWrite(`[specrunner] warn: process exiting with running job ${jobId}, transitioning to awaiting-resume`);
    const store = new JobStateStore(jobId, repoRoot, { slug, stateRoot: repoRoot });
    const state = await store.load();
    if (state.status !== "running") return;
    await store.appendInterruption({
      type: "interruption",
      reason: "signal",
      ts: new Date().toISOString(),
    });
    const { state: updated } = transitionJob(state, "awaiting-resume", {
      trigger: "exit-guard",
      reason: `process exiting with running job ${jobId}`,
      ...(state.step ? { patch: { resumePoint: { step: state.step, reason: "signal", iterationsExhausted: 0 } } } : {}),
    });
    await store.persist(updated);
  } catch {
    // best-effort — ignore errors
  }
}

/**
 * Per-job exit guard: find the worktree for jobId and update only that job's state.
 */
async function handlePerJobExit(repoRoot: string, jobId: string): Promise<void> {
  // Signal handler is responsible — skip to avoid duplicate interruption record
  if (isSignalHandlerFired()) return;
  const jobId8 = jobId.slice(0, 8);
  const worktreesDir = path.join(repoRoot, ".git", "specrunner-worktrees");

  let worktreePath: string | null = null;
  let slug: string | null = null;

  // Find worktree dir ending with -<jobId8>
  try {
    const { readdir } = await import("node:fs/promises");
    const dirs = await readdir(worktreesDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      if (!dir.name.endsWith(`-${jobId8}`)) continue;
      const candidate = path.join(worktreesDir, dir.name);
      // Find slug from changes/ subdirectory
      try {
        const changesDir = path.join(candidate, "specrunner", "changes");
        const slugEntries = await readdir(changesDir, { withFileTypes: true });
        for (const slugEntry of slugEntries) {
          if (!slugEntry.isDirectory() || slugEntry.name === "archive") continue;
          worktreePath = candidate;
          slug = slugEntry.name;
          break;
        }
      } catch {
        // No changes dir in this worktree
      }
      if (slug) break;
    }
  } catch {
    // No worktrees dir — fall back to global scan
    await handleGlobalExit(repoRoot);
    return;
  }

  if (!worktreePath || !slug) {
    // Worktree not found — try global scan as fallback
    await handleGlobalExit(repoRoot);
    return;
  }

  try {
    stderrWrite(`[specrunner] warn: process exiting with running job ${jobId}, transitioning to awaiting-resume`);
    const store = new JobStateStore(jobId, repoRoot, { slug, stateRoot: worktreePath });
    const state = await store.load();
    if (state.status !== "running") return;
    // Append interruption event to journal
    await store.appendInterruption({
      type: "interruption",
      reason: "signal",
      ts: new Date().toISOString(),
    });
    const { state: updated } = transitionJob(state, "awaiting-resume", {
      trigger: "exit-guard",
      reason: `process exiting with running job ${jobId}`,
      ...(state.step ? { patch: { resumePoint: { step: state.step, reason: "signal", iterationsExhausted: 0 } } } : {}),
    });
    await store.persist(updated);
  } catch {
    // best-effort — ignore per-job errors
  }
}

/**
 * Global scan: transition all running jobs to awaiting-resume.
 */
async function handleGlobalExit(repoRoot: string): Promise<void> {
  // Signal handler is responsible — skip to avoid duplicate interruption record
  if (isSignalHandlerFired()) return;
  const states = await JobStateStore.list(repoRoot);
  for (const state of states) {
    if (state.status !== "running") continue;
    try {
      stderrWrite(`[specrunner] warn: process exiting with running job ${state.jobId}, transitioning to awaiting-resume`);
      const store = await resolveStateStoreByJobId(repoRoot, state.jobId);
      if (!store) continue;
      const { state: updated } = transitionJob(state, "awaiting-resume", {
        trigger: "exit-guard",
        reason: `process exiting with running job ${state.jobId}`,
        ...(state.step ? { patch: { resumePoint: { step: state.step, reason: "signal", iterationsExhausted: 0 } } } : {}),
      });
      await store.persist(updated);
    } catch {
      // best-effort — ignore per-job errors
    }
  }
}

/**
 * Register a beforeExit handler that transitions any running jobs to awaiting-resume.
 * Call once per process, early in the CLI entry point.
 */
export function registerExitGuard(repoRoot: string): void {
  process.on("beforeExit", createExitGuardHandler(repoRoot));
}
