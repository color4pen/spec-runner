/**
 * Archive orchestrator — records archive commit on feature branch.
 *
 * Design invariant: does NOT import GitHubClient — no GitHub API calls.
 * Design invariant: does NOT checkout / commit / push to base branch.
 * Records the archive commit on the feature branch and pushes to remote feature branch.
 * Post-merge cleanup (worktree teardown + branch delete) is handled separately by
 * runPostMergeCleanup, which runs only after a successful PR merge.
 *
 * Phase 0: pre-flight (job state load + finishable gate + terminal status check)
 * Phase 1: resolve recordDir → checkout feature branch (no-worktree only) →
 *          derive usage → archiveChangeFolder (mv/skip) →
 *          markJobArchived → draft deletion → git add → commitArchive →
 *          git push origin <feature-branch> → capture headSha
 */
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import { createTransportAuth } from "../../git/transport-auth.js";
import type { FinishFs } from "../finish/types.js";
import type { WorktreeManager } from "../worktree/manager.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { getJobSlug } from "../../state/job-slug.js";
import { TERMINAL_STATUSES } from "../../state/lifecycle.js";
import { assertJobFinishable, markJobArchived } from "../finish/job-state-update.js";
import { deriveAndWriteUsage } from "../finish/derive-usage.js";
import { archiveChangeFolder } from "../finish/archive-change-folder.js";
import { commitArchive } from "../finish/commit-archive.js";
import { buildWorktreePath } from "../worktree/manager.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import { formatEscalation } from "../finish/escalation.js";
import { logResult, stderrWrite } from "../../logger/stdout.js";
import { KeepAlive } from "../lifecycle/keepalive.js";
import { livenessJsonPath, draftsDir } from "../../util/paths.js";
import { runDesignLayerMarkHook } from "../design-layer/mark-hook.js";
import { emitDesignTopics } from "../design-layer/topic-emission.js";
import type { ResolvedDesignLayer } from "../../config/schema.js";
import type { JobState } from "../../state/schema.js";

export interface ArchiveInput {
  /** Slug of the job to archive. */
  slug: string;
  /** Main repo root (cwd). Must not be inside a worktree. */
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  /** Base branch name (default: "main"). Kept for interface compatibility; not used for push. */
  baseBranch?: string;
  /** Resolved GitHub token for authenticating git push/fetch operations. Optional. */
  githubToken?: string;
  /**
   * Resolved design-layer config for the mark-implemented hook.
   * When absent or disabled, the hook is a no-op.
   */
  designLayer?: ResolvedDesignLayer;
}

export type ArchiveResult =
  | { exitCode: 0; headSha?: string }
  | { exitCode: 1; escalation: string }
  | { exitCode: 2; message: string };

/**
 * Resolve worktree path for recording on the feature branch.
 * Falls back from state.worktreePath → liveness sidecar → buildWorktreePath convention.
 */
export async function resolveWorktreePathForArchive(
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

  // 3. Convention-derived path (best-effort)
  return buildWorktreePath(cwd, slug, state.jobId);
}

/**
 * Run the archive orchestration: record archive commit on feature branch.
 * Returns exit code to caller (CLI entry does process.exit()).
 *
 * This function does NOT perform worktree teardown or branch deletion.
 * Post-merge cleanup is handled by runPostMergeCleanup (called by --with-merge path).
 */
export async function runArchiveOrchestrator(
  input: ArchiveInput,
  stdoutWrite: (msg: string) => void = logResult,
): Promise<ArchiveResult> {
  const { slug, cwd, fs } = input;

  // Wrap spawn with transport auth for git push operations.
  // If githubToken is absent, auth args resolve to [] and spawn behaves as plain git.
  const transportAuth = createTransportAuth({ token: input.githubToken, cwd });
  const spawn = transportAuth.wrapSpawn(input.spawn);

  // ---------------------------------------------------------------------------
  // Phase 0: resolve job state + finishable gate
  // ---------------------------------------------------------------------------

  let jobId: string;
  let worktreePath: string | null;
  let branch: string | null;
  let noWorktree = false;
  let prNumber: number | undefined;
  let jobState: JobState;

  try {
    const allStates = await JobStateStore.list(cwd, { includeArchived: true });
    const matching = allStates.filter((s) => getJobSlug(s) === slug);

    if (matching.length === 0) {
      return { exitCode: 2, message: `No job found with slug '${slug}'. Run 'specrunner ps' to see available jobs.` };
    }

    // Use most recent state when multiple exist
    matching.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const state = matching[0]!;
    jobState = state;

    jobId = state.jobId;
    worktreePath = await resolveWorktreePathForArchive(state, cwd);
    branch = state.branch;
    noWorktree = state.noWorktree === true;
    prNumber = state.pullRequest?.number ?? undefined;

    // Terminal status → no-op (short-circuit before touching worktree)
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
    // Phase 1: determine recordDir → record archive commit on feature branch
    // -------------------------------------------------------------------------

    // Determine the recording directory (where git operations will run).
    // - Worktree mode: the worktree is already checked out to the feature branch.
    // - No-worktree mode: the main repo; we checkout the feature branch first.
    let recordDir: string;

    if (noWorktree) {
      // No-worktree mode: use main repo, ensure we're on the feature branch (not base)
      if (!branch) {
        return {
          exitCode: 1,
          escalation: formatEscalation({
            failedStep: "Phase 1 (branch resolution)",
            detectedState: `Feature branch not found in state for ${slug}.`,
            recommendedAction: `Check job state with 'specrunner ps', then re-run: specrunner job archive ${slug}`,
            resumeCommand: `specrunner job archive ${slug}`,
          }),
        };
      }
      recordDir = cwd;
      stdoutWrite(`Phase 1: checking out feature branch ${branch}...`);
      const checkoutResult = await spawn("git", ["checkout", branch], { cwd });
      if (checkoutResult.exitCode !== 0) {
        return {
          exitCode: 1,
          escalation: formatEscalation({
            failedStep: "Phase 1 (git checkout feature branch)",
            detectedState: `git checkout ${branch} failed (exit ${checkoutResult.exitCode}): ${checkoutResult.stderr.trim()}`,
            recommendedAction: `Resolve any local changes and ensure the feature branch exists, then re-run: specrunner job archive ${slug}`,
            resumeCommand: `specrunner job archive ${slug}`,
          }),
        };
      }
    } else {
      // Worktree mode: recordDir = worktree path (already on feature branch)
      if (!worktreePath) {
        return {
          exitCode: 1,
          escalation: formatEscalation({
            failedStep: "Phase 1 (worktree resolution)",
            detectedState: `Worktree not found for ${slug}. The worktree may have been removed while the job is not yet archived.`,
            recommendedAction: `Check worktree state with 'git worktree list'. If the worktree was removed, re-create it and re-run: specrunner job archive ${slug}`,
            resumeCommand: `specrunner job archive ${slug}`,
          }),
        };
      }
      recordDir = worktreePath;
    }

    stdoutWrite(`Phase 1: recording archive on feature branch${branch ? ` ${branch}` : ""}...`);

    // Derive pipeline usage into changes/<slug>/usage.json (before archive moves it)
    try {
      const usageResult = await deriveAndWriteUsage({
        jobId,
        slug,
        cwd: recordDir,
        repoRoot: recordDir,
        spawn,
        fs,
      });
      if (!usageResult.skipped) stdoutWrite(usageResult.message);
    } catch {
      stderrWrite(`Warning: failed to derive usage for ${slug}. Continuing archive.`);
    }

    // Archive change folder (git mv; skips if already moved)
    const archiveResult = await archiveChangeFolder({ slug, cwd: recordDir, spawn, fs });
    if (!archiveResult.ok) {
      return { exitCode: 1, escalation: archiveResult.escalation };
    }
    if (!archiveResult.skipped) stdoutWrite(archiveResult.message);

    // Mark job archived (D1/D2/D3): resolve slug canonical state dir and transition to archived
    try {
      await markJobArchived(slug, recordDir);
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

    // Delete draft folder for this slug (best-effort; archive continues even if this fails)
    try {
      await fs.rm(nodePath.join(recordDir, draftsDir(), slug), { recursive: true, force: true });
    } catch {
      stderrWrite(`Warning: failed to delete draft folder for ${slug}. Remove manually if needed.`);
    }

    // Stage the draft deletion only if the drafts directory exists in the worktree.
    // Skipping when absent avoids `fatal: pathspec 'specrunner/drafts' did not match any files`
    // warnings in repos that have never created a draft (T-05: symptom 4).
    const draftsAbsPath = nodePath.join(recordDir, draftsDir());
    const draftsPresent = await fs.exists(draftsAbsPath);
    if (draftsPresent) {
      const draftAddResult = await spawn("git", ["add", draftsDir()], { cwd: recordDir });
      if (draftAddResult.exitCode !== 0) {
        stderrWrite(`Warning: git add ${draftsDir()}/ failed: ${draftAddResult.stderr.trim()}. Continuing.`);
      }
    }

    // Stage mv + archived status change together so they land in one commit
    const addResult = await spawn("git", ["add", "specrunner/changes/"], { cwd: recordDir });
    if (addResult.exitCode !== 0) {
      stderrWrite(`Warning: git add specrunner/changes/ failed: ${addResult.stderr.trim()}. Continuing.`);
    }

    // Design-layer topic emission: emit design-level findings as topic files.
    // Runs before mark-hook; failures are best-effort (archive continues).
    const noopDesignLayer: ResolvedDesignLayer = { enabled: false, command: "aozu", requireCitationTypes: [], topicEmission: false };
    await emitDesignTopics({
      slug,
      state: jobState,
      designLayer: input.designLayer ?? noopDesignLayer,
      recordDir,
      spawn,
      fs: input.fs,
      stdoutWrite,
      stderrWrite,
    });

    // Design-layer exit hook: mark implemented in aozu and stage any state changes.
    // Runs after the scoped git add so aozu's writes are captured by the archive commit.
    const markResult = await runDesignLayerMarkHook({
      slug,
      prNumber,
      designLayer: input.designLayer ?? noopDesignLayer,
      cwd: recordDir,
      spawn,
    });
    if (markResult.status === "error") {
      return { exitCode: 1, escalation: markResult.escalation };
    }
    if (markResult.status === "unknown-slug") {
      stderrWrite(`Warning: design-layer mark implemented: slug '${slug}' is not managed by aozu. Skipping state transition.`);
    }

    // Commit staged changes
    const commitResult = await commitArchive({ slug, cwd: recordDir, spawn });
    if (!commitResult.ok) {
      return { exitCode: 1, escalation: commitResult.escalation };
    }
    if (!commitResult.skipped) stdoutWrite(commitResult.message);

    // Push archive commit to remote feature branch (not base)
    if (!branch) {
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "Phase 1 (git push feature branch)",
          detectedState: `Feature branch not found in state for ${slug}. Cannot push archive commit.`,
          recommendedAction: `Check job state with 'specrunner ps', then re-run: specrunner job archive ${slug}`,
          resumeCommand: `specrunner job archive ${slug}`,
        }),
      };
    }

    const pushResult = await spawn("git", ["push", "origin", branch], { cwd: recordDir });
    if (pushResult.exitCode !== 0) {
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "Phase 1 (git push origin <feature-branch>)",
          detectedState: `git push origin ${branch} failed (exit ${pushResult.exitCode}): ${pushResult.stderr.trim()}`,
          recommendedAction: `Check network/auth and re-run: specrunner job archive ${slug}`,
          resumeCommand: `specrunner job archive ${slug}`,
        }),
      };
    }
    stdoutWrite(`Pushed archive commit to origin/${branch}.`);

    // Capture HEAD SHA so the --with-merge path can wait for CI on the correct commit
    let headSha: string | undefined;
    const headShaResult = await spawn("git", ["rev-parse", "HEAD"], { cwd: recordDir });
    if (headShaResult.exitCode === 0) {
      headSha = headShaResult.stdout.trim() || undefined;
    }

    return { exitCode: 0, headSha };
  } finally {
    keepAlive.release();
  }
}

// Re-export WorktreeManager type for consumers that need it alongside this module
export type { WorktreeManager };
