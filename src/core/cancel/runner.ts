/**
 * Core logic for `specrunner job cancel` command.
 *
 * Design:
 * D1: State file is preserved (audit trail) unless --purge is given
 * D2: canceledAt + error.code=USER_CANCELED written to state on cancel
 * D3: cleanup (worktree + branches) is best-effort; failures → warnings
 * D4: archived status is terminal-complete → reject
 * D5: canceled status is idempotent → cleanup only (no state mutation)
 * D6: awaiting-merge requires --force (open PR guard)
 * D7: All I/O deps injected for testability
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { JobStateStore } from "../../store/job-state-store.js";
import { loadStateByJobId } from "../job-access/load-by-job-id.js";
import { resolveCanonicalStateDir } from "../finish/resolve-canonical-state-dir.js";
import { transitionJob } from "../../state/lifecycle.js";
import { stdoutWrite } from "../../logger/stdout.js";
import { ERROR_CODES, SpecRunnerError } from "../../errors.js";
import { gracefulKill } from "./pid-kill.js";
import { buildWorktreePath } from "../worktree/manager.js";
import { getJobSlug } from "../../state/job-slug.js";
import {
  livenessJsonPath,
  managedMarkerPath,
  localSidecarDir,
  requestMdPath,
  draftPath,
  changeFolderPath,
  canceledChangesDirRel,
  canceledChangeFolderPath,
  canceledDirName,
} from "../../util/paths.js";
import * as requestStore from "../request/store.js";
import type { WorktreeManager } from "../worktree/manager.js";
import type { SpawnFn } from "../../util/spawn.js";
import type { JobState } from "../../state/schema.js";
import { createTransportAuth } from "../../git/transport-auth.js";
import { isRemoteRefNotFound } from "../../util/git-push.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CancelResult {
  exitCode: 0 | 1;
  message?: string;
  warnings?: string[];
  info?: string[];
}

export interface CancelDeps {
  spawn: SpawnFn;
  worktreeManager: WorktreeManager;
  sleep: (ms: number) => Promise<void>;
  kill: (pid: number, signal: string) => void;
  isAlive: (pid: number) => boolean;
  repoRoot: string;
  /** Resolved GitHub token for authenticating git push --delete (C10). Optional. */
  githubToken?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Statuses targeted by --all-terminated bulk cleanup (does NOT include archived). */
export const BULK_CLEANUP_STATUSES = new Set(["failed", "terminated", "canceled"]);

/** Timeout in ms for graceful kill (SIGTERM → SIGKILL escalation). */
const GRACEFUL_KILL_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the worktree path for a job using a 3-step fallback:
 * 1. state.worktreePath (split-layout mode — already set)
 * 2. liveness sidecar (.specrunner/local/<slug>/liveness.json)
 * 3. buildWorktreePath convention (<repoRoot>/.git/specrunner-worktrees/<slug>-<jobId8>)
 *
 * Returns null when the slug cannot be determined (legacy job with no slug/branch).
 */
async function resolveWorktreePathForJob(
  state: JobState,
  repoRoot: string,
): Promise<string | null> {
  // 1. Already present in state (split-layout mode)
  if (state.worktreePath) return state.worktreePath;

  const slug = getJobSlug(state);
  if (!slug) return null;

  // 2. Liveness sidecar
  try {
    const sidecarPath = path.join(repoRoot, livenessJsonPath(slug));
    const raw = await fs.readFile(sidecarPath, "utf-8");
    const sidecar = JSON.parse(raw) as Record<string, unknown>;
    if (typeof sidecar["worktreePath"] === "string" && typeof sidecar["jobId"] === "string" && sidecar["jobId"] === state.jobId) {
      return sidecar["worktreePath"];
    }
  } catch {
    // No sidecar — fall through
  }

  // 3. Convention-derived path (best-effort; remove() is already wrapped in try-catch)
  return buildWorktreePath(repoRoot, slug, state.jobId);
}

/**
 * Restore request.md from the branch worktree into drafts/<slug>/request.md.
 * Called only when --restore-draft is passed, and BEFORE cleanupJobResources.
 * Failures append warnings and return early; never throw.
 */
async function restoreDraftFromBranch(
  state: JobState,
  deps: CancelDeps,
  warnings: string[],
  info: string[],
): Promise<void> {
  const slug = getJobSlug(state);
  if (!slug) {
    warnings.push("Warning: cannot restore draft: slug could not be derived");
    return;
  }

  const worktreePath = await resolveWorktreePathForJob(state, deps.repoRoot);
  if (!worktreePath) {
    warnings.push("Warning: cannot restore draft: worktree path could not be resolved");
    return;
  }

  const sourcePath = path.join(worktreePath, requestMdPath(slug));
  let content: string;
  try {
    content = await fs.readFile(sourcePath, "utf-8");
  } catch {
    warnings.push(`Warning: no request.md to restore at ${sourcePath}`);
    return;
  }

  const destPath = path.join(deps.repoRoot, draftPath(slug));
  try {
    await fs.access(destPath);
    // Already exists — skip
    warnings.push(`Warning: draft already exists at specrunner/drafts/${slug}/request.md; skipping restore`);
    return;
  } catch {
    // Does not exist — proceed
  }

  await requestStore.write(deps.repoRoot, slug, content);
  info.push(`Restored draft to specrunner/drafts/${slug}/request.md`);
}

/**
 * Best-effort cleanup: worktree removal + local/remote branch deletion.
 * Failures append warnings but never throw.
 */
async function cleanupJobResources(
  state: JobState,
  deps: CancelDeps,
  warnings: string[],
): Promise<void> {
  const { worktreeManager, repoRoot } = deps;

  // Wrap spawn with transport auth for remote branch delete push (C10, best-effort).
  // If token is absent, auth args resolve to [] and spawn behaves as plain git.
  const transportAuth = createTransportAuth({ token: deps.githubToken, cwd: repoRoot });
  const spawn = transportAuth.wrapSpawn(deps.spawn);

  // 1. git worktree prune (orphan references)
  try {
    await worktreeManager.prune(repoRoot);
  } catch (err: unknown) {
    warnings.push(`Warning: git worktree prune failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. Remove the job's worktree if path is set (slug-mode: resolve via sidecar → convention)
  const worktreePath = await resolveWorktreePathForJob(state, repoRoot);
  if (worktreePath) {
    try {
      await worktreeManager.remove(worktreePath, repoRoot);
    } catch (err: unknown) {
      warnings.push(`Warning: failed to remove worktree at ${worktreePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. (Managed marker unlink is deferred to after canceled-state persist — D6)

  // 4. Delete local branch (best-effort)
  const branch = state.branch;
  if (branch) {
    const localResult = await spawn("git", ["branch", "-D", branch], { cwd: repoRoot });
    if (localResult.exitCode !== 0) {
      warnings.push(`Warning: failed to delete local branch '${branch}': ${localResult.stderr.trim()}`);
    }

    // 4. Delete remote branch (best-effort)
    const remoteResult = await spawn("git", ["push", "origin", "--delete", branch], { cwd: repoRoot });
    if (remoteResult.exitCode !== 0 && !isRemoteRefNotFound(remoteResult.stderr)) {
      warnings.push(`Warning: failed to delete remote branch '${branch}': ${remoteResult.stderr.trim()}`);
    }
  }
}

// ---------------------------------------------------------------------------
// evacuateChangeFolder
// ---------------------------------------------------------------------------

/**
 * Resolve the physical directory of the job's change folder using the same
 * fallback order as load-by-job-id.ts:
 *   1. Worktree slug dir (resolveWorktreePathForJob → {worktreePath}/specrunner/changes/{slug}/)
 *   2. Canonical (resolveCanonicalStateDir → active changes/<slug>/ or archive/<dated>/)
 *   3. Managed sidecar (.specrunner/local/<slug>/)
 * Returns null if none is accessible.
 */
async function resolveSourceChangeFolder(
  state: JobState,
  repoRoot: string,
): Promise<string | null> {
  const slug = getJobSlug(state);

  // 1. Worktree slug dir
  const worktreePath = await resolveWorktreePathForJob(state, repoRoot);
  if (worktreePath) {
    const worktreeSlugDir = path.join(worktreePath, changeFolderPath(slug));
    try {
      await fs.access(worktreeSlugDir);
      return worktreeSlugDir;
    } catch {
      // Not accessible — fall through
    }
  }

  // 2. Canonical (active changes/<slug>/ or archive/<dated>/)
  const canonDir = await resolveCanonicalStateDir(slug, repoRoot);
  if (canonDir) return canonDir;

  // 3. Managed sidecar (.specrunner/local/<slug>/)
  const sidecarDir = path.join(repoRoot, localSidecarDir(slug));
  try {
    await fs.access(sidecarDir);
    return sidecarDir;
  } catch {
    // Not accessible
  }

  return null;
}

/**
 * Copy the job's change folder to canceled/<slug>-<jobId8>/ in the main checkout,
 * BEFORE the worktree is removed. Returns the absolute path of the evacuated directory
 * so the caller can persist the canceled state directly there.
 *
 * Evacuation is best-effort: failures append warnings and never throw.
 * If the source cannot be resolved, a warning is emitted and an empty destination
 * directory is created so the subsequent persist() can do a fresh write.
 * Returns null only when the slug cannot be derived (degenerate case).
 */
async function evacuateChangeFolder(
  state: JobState,
  deps: CancelDeps,
  warnings: string[],
): Promise<string | null> {
  const slug = getJobSlug(state);
  const { repoRoot } = deps;

  if (!slug) {
    warnings.push("Warning: cannot evacuate change folder: slug could not be derived");
    return null;
  }

  const dirName = canceledDirName(slug, state.jobId);
  const destDir = path.join(repoRoot, canceledChangeFolderPath(dirName));

  // Ensure the canceled/ parent directory exists. If this fails, we cannot proceed
  // (there's nowhere to write the gravestone), so return null to signal the caller
  // to skip the persist step.
  try {
    await fs.mkdir(path.join(repoRoot, canceledChangesDirRel()), { recursive: true });
  } catch (err: unknown) {
    warnings.push(
      `Warning: failed to create canceled/ parent: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }

  // Resolve the source change folder
  const sourceDir = await resolveSourceChangeFolder(state, repoRoot);

  if (sourceDir) {
    try {
      await fs.cp(sourceDir, destDir, { recursive: true });
    } catch (err: unknown) {
      warnings.push(
        `Warning: failed to copy change folder to canceled/: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Create empty dest so persist can write a fresh cancellation record
      try {
        await fs.mkdir(destDir, { recursive: true });
      } catch {
        // Ignore — persist will fail gracefully if dir is absent
      }
    }
  } else {
    warnings.push(
      `Warning: change folder source not found for job ${state.jobId}; persisting cancellation record only`,
    );
    try {
      await fs.mkdir(destDir, { recursive: true });
    } catch (err: unknown) {
      warnings.push(
        `Warning: failed to create empty canceled/ directory: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return destDir;
}

// ---------------------------------------------------------------------------
// cancelSingleJob
// ---------------------------------------------------------------------------

/**
 * Cancel a single job.
 * Status-dispatch behavior defined in spec: job-cancel-command.
 */
export async function cancelSingleJob(opts: {
  jobId: string;
  force: boolean;
  purge: boolean;
  restoreDraft?: boolean;
  deps: CancelDeps;
}): Promise<CancelResult> {
  const { jobId, force, purge, restoreDraft = false, deps } = opts;
  const warnings: string[] = [];
  const info: string[] = [];

  // Load state via sidecar → slug dir (T-05 D4)
  let state: JobState;
  try {
    state = (await loadStateByJobId(deps.repoRoot, jobId)) as JobState;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException & { code?: string }).code;
    if (
      (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOB_NOT_FOUND) ||
      code === "ENOENT"
    ) {
      return { exitCode: 1, message: `Job not found: ${jobId}` };
    }
    throw err;
  }

  // ---------------------------------------------------------------------------
  // Status-specific pre-checks
  // ---------------------------------------------------------------------------

  if (state.status === "archived") {
    return {
      exitCode: 1,
      message: "Job is already archived. Cannot cancel.",
    };
  }

  if (state.status === "awaiting-archive" && !force) {
    return {
      exitCode: 1,
      message: "PR is open. Use --force to cancel.",
    };
  }

  // ---------------------------------------------------------------------------
  // Process kill for running jobs
  // ---------------------------------------------------------------------------

  if (state.status === "running") {
    if (state.pid != null) {
      const killResult = await gracefulKill(state.pid, GRACEFUL_KILL_TIMEOUT_MS, {
        kill: deps.kill,
        sleep: deps.sleep,
        isAlive: deps.isAlive,
      });
      if (!killResult.killed && killResult.warning) {
        warnings.push(killResult.warning);
      }
    } else {
      warnings.push("Warning: no PID recorded for running job, skipping process kill.");
    }
  }

  // ---------------------------------------------------------------------------
  // Restore draft (best-effort, before cleanup so worktree is still present)
  // ---------------------------------------------------------------------------

  if (restoreDraft) {
    await restoreDraftFromBranch(state, deps, warnings, info);
  }

  // ---------------------------------------------------------------------------
  // Evacuate change folder to canceled/<slug>-<jobId8>/ (before cleanup)
  // Skip for already-canceled (idempotent) and --purge (leave-no-trace).
  // ---------------------------------------------------------------------------

  let canceledDirAbs: string | null = null;
  if (state.status !== "canceled" && !purge) {
    canceledDirAbs = await evacuateChangeFolder(state, deps, warnings);
  }

  // ---------------------------------------------------------------------------
  // Cleanup (best-effort): worktree removal + branch deletion
  // ---------------------------------------------------------------------------

  await cleanupJobResources(state, deps, warnings);

  // ---------------------------------------------------------------------------
  // Persist canceled state directly to the evacuated directory.
  // This write is independent of the worktree, so it survives cleanup.
  // Skip for already-canceled (idempotent) and --purge (leave-no-trace).
  // ---------------------------------------------------------------------------

  if (state.status !== "canceled" && !purge) {
    const now = new Date().toISOString();
    const { state: updated } = transitionJob(state, "canceled", {
      trigger: "cancel",
      reason: "Canceled by user",
      patch: {
        error: { code: ERROR_CODES.USER_CANCELED, message: "Canceled by user", hint: "" },
        canceledAt: now,
        worktreePath: null,
      },
    });

    if (canceledDirAbs) {
      await new JobStateStore(state.jobId, deps.repoRoot, { changeDir: canceledDirAbs }).persist(updated);
    }
  }

  // ---------------------------------------------------------------------------
  // Managed marker unlink — D6: after canceled-state persist, best-effort
  // (idempotent canceled path also runs this; local runtime marker is no-op)
  // ---------------------------------------------------------------------------

  const slugForMarker = getJobSlug(state);
  if (slugForMarker) {
    const markerAbsPath = path.join(deps.repoRoot, managedMarkerPath(slugForMarker));
    try {
      await fs.unlink(markerAbsPath);
    } catch {
      // Best-effort — ENOENT is fine (local runtime has no marker)
    }
  }

  // ---------------------------------------------------------------------------
  // Purge (machine-local sidecar deletion)
  // ---------------------------------------------------------------------------

  if (purge) {
    // Purge .specrunner/local/<slug>/ (machine-local sidecar — liveness / marker / managed state)
    if (slugForMarker) {
      try {
        await fs.rm(path.join(deps.repoRoot, localSidecarDir(slugForMarker)), {
          recursive: true,
          force: true,
        });
      } catch {
        // Best-effort — directory may not exist
      }
    }
  }

  return {
    exitCode: 0,
    message: `Canceled job ${jobId}`,
    ...(info.length > 0 ? { info } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

// ---------------------------------------------------------------------------
// cancelAllTerminated
// ---------------------------------------------------------------------------

/**
 * Bulk delete state files for all jobs in terminal status (failed/terminated/canceled).
 * Does NOT include archived (different lifecycle).
 */
export async function cancelAllTerminated(opts: {
  yes: boolean;
  repoRoot: string;
  stdin?: NodeJS.ReadableStream;
}): Promise<CancelResult> {
  const { yes, repoRoot, stdin: stdinOverride } = opts;

  const allStates = await JobStateStore.list(repoRoot);
  const targets = allStates.filter((s) => BULK_CLEANUP_STATUSES.has(s.status));

  if (targets.length === 0) {
    return { exitCode: 0, message: "No terminated jobs to remove." };
  }

  const infoMessages: string[] = [];
  infoMessages.push(`Found ${targets.length} terminated job(s) to remove.`);

  if (!yes) {
    const stdinStream = stdinOverride ?? process.stdin;
    const isTTY = (stdinStream as NodeJS.ReadStream).isTTY ?? false;
    if (!isTTY) {
      return {
        exitCode: 1,
        message: "Non-interactive mode requires --yes to bulk-delete jobs.",
      };
    }

    const confirmed = await promptConfirm(stdinStream, "Remove all? [y/N] ");
    if (!confirmed) {
      return { exitCode: 0, message: "Aborted.", info: infoMessages };
    }
  }

  let removed = 0;
  let hasErrors = false;
  const warnings: string[] = [];

  for (const state of targets) {
    const slug = getJobSlug(state);
    if (!slug) {
      warnings.push(`Skipped ${state.jobId}: no slug to resolve sidecar path`);
      continue;
    }
    try {
      await fs.rm(path.join(repoRoot, localSidecarDir(slug)), { recursive: true, force: true });
      removed++;
    } catch (err: unknown) {
      hasErrors = true;
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to remove sidecar for ${state.jobId}: ${msg}`);
    }
  }

  infoMessages.push(`Removed ${removed} job(s).`);

  return {
    exitCode: hasErrors ? 1 : 0,
    info: infoMessages,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

// ---------------------------------------------------------------------------
// Internal: promptConfirm
// ---------------------------------------------------------------------------

/**
 * Read one line from stream and return true if answer is 'y' or 'Y'.
 * Ported from src/core/rm/runner.ts.
 */
function promptConfirm(stream: NodeJS.ReadableStream, prompt: string): Promise<boolean> {
  return new Promise((resolve) => {
    stdoutWrite(prompt);

    let answer = "";
    const onData = (chunk: Buffer | string) => {
      answer += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      const newlineIdx = answer.indexOf("\n");
      if (newlineIdx !== -1) {
        stream.removeListener("data", onData);
        stream.removeListener("end", onEnd);
        const line = answer.slice(0, newlineIdx).trim();
        resolve(line === "y" || line === "Y");
      }
    };
    const onEnd = () => {
      stream.removeListener("data", onData);
      const line = answer.trim();
      resolve(line === "y" || line === "Y");
    };

    stream.on("data", onData);
    stream.on("end", onEnd);
  });
}
