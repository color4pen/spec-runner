/**
 * Merge-then-archive orchestrator for `job archive --with-merge`.
 *
 * Flow:
 * 1. Load job state → resolve PR number + branch/worktree info
 * 2. Run archive recording on feature branch (runArchiveOrchestrator — idempotent)
 *    → capture archiveSha for CI-wait headSha tracking
 * 3. getPullRequest to check PR status
 *    - Already MERGED → skip CI wait / merge; run cleanup → done
 * 4. Protected-paths guard (checked before CI wait)
 * 5. Wait loop: poll check status until terminal (success/failure) or timeout
 *    - Wait for PR headSha to match archiveSha before trusting CI rollup
 *    - DIRTY / CONFLICTING → conflict escalation (no merge, no cleanup)
 *    - BLOCKED + pending checks → keep waiting (transient; CI not yet resolved)
 *    - BLOCKED + success checks → grace wait (BLOCKED_CHECK_GRACE_MS); if exhausted → branch-protection escalation
 *    - check failure → escalation (no merge, no cleanup)
 *    - check success → proceed to merge (if not still BLOCKED)
 *    - check none → grace wait (NONE_CHECK_GRACE_MS); if exhausted → proceed to merge (if not still BLOCKED)
 *    - check pending → wait (sleepFn), check deadline, repeat
 *    - timeout → escalation (no merge, no cleanup)
 * 6. squash merge via mergePullRequest (final mergeability decided by merge endpoint)
 * 7. merge success → runPostMergeCleanup → done
 */
import * as nodePath from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { FinishFs } from "../finish/types.js";
import type { GitHubClient } from "../port/github-client.js";
import type { WorktreeManager } from "../worktree/manager.js";
import type { ResolvedDesignLayer, ShellCommand, MinimumAssuranceConfig } from "../../config/schema.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { getJobSlug } from "../../state/job-slug.js";
import { getProfile, satisfiesFloor } from "../../state/profile.js";
import type { ProfileAssurance } from "../../state/schema.js";
import { runArchiveOrchestrator, resolveWorktreePathForArchive } from "./orchestrator.js";
import type { ArchiveResult } from "./orchestrator.js";
import { runPostMergeCleanup } from "./post-merge-cleanup.js";
import { runPostMergeIntegrityCheck } from "./post-merge-integrity.js";
import { formatEscalation } from "../finish/escalation.js";
import { logResult, stderrWrite } from "../../logger/stdout.js";
import { DEFAULT_MERGE_WAIT_TIMEOUT_MS, DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS } from "../../config/schema.js";
import { evaluateProtectedPaths } from "./protected-paths.js";
import { markJobArchived } from "../finish/job-state-update.js";

/**
 * Grace period (ms) to wait for the first check run to appear after a push.
 * If the rollup stays "none" longer than this, the repo is assumed to have no CI
 * and the merge proceeds. Independent of mergeWaitTimeoutMs and always bounded
 * (prevents permanent hang even when mergeWaitTimeoutMs is null). Not configurable.
 */
const NONE_CHECK_GRACE_MS = 60_000;

/**
 * Grace period (ms) to allow mergeStateStatus to transition from BLOCKED to CLEAN
 * after checks succeed. GitHub's mergeStateStatus sometimes lags behind check
 * resolution by a few seconds. Not configurable.
 */
const BLOCKED_CHECK_GRACE_MS = 30_000;

export interface MergeThenArchiveInput {
  /** Slug of the job to archive. */
  slug: string;
  /** Main repo root (cwd). */
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
  githubClient: GitHubClient;
  owner: string;
  repo: string;
  /** Resolved GitHub token for authenticating git push operations. Optional. */
  githubToken?: string;
  /** Base branch name (default: "main"). */
  baseBranch?: string;
  /** Injectable sleep for testing. */
  sleepFn?: (ms: number) => Promise<void>;
  /** Injectable WorktreeManager for testing. */
  worktreeManagerFn?: () => WorktreeManager;
  /**
   * Maximum wait time in milliseconds for checks to resolve.
   * null = wait indefinitely.
   * undefined = use DEFAULT_MERGE_WAIT_TIMEOUT_MS.
   */
  waitTimeoutMs?: number | null;
  /** Poll interval in milliseconds between check-status calls. Default: DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS. */
  pollIntervalMs?: number;
  /** Injectable clock for testing. Default: Date.now. */
  nowFn?: () => number;
  /**
   * Glob patterns for files that block auto-merge (from archive.protectedPaths config).
   * When non-empty, the PR's changed files are fetched and evaluated before merging.
   * Empty or absent → guard skipped entirely (no listPullRequestFiles call).
   */
  protectedPaths?: string[];
  /**
   * Resolved design-layer config for the mark-implemented hook.
   * When absent or disabled, the hook is a no-op.
   */
  designLayer?: ResolvedDesignLayer;
  /**
   * Commands to run on the merged base branch after a successful squash merge.
   * When non-empty, an ephemeral worktree is created at the merge SHA and each
   * command is executed fail-fast.  A non-zero exit produces an escalation and
   * skips post-merge cleanup.
   * Absent or empty = no integrity check (backward compatible).
   */
  postMergeVerify?: ShellCommand[];
  /**
   * Minimum assurance floor for auto-merge of changes to protected paths.
   * When set and non-empty protectedPaths, the job's effective profile assurance
   * is evaluated against the floor for matched files. Absent = no floor gate.
   */
  minimumAssurance?: MinimumAssuranceConfig;
}

export type MergeThenArchiveResult = ArchiveResult;

/**
 * Run merge-then-archive for `job archive --with-merge`.
 * Records archive on feature branch first, then waits for CI green and merges PR,
 * then runs post-merge cleanup.
 */
export async function runMergeThenArchive(
  input: MergeThenArchiveInput,
  stdoutWrite: (msg: string) => void = logResult,
): Promise<MergeThenArchiveResult> {
  const {
    slug,
    cwd,
    spawn,
    fs,
    githubClient,
    owner,
    repo,
    githubToken,
    baseBranch,
    sleepFn = defaultSleep,
    worktreeManagerFn,
    waitTimeoutMs,
    pollIntervalMs = DEFAULT_MERGE_WAIT_POLL_INTERVAL_MS,
    nowFn = Date.now,
    protectedPaths,
    designLayer,
    postMergeVerify,
    minimumAssurance,
  } = input;

  // Resolve effective timeout: undefined → default, null → unlimited, number → as-is
  const effectiveTimeoutMs = waitTimeoutMs === undefined ? DEFAULT_MERGE_WAIT_TIMEOUT_MS : waitTimeoutMs;
  const resolvedBaseBranch = baseBranch ?? "main";

  // ---------------------------------------------------------------------------
  // Step 1: Load job state → resolve PR number + branch/worktree info
  // ---------------------------------------------------------------------------
  let prNumber: number;
  let branch: string | null;
  let worktreePath: string | null;
  let noWorktree = false;
  /** True when the change folder has been moved to archive/ (on any checkout or worktree). */
  let archiveRecorded = false;
  /** Working tree where the archive-record commit was (or will be) made. */
  let recordDir: string;
  /** Effective assurance of the job's profile, captured for Step 3.6 floor check. */
  let jobAssurance: ProfileAssurance;

  try {
    const allEntries = await JobStateStore.listWithSourceDirs(cwd, { includeArchived: true });
    const matching = allEntries.filter((e) => getJobSlug(e.state) === slug);

    if (matching.length === 0) {
      return { exitCode: 2, message: `No job found with slug '${slug}'. Run 'specrunner ps' to see available jobs.` };
    }

    matching.sort((a, b) => new Date(b.state.updatedAt).getTime() - new Date(a.state.updatedAt).getTime());
    const { state, sourceChangeDir } = matching[0]!;

    if (!state.pullRequest?.number) {
      return {
        exitCode: 2,
        message: `Job ${state.jobId} is missing PR number. Was the pr-create step completed?`,
      };
    }

    prNumber = state.pullRequest.number;
    branch = state.branch;
    worktreePath = await resolveWorktreePathForArchive(state, cwd);
    noWorktree = state.noWorktree === true;

    // D2: "archive recorded" signal — change folder is in archive/ if dirname basename === "archive".
    // e.g. ".../specrunner/changes/archive/2026-01-01-slug" → dirname "archive"
    // e.g. ".../specrunner/changes/slug" → dirname "changes"
    archiveRecorded = nodePath.basename(nodePath.dirname(sourceChangeDir)) === "archive";

    // D3: recordDir — the working tree where the archive-record commit was/will be made.
    recordDir = noWorktree ? cwd : (worktreePath ?? cwd);

    // Capture effective assurance for the minimumAssurance floor check (Step 3.6).
    jobAssurance = getProfile(state).assurance;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { exitCode: 2, message };
  }

  // ---------------------------------------------------------------------------
  // Step 2: Initial PR status check (BEFORE recording).
  // When --with-merge is set, the merge state must be confirmed first. The
  // handling of an already-merged PR depends on whether the archive was recorded:
  //   - archiveRecorded (change folder in archive/ dir): archive rode the PR before
  //     it merged; this is a resume (e.g. crash after merge, before cleanup) →
  //     transition status to archived + run post-merge cleanup.
  //   - !archiveRecorded (change folder still at active location): the PR was merged
  //     BEFORE the archive was recorded, so the change folder is stuck at its active
  //     location on the base branch and cannot be relocated without a direct base
  //     commit → escalate (order error).
  // ---------------------------------------------------------------------------
  let prData: { state: string; mergeStateStatus?: string; mergeable?: string; headSha?: string };
  try {
    prData = await githubClient.getPullRequest(owner, repo, prNumber);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      escalation: formatEscalation({
        failedStep: "PR status check (getPullRequest)",
        detectedState: `getPullRequest #${prNumber} failed: ${detail}`,
        recommendedAction: `Check GitHub token: specrunner login. Then re-run: specrunner job archive --with-merge ${slug}`,
        resumeCommand: `specrunner job archive --with-merge ${slug}`,
      }),
    };
  }

  if (prData.state === "MERGED") {
    if (archiveRecorded) {
      // Archive was recorded before the merge → finish the (interrupted) cleanup.
      stdoutWrite(`PR #${prNumber} already merged and archive recorded. Running post-merge cleanup...`);
      await performPostMergeTransition(slug, recordDir, stdoutWrite);
      await runPostMergeCleanup(
        { slug, cwd, branch, worktreePath, noWorktree, baseBranch: resolvedBaseBranch, spawn, fs, worktreeManagerFn },
        stdoutWrite,
      );
      return { exitCode: 0 };
    }
    // Merged before archiving: the change folder cannot ride the (already merged) PR.
    return {
      exitCode: 1,
      escalation: formatEscalation({
        failedStep: "merge gate (PR merged before archive)",
        detectedState:
          `PR #${prNumber} is already merged but the archive was not recorded first ` +
          `(change folder is still at active location). The archive folder move rides the PR, ` +
          `so archiving must happen before the PR is merged.`,
        recommendedAction: `Archive before merging. The change folder for '${slug}' remains at its active location on ${resolvedBaseBranch} and can only be relocated by a direct ${resolvedBaseBranch} commit (which job archive does not perform).`,
        resumeCommand: `specrunner job archive --with-merge ${slug}`,
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // Step 3: Record archive on feature branch (idempotent) — only when not merged.
  // ---------------------------------------------------------------------------
  stdoutWrite(`Recording archive on feature branch...`);

  const archiveRecordResult = await runArchiveOrchestrator(
    { slug, cwd, spawn, fs, baseBranch: resolvedBaseBranch, githubToken, designLayer, deferArchivedTransition: true },
    stdoutWrite,
  );

  if (archiveRecordResult.exitCode !== 0) {
    return archiveRecordResult;
  }

  // Capture the archive commit SHA for CI-wait headSha matching
  const archiveSha = archiveRecordResult.headSha;

  // ---------------------------------------------------------------------------
  // Step 3.5: Protected-path merge guard
  // ---------------------------------------------------------------------------
  if (protectedPaths && protectedPaths.length > 0) {
    let filesResult: { files: string[]; truncated: boolean };
    try {
      filesResult = await githubClient.listPullRequestFiles(owner, repo, prNumber);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "merge gate (protected paths — file list fetch)",
          detectedState: `listPullRequestFiles #${prNumber} failed: ${detail}`,
          recommendedAction: `Check GitHub token: specrunner login. Then re-run: specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    const decision = evaluateProtectedPaths({
      changedFiles: filesResult.files,
      truncated: filesResult.truncated,
      patterns: protectedPaths,
    });

    if (decision.blocked) {
      if (decision.reason === "truncated") {
        return {
          exitCode: 1,
          escalation: formatEscalation({
            failedStep: "merge gate (protected paths — file list truncated)",
            detectedState:
              `The PR's changed file list exceeded the GitHub API cap (3000 files) and was truncated. ` +
              `Protected-path matching cannot be performed reliably on an incomplete list.`,
            recommendedAction:
              `Review the PR manually to ensure no protected paths are modified, then merge by hand:\n` +
              `  1. Open the PR on GitHub and review all changed files.\n` +
              `  2. If the changes are safe, squash-merge the PR on GitHub.\n` +
              `  3. Run: specrunner job archive --with-merge ${slug}`,
            resumeCommand: `specrunner job archive --with-merge ${slug}`,
          }),
        };
      }

      // reason === "match"
      const matchedList = decision.matched.map((f) => `  - ${f}`).join("\n");
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "merge gate (protected paths)",
          detectedState:
            `The following changed files match a protected path and require human review before merging:\n${matchedList}`,
          recommendedAction:
            `Review the PR manually and merge by hand:\n` +
            `  1. Open the PR on GitHub and review the flagged files.\n` +
            `  2. If the changes are safe, squash-merge the PR on GitHub.\n` +
            `  3. Run: specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Step 3.6: minimumAssurance floor gate (out-of-loop, fail-closed)
  // ---------------------------------------------------------------------------
  if (minimumAssurance && minimumAssurance.protectedPaths.length > 0) {
    let floorFilesResult: { files: string[]; truncated: boolean };
    try {
      floorFilesResult = await githubClient.listPullRequestFiles(owner, repo, prNumber);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "merge gate (minimumAssurance floor — file list fetch)",
          detectedState: `listPullRequestFiles #${prNumber} failed: ${detail}`,
          recommendedAction: `Check GitHub token: specrunner login. Then re-run: specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    const floorDecision = evaluateProtectedPaths({
      changedFiles: floorFilesResult.files,
      truncated: floorFilesResult.truncated,
      patterns: minimumAssurance.protectedPaths,
    });

    if (floorDecision.blocked) {
      if (floorDecision.reason === "truncated") {
        return {
          exitCode: 1,
          escalation: formatEscalation({
            failedStep: "merge gate (minimumAssurance floor — file list truncated)",
            detectedState:
              `The PR's changed file list exceeded the GitHub API cap (3000 files) and was truncated. ` +
              `minimumAssurance floor matching cannot be performed reliably on an incomplete list.`,
            recommendedAction:
              `Review the PR manually to ensure the assurance floor is met, then merge by hand:\n` +
              `  1. Open the PR on GitHub and review all changed files.\n` +
              `  2. If the changes satisfy the assurance floor, squash-merge the PR on GitHub.\n` +
              `  3. Run: specrunner job archive --with-merge ${slug}`,
            resumeCommand: `specrunner job archive --with-merge ${slug}`,
          }),
        };
      }

      // reason === "match" — evaluate assurance floor
      const { protectedPaths: _pp, ...floor } = minimumAssurance;
      if (!satisfiesFloor(jobAssurance, floor)) {
        const matchedList = floorDecision.matched.map((f) => `  - ${f}`).join("\n");
        const effectiveAssuranceStr = JSON.stringify(jobAssurance);
        const floorStr = JSON.stringify(floor);
        return {
          exitCode: 1,
          escalation: formatEscalation({
            failedStep: "merge gate (minimumAssurance floor)",
            detectedState:
              `The following changed files match a minimumAssurance protected path, ` +
              `but the job's effective assurance does not meet the required floor.\n` +
              `Matched files:\n${matchedList}\n` +
              `Effective assurance: ${effectiveAssuranceStr}\n` +
              `Required floor: ${floorStr}`,
            recommendedAction:
              `The job's assurance does not satisfy the configured minimumAssurance floor. ` +
              `Manual review is required:\n` +
              `  1. Open the PR on GitHub and review the flagged files.\n` +
              `  2. Ensure assurance requirements are satisfied (see floor: ${floorStr}).\n` +
              `  3. If satisfied after manual review, squash-merge the PR on GitHub.\n` +
              `  4. Run: specrunner job archive --with-merge ${slug}`,
            resumeCommand: `specrunner job archive --with-merge ${slug}`,
          }),
        };
      }
      // Floor satisfied — proceed to CI wait
    }
  }

  // ---------------------------------------------------------------------------
  // Step 4: Wait loop — poll check status until terminal or timeout
  // ---------------------------------------------------------------------------
  const start = nowFn();
  /** Set-once timestamp (ms) of the first "none" observation. Never reset. */
  let noneGraceStart: number | null = null;
  /** Set-once timestamp (ms) of the first "success+BLOCKED" observation. Never reset. */
  let blockedGraceStart: number | null = null;

  stdoutWrite(`Waiting for PR #${prNumber} checks to resolve...`);

  while (true) {
    // Re-fetch PR to get current state and headSha
    try {
      prData = await githubClient.getPullRequest(owner, repo, prNumber);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "PR status check (getPullRequest)",
          detectedState: `getPullRequest #${prNumber} failed: ${detail}`,
          recommendedAction: `Check GitHub token: specrunner login. Then re-run: specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    // Already merged (e.g. merged by another process during wait)
    if (prData.state === "MERGED") {
      stdoutWrite(`PR #${prNumber} merged during wait. Running post-merge cleanup...`);
      await performPostMergeTransition(slug, recordDir, stdoutWrite);
      await runPostMergeCleanup(
        { slug, cwd, branch, worktreePath, noWorktree, baseBranch: resolvedBaseBranch, spawn, fs, worktreeManagerFn },
        stdoutWrite,
      );
      return { exitCode: 0 };
    }

    // Conflict check
    const mergeStateStatus = (prData.mergeStateStatus ?? "").toUpperCase();
    if (mergeStateStatus === "DIRTY" || prData.mergeable === "CONFLICTING") {
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "merge gate (conflict)",
          detectedState: "PR has merge conflicts (mergeStateStatus DIRTY or mergeable CONFLICTING)",
          recommendedAction: `Rebase the feature branch onto ${resolvedBaseBranch} and re-run:\n  git rebase ${resolvedBaseBranch}\n  git push --force-with-lease\n  specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    // BLOCKED is tracked but not immediately escalated — it may be transient (CI not yet resolved).
    // Final branch-protection escalation is deferred to the check-result evaluation below.
    const isBlocked = mergeStateStatus === "BLOCKED";

    // headSha required for check status
    const headSha = prData.headSha;
    if (!headSha) {
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "check status (getCheckStatus)",
          detectedState: "unexpected: PR head SHA missing",
          recommendedAction: `Re-run: specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    // Wait until the PR's headSha reflects the archive commit before trusting CI rollup.
    // This prevents checking CI on the pre-archive commit immediately after push.
    // If archiveSha is undefined (e.g. terminal-status short-circuit), skip this check.
    if (archiveSha !== undefined && headSha !== archiveSha) {
      // Bound this wait by the same deadline as the CI-pending wait. Without it, a PR
      // head that never reflects the archive commit (e.g. an external force-push moved
      // the branch) would loop forever, since this branch `continue`s past the
      // pending-branch deadline check below.
      if (effectiveTimeoutMs !== null && nowFn() - start >= effectiveTimeoutMs) {
        return {
          exitCode: 1,
          escalation: formatEscalation({
            failedStep: "check status (timeout — PR head did not reflect archive commit)",
            detectedState: `Timed out after ${Math.round((nowFn() - start) / 1000)}s waiting for PR #${prNumber} head to reflect archive commit ${archiveSha.slice(0, 7)} (current head: ${headSha.slice(0, 7)}).`,
            recommendedAction: `Ensure the feature branch head matches the archive commit (no out-of-band push), then re-run: specrunner job archive --with-merge ${slug}`,
            resumeCommand: `specrunner job archive --with-merge ${slug}`,
          }),
        };
      }
      stdoutWrite(
        `Waiting for PR to reflect archive commit (${archiveSha.slice(0, 7)})... current: ${headSha.slice(0, 7)}`,
      );
      await sleepFn(pollIntervalMs);
      continue;
    }

    // Poll check status
    let rollup: Awaited<ReturnType<GitHubClient["getCheckStatus"]>>;
    try {
      rollup = await githubClient.getCheckStatus(owner, repo, headSha);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "check status (getCheckStatus)",
          detectedState: `getCheckStatus failed: ${detail}`,
          recommendedAction: `Check GitHub token: specrunner login. Then re-run: specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    if (rollup.state === "failure") {
      const failingList = rollup.failing.length > 0 ? `: ${rollup.failing.join(", ")}` : "";
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "check status (failed checks)",
          detectedState: `PR checks failed${failingList}`,
          recommendedAction: `Fix failing checks, then re-run: specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }

    if (rollup.state === "success") {
      if (isBlocked) {
        const now = nowFn();
        if (blockedGraceStart === null) {
          blockedGraceStart = now;
        }
        const elapsed = now - blockedGraceStart;
        if (elapsed >= BLOCKED_CHECK_GRACE_MS) {
          // Grace exhausted: treat as genuine branch-protection requirement unmet.
          return blockedAfterChecksEscalation(slug, "success");
        }
        // Grace still running: mergeStateStatus may be transiently BLOCKED after CI resolved.
        // Also bound by the overall deadline (defensive: if BLOCKED_CHECK_GRACE_MS is ever
        // configured larger than effectiveTimeoutMs, the overall timeout still terminates the wait).
        if (effectiveTimeoutMs !== null && now - start >= effectiveTimeoutMs) {
          return {
            exitCode: 1,
            escalation: formatEscalation({
              failedStep: "check status (timeout)",
              detectedState: `Timed out after ${Math.round((now - start) / 1000)}s waiting for mergeStateStatus to clear (checks success, still BLOCKED).`,
              recommendedAction: `Wait for the branch-protection state to resolve, then re-run: specrunner job archive --with-merge ${slug}`,
              resumeCommand: `specrunner job archive --with-merge ${slug}`,
            }),
          };
        }
        stdoutWrite(
          `PR #${prNumber} checks success but mergeStateStatus BLOCKED (${Math.round(elapsed / 1000)}s / ${BLOCKED_CHECK_GRACE_MS / 1000}s grace). Waiting ${pollIntervalMs / 1000}s...`,
        );
        await sleepFn(pollIntervalMs);
        continue;
      }
      // Checks are green and not blocked — proceed to merge.
      stdoutWrite(`PR #${prNumber} checks passed. Proceeding to merge...`);
      break;
    }

    if (rollup.state === "none") {
      // No checks found on this head commit yet.
      // Record grace start on first observation (set-once; never reset).
      const now = nowFn();
      if (noneGraceStart === null) {
        noneGraceStart = now;
      }
      const elapsed = now - noneGraceStart;
      if (elapsed >= NONE_CHECK_GRACE_MS) {
        if (isBlocked) {
          // No checks appeared and PR is still BLOCKED — a non-check branch-protection requirement is unmet.
          return blockedAfterChecksEscalation(slug, "no checks");
        }
        // Grace period exhausted: no CI on this repo — proceed to merge.
        stdoutWrite(
          `PR #${prNumber} no checks appeared after ${NONE_CHECK_GRACE_MS / 1000}s. Assuming CI-less repo; proceeding to merge...`,
        );
        break;
      }
      // Grace still running: wait for checks to appear.
      stdoutWrite(
        `PR #${prNumber} no checks yet (${Math.round(elapsed / 1000)}s / ${NONE_CHECK_GRACE_MS / 1000}s grace). Waiting ${pollIntervalMs / 1000}s...`,
      );
      await sleepFn(pollIntervalMs);
      continue;
    }

    // rollup.state === "pending" — check deadline
    if (effectiveTimeoutMs !== null) {
      const elapsed = nowFn() - start;
      if (elapsed >= effectiveTimeoutMs) {
        const pendingList = rollup.pending.length > 0 ? `: ${rollup.pending.join(", ")}` : "";
        return {
          exitCode: 1,
          escalation: formatEscalation({
            failedStep: "check status (timeout)",
            detectedState: `Timed out waiting for checks to resolve after ${Math.round(elapsed / 1000)}s. Still pending${pendingList}`,
            recommendedAction: `Wait for checks to complete, then re-run: specrunner job archive --with-merge ${slug}`,
            resumeCommand: `specrunner job archive --with-merge ${slug}`,
          }),
        };
      }
    }

    const pendingList = rollup.pending.length > 0 ? ` (${rollup.pending.join(", ")})` : "";
    stdoutWrite(`PR #${prNumber} checks still pending${pendingList}. Waiting ${pollIntervalMs / 1000}s...`);
    await sleepFn(pollIntervalMs);
  }

  // ---------------------------------------------------------------------------
  // Step 5: squash merge — final mergeability decided by the merge endpoint
  // ---------------------------------------------------------------------------
  stdoutWrite(`Merging PR #${prNumber}...`);

  let mergeResult: { merged: boolean; message: string };
  try {
    mergeResult = await githubClient.mergePullRequest(owner, repo, prNumber, { mergeMethod: "squash" });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      exitCode: 1,
      escalation: formatEscalation({
        failedStep: "squash merge (REST API)",
        detectedState: `mergePullRequest #${prNumber} threw: ${detail}`,
        recommendedAction: `Check branch protection requirements, then re-run: specrunner job archive --with-merge ${slug}`,
        resumeCommand: `specrunner job archive --with-merge ${slug}`,
      }),
    };
  }

  if (!mergeResult.merged) {
    const cause = classifyMergeFailure(mergeResult.message);
    if (cause === "conflict") {
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "squash merge (conflict)",
          detectedState: `Merge endpoint reported a conflict: ${mergeResult.message}`,
          recommendedAction: `Rebase the feature branch onto ${resolvedBaseBranch} and re-run:\n  git rebase ${resolvedBaseBranch}\n  git push --force-with-lease\n  specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }
    if (cause === "checks-failed") {
      return {
        exitCode: 1,
        escalation: formatEscalation({
          failedStep: "squash merge (required checks failed)",
          detectedState: `A required status check has failed: ${mergeResult.message}`,
          recommendedAction: `Fix failing checks, then re-run: specrunner job archive --with-merge ${slug}`,
          resumeCommand: `specrunner job archive --with-merge ${slug}`,
        }),
      };
    }
    return {
      exitCode: 1,
      escalation: formatEscalation({
        failedStep: "squash merge (REST API)",
        detectedState: `merge failed: ${mergeResult.message}`,
        recommendedAction: `Check branch protection requirements, then re-run: specrunner job archive --with-merge ${slug}`,
        resumeCommand: `specrunner job archive --with-merge ${slug}`,
      }),
    };
  }

  stdoutWrite(`PR #${prNumber} merged successfully.`);

  // ---------------------------------------------------------------------------
  // Step 5.5: Post-merge integrity check (only on fresh-merge path)
  // ---------------------------------------------------------------------------
  if (postMergeVerify && postMergeVerify.length > 0) {
    const integrityResult = await runPostMergeIntegrityCheck({
      slug,
      cwd,
      baseBranch: resolvedBaseBranch,
      commands: postMergeVerify,
      spawn,
      githubToken,
      prNumber,
    });
    if (!integrityResult.ok) {
      return { exitCode: 1, escalation: integrityResult.escalation };
    }
  }

  // ---------------------------------------------------------------------------
  // Step 6: Transition to archived + post-merge cleanup (worktree teardown + branch delete)
  // ---------------------------------------------------------------------------
  await performPostMergeTransition(slug, recordDir, stdoutWrite);
  await runPostMergeCleanup(
    { slug, cwd, branch, worktreePath, noWorktree, baseBranch: resolvedBaseBranch, spawn, fs, worktreeManagerFn },
    stdoutWrite,
  );

  return { exitCode: 0 };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Best-effort post-merge status transition: awaiting-archive → archived.
 * Called immediately before runPostMergeCleanup on every merge-success path.
 * Idempotent (already archived → no-op). Failures emit a warning but do not
 * abort the caller — the merge is already done and cleanup must proceed.
 */
async function performPostMergeTransition(
  slug: string,
  recordDir: string,
  stdoutWrite: (msg: string) => void,
): Promise<void> {
  try {
    await markJobArchived(slug, recordDir);
    stdoutWrite(`Job ${slug} marked as archived.`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    stderrWrite(`Warning: failed to transition ${slug} to archived: ${message}. Continuing cleanup.`);
  }
}

/**
 * Classify a merge-endpoint failure message to produce a cause-specific escalation.
 */
function classifyMergeFailure(message: string): "conflict" | "checks-failed" | "other" {
  const lower = message.toLowerCase();
  if (lower.includes("conflict")) {
    return "conflict";
  }
  if (lower.includes("required status check") && lower.includes("has failed")) {
    return "checks-failed";
  }
  return "other";
}

/**
 * Return a branch-protection escalation for when checks resolved but the PR is still BLOCKED.
 * This indicates a non-check branch-protection requirement (e.g. a required review) is unmet.
 */
function blockedAfterChecksEscalation(slug: string, checkOutcome: "success" | "no checks"): MergeThenArchiveResult {
  return {
    exitCode: 1,
    escalation: formatEscalation({
      failedStep: "merge gate (branch protection)",
      detectedState: `Checks resolved (${checkOutcome}) but PR is still BLOCKED. A non-check branch-protection requirement (e.g. a required review) is unmet.`,
      recommendedAction: `Satisfy branch protection requirements, then re-run: specrunner job archive --with-merge ${slug}`,
      resumeCommand: `specrunner job archive --with-merge ${slug}`,
    }),
  };
}
