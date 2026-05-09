import { listJobStates } from "../state/store.js";
import type { JobState, JobStatus } from "../state/schema.js";
import { getJobSlug } from "../state/job-slug.js";
import { ACTIVE_STATUSES } from "../state/lifecycle.js";

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
): string {
  const jobIdShort = job.jobId.slice(0, 8);
  const slug = getJobSlug(job);
  const step = job.step;
  const isStale = job.status === "running" && ((nowMs ?? Date.now()) - new Date(job.updatedAt).getTime()) > STALE_THRESHOLD_MS;
  const status = isStale ? "running (stale?)" : job.status;
  const branch = truncate(job.branch ?? "-", 40);
  const age = formatAge(job.createdAt, nowMs);

  if (isTty) {
    // Fixed-width columns for TTY
    return [
      jobIdShort.padEnd(8),
      slug.padEnd(30),
      step.padEnd(25),
      status.padEnd(12),
      branch.padEnd(40),
      age.padEnd(8),
    ].join("  ");
  } else {
    // TAB-separated for non-TTY (pipes, scripts)
    return [jobIdShort, slug, step, status, branch, age].join("\t");
  }
}

/**
 * Run the specrunner ps command.
 * @param opts.active - When true, only show jobs with active (running) status
 * @param opts.all - When true, include archived jobs (default: archived hidden)
 */
export async function runPs(opts: { active?: boolean; all?: boolean } = {}): Promise<void> {
  const allJobs = await listJobStates();

  let jobs: typeof allJobs;
  if (opts.active) {
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

  const isTty = process.stdout.isTTY ?? false;

  // Header — 6 columns: JOB_ID, SLUG, STEP, STATUS, BRANCH, AGE
  if (isTty) {
    const header = [
      "JOB_ID".padEnd(8),
      "SLUG".padEnd(30),
      "STEP".padEnd(25),
      "STATUS".padEnd(12),
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
    process.stdout.write(formatJobRow(job, isTty, nowMs) + "\n");
  }
}
