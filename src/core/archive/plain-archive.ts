/**
 * Plain archive path for `job archive <slug>` (without --with-merge).
 *
 * Single-phase operation — completes in one run:
 *   record (mv + commit + push) → archived transition → cleanup
 *
 * Two execution paths:
 *   Path A (normal): archiveChangeFolder is not yet done, OR working tree is usable.
 *     runArchiveOrchestrator → markJobArchived → runArchiveCleanup(deleteRemoteBranch:false) → exit 0
 *
 *   Path B (degraded): archiveRecorded=true AND working tree is unusable.
 *     (Leftover 2-phase job whose worktree or local branch is gone.)
 *     Best-effort markJobArchived → runArchiveCleanup(deleteRemoteBranch:false) → exit 0
 *
 * Design invariants:
 * - Does NOT query GitHub PR state. No GitHub API client used.
 * - deleteRemoteBranch is always false — remote branch preserved for the still-open PR.
 * - markJobArchived is called BEFORE runArchiveCleanup (worktree may contain state.json).
 * - Push is skipped only when the remote feature branch no longer exists (already
 *   merged + deleted leftover). Any push failure while the remote branch exists (or
 *   ls-remote fails) → escalation (exit 1), no transition, no cleanup — the record
 *   commit may exist only locally and must reach the remote before archived.
 * - Transition failure → escalation (exit 1), no cleanup.
 */
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "../finish/types.js";
import type { WorktreeManager } from "../worktree/manager.js";
import type { ResolvedDesignLayer } from "../../config/schema.js";
import { TERMINAL_STATUSES } from "../../state/lifecycle.js";
import { runArchiveOrchestrator } from "./orchestrator.js";
import type { ArchiveResult } from "./orchestrator.js";
import { resolveArchiveJobContext } from "./job-context.js";
import { runArchiveCleanup } from "./cleanup.js";
import { markJobArchived } from "../finish/job-state-update.js";
import { formatEscalation } from "../finish/escalation.js";
import { stderrWrite, logResult } from "../../logger/stdout.js";

export interface PlainArchiveInput {
  /** Slug of the job to archive. */
  slug: string;
  /** Main repo root (cwd). */
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  /** Base branch name (default: "main"). */
  baseBranch?: string;
  /** Resolved GitHub token for authenticating git push operations. Optional. */
  githubToken?: string;
  /** Resolved design-layer config for the mark-implemented hook. */
  designLayer?: ResolvedDesignLayer;
  /** Injectable WorktreeManager for testing. */
  worktreeManagerFn?: () => WorktreeManager;
}

/**
 * Run plain (non-merge) archive for `job archive <slug>`.
 * Returns ArchiveResult; caller does process.exit().
 */
export async function runPlainArchive(
  input: PlainArchiveInput,
  stdoutWrite: (msg: string) => void = logResult,
): Promise<ArchiveResult> {
  const { slug, cwd, spawn, fs, baseBranch, githubToken, designLayer, worktreeManagerFn } = input;
  const resolvedBaseBranch = baseBranch ?? "main";

  // ---------------------------------------------------------------------------
  // Step 1: Resolve job context.
  // ---------------------------------------------------------------------------
  let ctx: Awaited<ReturnType<typeof resolveArchiveJobContext>>;
  try {
    ctx = await resolveArchiveJobContext({ cwd, slug });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 2, message };
  }

  if (!ctx.found) {
    return { exitCode: 2, message: ctx.message };
  }

  const { state, prNumber, branch, worktreePath, noWorktree, archiveRecorded, recordDir } = ctx;

  // ---------------------------------------------------------------------------
  // Step 2: Terminal status → no-op (short-circuit).
  // ---------------------------------------------------------------------------
  if (TERMINAL_STATUSES.has(state.status)) {
    stdoutWrite(`Already finished (${state.status}).`);
    return { exitCode: 0 };
  }

  // ---------------------------------------------------------------------------
  // Step 3: Detect Path B — archiveRecorded=true AND working tree unusable.
  //
  // Path B: skip the orchestrator; best-effort markJobArchived + cleanup.
  // Applies when:
  //   - worktree mode (noWorktree=false) AND worktree dir is absent from disk
  //   - no-worktree mode (noWorktree=true) AND local feature branch does not exist
  // ---------------------------------------------------------------------------
  let isPathB = false;

  if (archiveRecorded) {
    if (noWorktree) {
      // No-worktree mode: check if the local feature branch exists
      if (branch) {
        const verifyResult = await spawn(
          "git",
          ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`],
          { cwd },
        );
        if (verifyResult.exitCode !== 0) {
          isPathB = true;
        }
      } else {
        // No branch info at all → recording impossible
        isPathB = true;
      }
    } else {
      // Worktree mode: check if the worktree directory exists on disk
      if (!worktreePath || !(await fs.exists(worktreePath))) {
        isPathB = true;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Step 4: Execute the chosen path.
  // ---------------------------------------------------------------------------

  if (isPathB) {
    // -------------------------------------------------------------------------
    // Path B: best-effort transition + cleanup (no archive recording)
    //
    // assertJobFinishable is intentionally omitted here.
    // Design D5 Path B semantics: the archive record already exists on the remote
    // branch; the only remaining work is to transition the job state and clean up.
    // This path is best-effort by design — if markJobArchived throws (e.g. because
    // the internal transitionJob validation rejects the transition), the error is
    // caught and surfaced as a warning so that cleanup can still proceed.
    // Calling assertJobFinishable before markJobArchived would introduce an
    // unnecessary hard failure for a path whose contract is "warn on error,
    // always run cleanup".
    // -------------------------------------------------------------------------
    stdoutWrite(`Archive record already exists; working tree unavailable. Running best-effort transition...`);

    // Best-effort transition — failure is a warning, not an escalation
    try {
      await markJobArchived(slug, cwd);
      stdoutWrite(`Job '${slug}' transitioned to archived.`);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      stderrWrite(
        `Warning: could not transition job '${slug}' to archived: ${detail}. ` +
        `The job may still show as awaiting-archive. Run 'specrunner ps' to verify.`,
      );
    }

    // Cleanup — runs regardless of transition outcome (best-effort overall)
    await runArchiveCleanup(
      {
        slug,
        cwd,
        branch,
        worktreePath,
        noWorktree,
        baseBranch: resolvedBaseBranch,
        spawn,
        fs,
        worktreeManagerFn,
        deleteRemoteBranch: false,
      },
      stdoutWrite,
    );

    return { exitCode: 0 };
  }

  // ---------------------------------------------------------------------------
  // Path A: record → transition → cleanup
  // ---------------------------------------------------------------------------

  // Step 4A: Record archive commit on feature branch (idempotent via orchestrator)
  const archiveResult = await runArchiveOrchestrator(
    {
      slug,
      cwd,
      spawn,
      fs,
      baseBranch: resolvedBaseBranch,
      githubToken,
      designLayer,
    },
    stdoutWrite,
  );

  if (archiveResult.exitCode !== 0) {
    // Push / mv / commit failure → escalation, no transition, no cleanup
    return archiveResult;
  }

  const headSha = (archiveResult as { exitCode: 0; headSha?: string }).headSha;

  // Step 5A: Transition job to archived (must happen BEFORE cleanup — TC-039)
  try {
    await markJobArchived(slug, recordDir);
    stdoutWrite(`Job '${slug}' transitioned to archived.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      escalation: formatEscalation({
        failedStep: "plain archive (markJobArchived)",
        detectedState: message,
        recommendedAction: `Re-run: specrunner job archive ${slug}`,
        resumeCommand: `specrunner job archive ${slug}`,
      }),
    };
  }

  // Step 6A: Cleanup — remote branch preserved (PR still open)
  await runArchiveCleanup(
    {
      slug,
      cwd,
      branch,
      worktreePath,
      noWorktree,
      baseBranch: resolvedBaseBranch,
      spawn,
      fs,
      worktreeManagerFn,
      deleteRemoteBranch: false,
    },
    stdoutWrite,
  );

  // Step 7A: Advisory — tell operator to merge the PR on GitHub
  if (prNumber !== undefined) {
    stdoutWrite(
      `Archive complete. Next: merge PR #${prNumber} on GitHub. ` +
      `Note: if the PR is already merged or closed, the archive commit will not reach the base branch automatically.`,
    );
  }

  return { exitCode: 0, headSha };
}
