/**
 * Archive orchestrator — records archive commit on feature branch.
 *
 * Design invariant: does NOT import GitHubClient — no GitHub API calls.
 * Design invariant: does NOT checkout / commit / push to base branch.
 * Records the archive commit on the feature branch and pushes to remote feature branch.
 * Post-merge cleanup (worktree teardown + branch delete) is handled separately by
 * runArchiveCleanup, which is called by plain-archive and --with-merge after transitioning to archived.
 *
 * Phase 0: pre-flight (job state load + finishable gate + terminal status check)
 * Phase 1: resolve recordDir → checkout feature branch (no-worktree only) →
 *          derive usage → archiveChangeFolder (mv/skip) →
 *          draft deletion → git add → commitArchive →
 *          git push origin <feature-branch> → capture headSha
 *          (status transition is NOT performed here — the caller owns it: plain archive
 *          calls markJobArchived directly after a successful push, independent of PR state)
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
import { assertJobFinishable } from "../finish/job-state-update.js";
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
  /**
   * @deprecated Deferral is now unconditional — this input is ignored.
   * `runArchiveOrchestrator` never calls `markJobArchived` regardless of this flag.
   * Retained only for interface compatibility with existing `--with-merge` callers.
   */
  deferArchivedTransition?: boolean;
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
 * Cleanup (worktree teardown + branch delete) is handled by runArchiveCleanup (called by plain-archive or --with-merge).
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

    // Archive change folder (git mv; skips if already moved)
    const archiveResult = await archiveChangeFolder({ slug, cwd: recordDir, spawn, fs });
    if (!archiveResult.ok) {
      return { exitCode: 1, escalation: archiveResult.escalation };
    }
    const mvSkipped = archiveResult.skipped;
    if (!mvSkipped) stdoutWrite(archiveResult.message);

    // Status transition (awaiting-archive → archived) is NOT performed here.
    // It is the caller's responsibility to call markJobArchived after a successful push,
    // via runPlainArchive (plain archive) or completeAfterMerge (--with-merge).

    // Delete draft from repo root (cwd) for this slug — best-effort, archive continues on failure.
    // Handles both flat format (drafts/<slug>.md) and directory format (drafts/<slug>/).
    // Uses cwd (repo root) because untracked drafts only exist in the main working tree, not worktrees.
    for (const [relPath, absPath] of [
      [nodePath.join(draftsDir(), slug + ".md"), nodePath.join(cwd, draftsDir(), slug + ".md")],
      [nodePath.join(draftsDir(), slug),          nodePath.join(cwd, draftsDir(), slug)],
    ] as [string, string][]) {
      if (!(await fs.exists(absPath))) continue;
      const lsResult = await spawn("git", ["ls-files", "--", relPath], { cwd });
      if (lsResult.stdout.trim()) {
        stderrWrite(`Warning: draft '${relPath}' is tracked by git; delete manually with 'git rm ${relPath}' and commit.`);
        continue;
      }
      try {
        await fs.rm(absPath, { recursive: true, force: true });
      } catch (err: unknown) {
        const code = (err as { code?: string }).code;
        stderrWrite(`Warning: failed to delete draft '${relPath}'${code ? ` (${code})` : ""}. Remove manually if needed.`);
      }
    }

    // Pathspecs staged for the archive commit. commitArchive limits both its staging
    // detection and the commit itself to this list — the archive commit is merged into
    // the base branch and must never sweep in unrelated pre-staged index entries.
    const archivePathspecs: string[] = [];

    // Stage mv + archived status change together so they land in one commit
    const addResult = await spawn("git", ["add", "specrunner/changes/"], { cwd: recordDir });
    if (addResult.exitCode !== 0) {
      stderrWrite(`Warning: git add specrunner/changes/ failed: ${addResult.stderr.trim()}. Continuing.`);
    } else {
      archivePathspecs.push("specrunner/changes/");
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
    if (markResult.status === "marked") {
      // mark-hook staged aozu's writes via `git add -A -- design` (its success implies
      // the pathspec matched, so the commit pathspec below cannot fail on it).
      archivePathspecs.push("design");
    }

    // Commit staged changes (pathspec-limited to what was staged above)
    const commitResult = await commitArchive({ slug, cwd: recordDir, spawn, pathspecs: archivePathspecs });
    if (!commitResult.ok) {
      return { exitCode: 1, escalation: commitResult.escalation };
    }
    const commitSkipped = commitResult.skipped;
    if (!commitSkipped) stdoutWrite(commitResult.message);

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

    // Idempotent push guard: when both mv and commit were skipped (no new content was
    // recorded), the local HEAD may already match the remote. Check whether the remote
    // branch exists before attempting the push.
    // - Remote branch absent  → skip push (warning only, exit 0)
    // - Remote branch present → push; if push fails → warning only (exit 0, not escalation)
    // - New content recorded  → push; if push fails → escalation (exit 1) as before
    // - ls-remote failure     → fail-open: proceed with push attempt
    const recordedSomething = !mvSkipped || !commitSkipped;

    if (!recordedSomething) {
      const lsRemoteResult = await spawn(
        "git",
        ["ls-remote", "--heads", "origin", branch],
        { cwd: recordDir },
      );
      if (lsRemoteResult.exitCode === 0 && lsRemoteResult.stdout.trim() === "") {
        // Remote branch does not exist — nothing to push
        stderrWrite(`Warning: archive already recorded but remote branch '${branch}' no longer exists. Skipping push.`);
        const headShaResult2 = await spawn("git", ["rev-parse", "HEAD"], { cwd: recordDir });
        return { exitCode: 0, headSha: headShaResult2.exitCode === 0 ? (headShaResult2.stdout.trim() || undefined) : undefined };
      }

      // Remote branch exists (or ls-remote failed — fail-open) → try push, but treat
      // failure as a warning rather than an escalation (idempotent re-run scenario).
      const idempotentPushResult = await spawn("git", ["push", "origin", branch], { cwd: recordDir });
      if (idempotentPushResult.exitCode !== 0) {
        stderrWrite(`Warning: git push origin ${branch} failed (exit ${idempotentPushResult.exitCode}): ${idempotentPushResult.stderr.trim()}. Archive commit was already recorded; continuing.`);
      } else {
        stdoutWrite(`Pushed archive commit to origin/${branch}.`);
      }
    } else {
      // New content was recorded — push failure is a hard error
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
    }

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
