/**
 * Plain archive path for `job archive <slug>` (without --with-merge).
 *
 * Behavior:
 * - Checks PR merge status (if GitHub client is available).
 *   - PR MERGED + archiveRecorded → completeAfterMerge (transition + cleanup) → done
 *   - PR MERGED + !archiveRecorded → escalation (order error)
 *   - PR OPEN/CLOSED/UNKNOWN or not checkable → fall through to record
 * - Records archive commit on feature branch (idempotent via orchestrator).
 * - After record:
 *   - prNumber present → stay in awaiting-archive; guidance printed for re-run post-merge
 *   - prNumber absent → markJobArchived immediately (no PR to wait for)
 *
 * Design invariants:
 * - Does NOT call getCheckStatus / mergePullRequest (CI non-observation).
 * - Does NOT call runPostMergeCleanup except via completeAfterMerge on MERGED detection.
 * - GitHubClient is optional — if absent, skip merge-state check and record directly.
 */
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "../finish/types.js";
import type { WorktreeManager } from "../worktree/manager.js";
import type { GitHubClient } from "../port/github-client.js";
import type { ResolvedDesignLayer } from "../../config/schema.js";
import { TERMINAL_STATUSES } from "../../state/lifecycle.js";
import { runArchiveOrchestrator } from "./orchestrator.js";
import type { ArchiveResult } from "./orchestrator.js";
import { resolveArchiveJobContext } from "./job-context.js";
import { completeAfterMerge, mergedBeforeRecordEscalation } from "./merge-completion.js";
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
  /**
   * Optional GitHub client for merge-state detection.
   * When absent (or when owner/repo are absent), the merge-state check is skipped
   * and archive recording proceeds directly. Token/client unavailability is not
   * an escalation — it is a best-effort check.
   */
  githubClient?: GitHubClient;
  /** GitHub repo owner. Required alongside githubClient for merge-state check. */
  owner?: string;
  /** GitHub repo name. Required alongside githubClient for merge-state check. */
  repo?: string;
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
  const {
    slug,
    cwd,
    spawn,
    fs,
    baseBranch,
    githubToken,
    designLayer,
    githubClient,
    owner,
    repo,
    worktreeManagerFn,
  } = input;
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
  // Step 3: Merge-state detection (only when GitHub client + PR context available).
  // ---------------------------------------------------------------------------
  if (githubClient && owner && repo && prNumber !== undefined) {
    let prData: { state: string };
    try {
      prData = await githubClient.getPullRequest(owner, repo, prNumber);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      stderrWrite(
        `Warning: could not check PR #${prNumber} merge state (${detail}). ` +
        `Terminal transition will not be performed until merge is confirmed. Proceeding with archive record.`,
      );
      // Fall through to recording (best-effort: merge state unknown → treat as not merged)
      prData = { state: "UNKNOWN" };
    }

    if (prData.state === "MERGED") {
      if (archiveRecorded) {
        // Out-of-band merge detected after archive record → complete transition + cleanup.
        stdoutWrite(
          `PR #${prNumber} is already merged and archive record exists. Running post-merge cleanup...`,
        );
        await completeAfterMerge(
          {
            slug,
            recordDir,
            cwd,
            branch,
            worktreePath,
            noWorktree,
            baseBranch: resolvedBaseBranch,
            spawn,
            fs,
            worktreeManagerFn,
          },
          stdoutWrite,
        );
        return { exitCode: 0 };
      }
      // PR merged before archive was recorded → order error escalation.
      return mergedBeforeRecordEscalation({
        slug,
        prNumber,
        baseBranch: resolvedBaseBranch,
        resumeCommand: `specrunner job archive ${slug}`,
      });
    }
    // OPEN / CLOSED / UNKNOWN → fall through to record.
  }

  // ---------------------------------------------------------------------------
  // Step 4: Record archive commit on feature branch (idempotent).
  // ---------------------------------------------------------------------------
  const archiveResult = await runArchiveOrchestrator(
    {
      slug,
      cwd,
      spawn,
      fs,
      baseBranch: resolvedBaseBranch,
      githubToken,
      designLayer,
      deferArchivedTransition: true,
    },
    stdoutWrite,
  );

  if (archiveResult.exitCode !== 0) {
    return archiveResult;
  }

  const headSha = (archiveResult as { exitCode: 0; headSha?: string }).headSha;

  // ---------------------------------------------------------------------------
  // Step 5: Post-record handling.
  // ---------------------------------------------------------------------------
  if (prNumber !== undefined) {
    // PR present but not yet merged → stay in awaiting-archive, print guidance.
    stdoutWrite(
      `Archive record pushed to feature branch. ` +
      `Job '${slug}' remains in awaiting-archive until PR #${prNumber} is merged. ` +
      `After the PR is merged, re-run: specrunner job archive ${slug}`,
    );
    return { exitCode: 0, headSha };
  }

  // No PR → terminal transition immediately (no merge boundary to wait for).
  try {
    await markJobArchived(slug, recordDir);
    stdoutWrite(
      `Job ${slug} marked as archived. (No PR — terminal transition applied at record time.)`,
    );
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

  return { exitCode: 0, headSha };
}
