import * as fs from "node:fs";
import * as path from "node:path";
import { JobStateStore } from "../store/job-state-store.js";
import { getJobSlug } from "../state/job-slug.js";
import { ACTIVE_STATUSES, isTerminal } from "../state/lifecycle.js";
import type { GitHubClient } from "../core/port/github-client.js";
// repo-root discovery is done lazily inside runPs (DI-fallback seam; see CWD-ps-root-resolve allowlist entry)
import { stdoutWrite, stderrWrite } from "../logger/stdout.js";
import { isStaleRunning } from "../core/resume/safety.js";
import { livenessJsonPath } from "../util/paths.js";
import {
  buildOperationsView,
  formatOperationsViewHuman,
  formatOperationsViewJson,
} from "../core/job-list/operations-view.js";
import type { ViewEntry } from "../core/job-list/operations-view.js";
import { detectSpecrunnerWorktree } from "../core/worktree/detection.js";
import { worktreeGuardError } from "../errors.js";

/**
 * Format a job age in human-readable form.
 */
export function formatAge(createdAt: string, nowMs?: number): string {
  const now = nowMs ?? Date.now();
  const created = new Date(createdAt).getTime();
  const diffMs = now - created;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMinutes > 0) return `${diffMinutes}m`;
  return `${diffSeconds}s`;
}

/**
 * Truncate a string to maxLength, appending "..." if needed.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Check if the PR for a given job has been merged.
 *
 * Uses GitHub REST API via GitHubClient.getPullRequest.
 * Returns:
 *   - true  if PR is MERGED
 *   - false if PR is not MERGED (OPEN/CLOSED)
 *   - null  if pullRequest is absent, githubClient is unavailable, or any error occurs
 *
 * Silently returns null when no GitHub client is provided (TC-27).
 */
export async function checkPrMerged(job: import("../state/schema.js").JobState, githubClient: GitHubClient | null): Promise<boolean | null> {
  if (!job.pullRequest) return null;
  if (!githubClient) return null;

  const { owner, name } = job.repository;
  const prNumber = job.pullRequest.number;

  try {
    const pr = await githubClient.getPullRequest(owner, name, prNumber);
    return pr.state === "MERGED";
  } catch {
    // API unavailable or other error → skip silently
    return null;
  }
}

/**
 * Run the specrunner ps command.
 * @param opts.active - When true, only show jobs with active (running) status
 * @param opts.all - When true, include archived jobs (default: archived hidden)
 * @param opts.status - When set, filter by exact status (overrides active/all)
 * @param opts.json - When true, output machine-readable JSON
 * @param opts.repoRoot - Optional override for the git repo root (useful in tests)
 * @param githubClient - Optional GitHub REST API client for PR merge status checks
 */
export async function runPs(
  opts: { active?: boolean; all?: boolean; status?: string; json?: boolean; repoRoot?: string } = {},
  githubClient: GitHubClient | null = null,
): Promise<number> {
  // Read-only command — fallback to cwd if git unavailable (DI-fallback; allowlisted as CWD-ps-root-resolve)
  const repoRoot = opts.repoRoot ?? (await (await import("../util/repo-root.js")).resolveRepoRoot()) ?? process.cwd();

  // Worktree guard: reject from inside a specrunner job worktree.
  // Uses resolved repoRoot (which equals the worktree root when running from inside one)
  // so that git-aware resolution captures worktree context correctly.
  const wtResult = await detectSpecrunnerWorktree(repoRoot);
  if (wtResult.isSpecrunnerWorktree) {
    const mainPath = wtResult.mainCheckoutPath ?? "<main checkout>";
    const guardErr = worktreeGuardError("job ls", mainPath);
    stderrWrite(guardErr.message);
    stderrWrite(`Hint: ${guardErr.hint}`);
    return 2;
  }

  const allJobs = await JobStateStore.list(repoRoot, { includeArchived: opts.all === true || opts.status === "archived" });

  let jobs: typeof allJobs;
  if (opts.status) {
    // --status is highest priority, overrides active and all
    jobs = allJobs.filter((j) => j.status === opts.status);
  } else if (opts.active) {
    jobs = allJobs.filter((j) => ACTIVE_STATUSES.has(j.status));
  } else if (opts.all) {
    // --all includes archived
    jobs = allJobs;
  } else {
    // default — active のみ（非終端）。archived / canceled は --all で含める
    jobs = allJobs.filter((j) => !isTerminal(j.status));
  }

  if (jobs.length === 0) {
    if (opts.json) {
      stdoutWrite('{\n  "categories": []\n}\n');
    } else {
      stdoutWrite("No jobs found.\n");
    }
    return 0;
  }

  // Sort by createdAt descending (newest first)
  const sorted = [...jobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Check PR status for awaiting-archive jobs only (rate limit: typically 0-2 such jobs)
  const prMergedMap = new Map<string, boolean | null>();
  for (const job of sorted) {
    if (job.status === "awaiting-archive") {
      const merged = await checkPrMerged(job, githubClient);
      prMergedMap.set(job.jobId, merged);
    }
  }

  const nowMs = Date.now();
  const isTty = process.stdout.isTTY ?? false;

  // Build ViewEntry[] for each job
  const entries: ViewEntry[] = sorted.map((job) => {
    const sidecarCandidate = path.join(repoRoot, livenessJsonPath(getJobSlug(job)));
    const sidecarPath = fs.existsSync(sidecarCandidate) ? sidecarCandidate : undefined;
    const isStale = isStaleRunning(job, sidecarPath);
    const prMerged = prMergedMap.has(job.jobId) ? (prMergedMap.get(job.jobId) ?? null) : null;
    return { job, isStale, prMerged };
  });

  const view = buildOperationsView(entries);

  if (opts.json) {
    stdoutWrite(formatOperationsViewJson(view));
  } else {
    const output = formatOperationsViewHuman(view, { isTty, nowMs });
    if (output) {
      stdoutWrite(output);
    } else {
      stdoutWrite("No jobs found.\n");
    }
  }

  return 0;
}
