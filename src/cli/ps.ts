import { listJobStates } from "../state/store.js";
import type { JobState, JobStatus } from "../state/schema.js";
import { getJobSlug } from "../state/job-slug.js";
import { ACTIVE_STATUSES } from "../state/lifecycle.js";
import { spawnCommand } from "../util/spawn.js";

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

/** Jobs with status "running" but not updated for this long are marked stale. */
const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/** Width of the STATUS column in TTY mode — wide enough for the PR hint suffix. */
const STATUS_COLUMN_WIDTH = 40;

/**
 * Format a single job as a row.
 * 6 columns: JOB_ID, SLUG, STEP, STATUS, BRANCH, AGE
 *
 * TC-110: SLUG column present
 * TC-143: non-TTY TAB-separated SLUG column at index 1
 */
export function formatJobRow(
  job: JobState,
  isTty: boolean,
  nowMs?: number,
  prMerged?: boolean,
): string {
  const jobIdShort = job.jobId.slice(0, 8);
  const slug = getJobSlug(job);
  const step = job.step;
  const isStale = job.status === "running" && ((nowMs ?? Date.now()) - new Date(job.updatedAt).getTime()) > STALE_THRESHOLD_MS;

  let status: string;
  if (prMerged) {
    status = "awaiting-merge (PR merged, run finish)";
  } else if (isStale) {
    status = "running (stale?)";
  } else {
    status = job.status;
  }

  const branch = truncate(job.branch ?? "-", 40);
  const age = formatAge(job.createdAt, nowMs);

  if (isTty) {
    // Fixed-width columns for TTY
    return [
      jobIdShort.padEnd(8),
      slug.padEnd(30),
      step.padEnd(25),
      status.padEnd(STATUS_COLUMN_WIDTH),
      branch.padEnd(40),
      age.padEnd(8),
    ].join("  ");
  } else {
    // TAB-separated for non-TTY (pipes, scripts)
    return [jobIdShort, slug, step, status, branch, age].join("\t");
  }
}

/**
 * Check if the PR for a given job has been merged.
 *
 * Uses `gh pr view` subprocess (node:child_process, not Bun.spawn).
 * Returns:
 *   - true  if PR is MERGED
 *   - false if PR is not MERGED (OPEN/CLOSED)
 *   - null  if pullRequest is absent, gh is unavailable, or any error occurs
 *
 * Silently returns null when gh CLI is not found (TC-27).
 */
export async function checkPrMerged(job: JobState): Promise<boolean | null> {
  if (!job.pullRequest) return null;

  const { owner, name } = job.repository;
  const prNumber = String(job.pullRequest.number);

  try {
    const result = await spawnCommand(
      "gh",
      ["pr", "view", prNumber, "--repo", `${owner}/${name}`, "--json", "state", "--jq", ".state"],
      { cwd: process.cwd() },
    );
    if (result.exitCode !== 0) return null;
    return result.stdout.trim() === "MERGED";
  } catch {
    // gh CLI not found or other error → skip silently
    return null;
  }
}

/**
 * Run the specrunner ps command.
 * @param opts.active - When true, only show jobs with active (running) status
 * @param opts.all - When true, include archived jobs (default: archived hidden)
 * @param opts.status - When set, filter by exact status (overrides active/all)
 */
export async function runPs(opts: { active?: boolean; all?: boolean; status?: string } = {}): Promise<void> {
  const allJobs = await listJobStates();

  let jobs: typeof allJobs;
  if (opts.status) {
    // --status is highest priority, overrides active and all
    jobs = allJobs.filter((j) => j.status === opts.status);
  } else if (opts.active) {
    jobs = allJobs.filter((j) => ACTIVE_STATUSES.has(j.status));
  } else if (opts.all) {
    // TC-110: --all includes archived
    jobs = allJobs;
  } else {
    // TC-142: default — exclude archived
    jobs = allJobs.filter((j) => j.status !== "archived");
  }

  if (jobs.length === 0) {
    process.stdout.write("No jobs found.\n");
    return;
  }

  // Sort by createdAt descending (newest first)
  const sorted = [...jobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // Check PR status for awaiting-merge jobs only (rate limit: typically 0-2 such jobs)
  const prMergedMap = new Map<string, boolean>();
  for (const job of sorted) {
    if (job.status === "awaiting-merge") {
      const merged = await checkPrMerged(job);
      if (merged === true) {
        prMergedMap.set(job.jobId, true);
      }
    }
  }

  const isTty = process.stdout.isTTY ?? false;

  // Header — 6 columns: JOB_ID, SLUG, STEP, STATUS, BRANCH, AGE
  if (isTty) {
    const header = [
      "JOB_ID".padEnd(8),
      "SLUG".padEnd(30),
      "STEP".padEnd(25),
      "STATUS".padEnd(STATUS_COLUMN_WIDTH),
      "BRANCH".padEnd(40),
      "AGE".padEnd(8),
    ].join("  ");
    process.stdout.write(header + "\n");
    process.stdout.write("-".repeat(header.length) + "\n");
  } else {
    process.stdout.write(
      ["JOB_ID", "SLUG", "STEP", "STATUS", "BRANCH", "AGE"].join("\t") + "\n",
    );
  }

  const nowMs = Date.now();
  for (const job of sorted) {
    const prMerged = prMergedMap.get(job.jobId);
    process.stdout.write(formatJobRow(job, isTty, nowMs, prMerged) + "\n");
  }
}
