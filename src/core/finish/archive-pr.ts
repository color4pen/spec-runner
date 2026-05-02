/**
 * Archive PR creation and auto-merge step for finish command.
 *
 * TC-035: push → gh pr create → gh pr merge --auto
 * TC-036: auto-merge fails → fallback immediate merge
 * TC-037: body passed via --body-file tempfile
 * TC-038: push failure → escalation
 * TC-055: both auto-merge and fallback fail → escalation
 * TC-057: archive PR already MERGED → skip
 * TC-064: title, base, head args correct
 */
import type { SpawnFn } from "../../util/spawn.js";
import { runGhPrCreate } from "../gh/pr.js";
import { formatEscalation } from "./escalation.js";

export type ArchivePrResult =
  | { ok: true; skipped: boolean; archivePrUrl: string | null; message: string }
  | { ok: false; escalation: string; exitCode: 1 };

export type PrepareBranchResult =
  | { ok: true }
  | { ok: false; escalation: string; exitCode: 1 };

/** Strings that indicate auto-merge is unavailable on this repo */
const AUTO_MERGE_UNAVAILABLE_PATTERNS = [
  "auto-merge",
  "branch protection",
  "not enabled",
  "not supported",
];

function isAutoMergeUnavailable(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return AUTO_MERGE_UNAVAILABLE_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Check if the archive branch/PR already exists and is merged (idempotency).
 * Exported so the orchestrator can probe BEFORE any tree mutation.
 */
export async function checkArchivePrAlreadyMerged(
  slug: string,
  cwd: string,
  spawn: SpawnFn,
): Promise<boolean> {
  // Check if the archive branch exists on remote
  const branchResult = await spawn(
    "gh",
    ["pr", "list", "--head", `chore/archive-${slug}`, "--state", "merged", "--json", "state"],
    { cwd },
  );

  if (branchResult.exitCode !== 0) return false;

  try {
    const parsed = JSON.parse(branchResult.stdout.trim()) as Array<{ state: string }>;
    return parsed.length > 0;
  } catch {
    return false;
  }
}

/**
 * Prepare the archive branch by fetching origin/main and checking it out.
 * Must run BEFORE archiveOpenspec / moveRequestsDir so that those commits
 * land on the archive branch, not on main.
 *
 * On branch-already-exists, force-repoints to origin/main via `git checkout -B`
 * to avoid carrying stale commits from a prior failed run.
 */
export async function prepareArchiveBranch(params: {
  slug: string;
  jobId: string;
  cwd: string;
  spawn: SpawnFn;
}): Promise<PrepareBranchResult> {
  const { slug, jobId, cwd, spawn } = params;
  const branchName = `chore/archive-${slug}`;

  // Step 1: git fetch origin main
  const fetchResult = await spawn("git", ["fetch", "origin", "main"], { cwd });
  if (fetchResult.exitCode !== 0) {
    const escalation = formatEscalation({
      failedStep: "archive-pr-creation",
      detectedState: `git fetch failed (exit ${fetchResult.exitCode})`,
      recommendedAction: `Check network connectivity. Then re-run: specrunner finish ${jobId}`,
      resumeCommand: `specrunner finish ${jobId}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  // Step 2: git checkout -b chore/archive-<slug> origin/main
  // If the branch already exists locally (prior failed run), force-repoint
  // to origin/main via -B to avoid carrying stale commits.
  const checkoutResult = await spawn(
    "git",
    ["checkout", "-b", branchName, "origin/main"],
    { cwd },
  );
  if (checkoutResult.exitCode !== 0) {
    // Branch already exists locally — force-reset it to origin/main
    const forceCheckoutResult = await spawn(
      "git",
      ["checkout", "-B", branchName, "origin/main"],
      { cwd },
    );
    if (forceCheckoutResult.exitCode !== 0) {
      const escalation = formatEscalation({
        failedStep: "archive-pr-creation",
        detectedState: `git checkout branch failed (exit ${checkoutResult.exitCode})`,
        recommendedAction: `Check git error: ${checkoutResult.stderr.trim()}. Then re-run: specrunner finish ${jobId}`,
        resumeCommand: `specrunner finish ${jobId}`,
      });
      return { ok: false, escalation, exitCode: 1 };
    }
  }

  return { ok: true };
}

/**
 * Push archive branch, create PR, and auto-merge.
 * Call this AFTER prepareArchiveBranch + archiveOpenspec + moveRequestsDir
 * so the commits are already on the archive branch.
 */
export async function pushAndCreateArchivePr(params: {
  slug: string;
  jobId: string;
  cwd: string;
  spawn: SpawnFn;
}): Promise<ArchivePrResult> {
  const { slug, jobId, cwd, spawn } = params;
  const branchName = `chore/archive-${slug}`;

  // Step 3: git push -u origin chore/archive-<slug>
  const pushResult = await spawn(
    "git",
    ["push", "-u", "origin", branchName],
    { cwd },
  );

  if (pushResult.exitCode !== 0) {
    const escalation = formatEscalation({
      failedStep: "archive-pr-creation",
      detectedState: `git push failed (exit ${pushResult.exitCode})`,
      recommendedAction: `Check git error: ${pushResult.stderr.trim()}. Ensure you have push access to origin. Then re-run: specrunner finish ${jobId}`,
      resumeCommand: `specrunner finish ${jobId}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  // Step 4: gh pr create
  const prBody = `Automated archive PR for slug: ${slug}\n\nCreated by \`specrunner finish ${jobId}\`.`;
  const createResult = await runGhPrCreate({
    title: `chore: archive ${slug}`,
    body: prBody,
    base: "main",
    head: branchName,
    cwd,
    spawn,
  });

  if (!createResult.ok) {
    const escalation = formatEscalation({
      failedStep: "archive-pr-creation",
      detectedState: `gh pr create failed`,
      recommendedAction: `Check gh error: ${createResult.stderr.trim()}. Then re-run: specrunner finish ${jobId}`,
      resumeCommand: `specrunner finish ${jobId}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  const archivePrUrl = createResult.url;

  // Step 5: gh pr merge --auto --squash --delete-branch <url>
  const autoMergeResult = await spawn(
    "gh",
    ["pr", "merge", "--auto", "--squash", "--delete-branch", archivePrUrl],
    { cwd },
  );

  if (autoMergeResult.exitCode !== 0) {
    // Fallback: immediate merge
    if (isAutoMergeUnavailable(autoMergeResult.stderr)) {
      const fallbackResult = await spawn(
        "gh",
        ["pr", "merge", "--squash", "--delete-branch", archivePrUrl],
        { cwd },
      );

      if (fallbackResult.exitCode !== 0) {
        const escalation = formatEscalation({
          failedStep: "archive-pr-creation",
          detectedState: `gh pr merge auto and fallback both failed`,
          recommendedAction: `Auto-merge unavailable and immediate merge also failed. Manually merge the archive PR: ${archivePrUrl}\n  gh pr merge --squash --delete-branch ${archivePrUrl}`,
          resumeCommand: `specrunner finish ${jobId}`,
        });
        return { ok: false, escalation, exitCode: 1 };
      }

      return {
        ok: true,
        skipped: false,
        archivePrUrl,
        message: `Archive PR created and merged immediately (auto-merge unavailable): ${archivePrUrl}`,
      };
    }

    // auto-merge failed for other reason
    const escalation = formatEscalation({
      failedStep: "archive-pr-creation",
      detectedState: `gh pr merge --auto failed (exit ${autoMergeResult.exitCode})`,
      recommendedAction: `Check gh error: ${autoMergeResult.stderr.trim()}. Manually merge: ${archivePrUrl}`,
      resumeCommand: `specrunner finish ${jobId}`,
    });
    return { ok: false, escalation, exitCode: 1 };
  }

  return {
    ok: true,
    skipped: false,
    archivePrUrl,
    message: `Archive PR created with auto-merge enabled: ${archivePrUrl}`,
  };
}

/**
 * Legacy combined entry — only used by unit tests; orchestrator uses the
 * 3-function split (`checkArchivePrAlreadyMerged` + `prepareArchiveBranch`
 * + `pushAndCreateArchivePr`).
 *
 * Includes idempotency check + branch preparation + push + PR creation.
 *
 * In the orchestrator the three phases are called individually so the
 * idempotency check and branch preparation can run BEFORE tree mutations
 * (archiveOpenspec / moveRequestsDir).
 */
export async function createArchivePr(params: {
  slug: string;
  jobId: string;
  cwd: string;
  spawn: SpawnFn;
}): Promise<ArchivePrResult> {
  const { slug, jobId, cwd, spawn } = params;

  // Idempotency: check if archive PR already merged
  const alreadyMerged = await checkArchivePrAlreadyMerged(slug, cwd, spawn);
  if (alreadyMerged) {
    return {
      ok: true,
      skipped: true,
      archivePrUrl: null,
      message: `Archive PR for ${slug} already merged, skipping.`,
    };
  }

  // Prepare branch (fetch + checkout)
  const branchResult = await prepareArchiveBranch({ slug, jobId, cwd, spawn });
  if (!branchResult.ok) {
    return branchResult;
  }

  // Push + create PR + merge
  return pushAndCreateArchivePr({ slug, jobId, cwd, spawn });
}
