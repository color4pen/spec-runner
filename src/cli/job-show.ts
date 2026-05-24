/**
 * Handler for `specrunner job show <jobId|slug>`.
 *
 * Displays key fields of a job state:
 *   Job ID / Status / Branch / Step / Created / Updated
 *
 * Input resolution:
 *   - UUID format (/^[a-f0-9-]{36}$/) → load by jobId directly
 *   - Otherwise → resolve by slug (all jobs, latest updatedAt wins)
 */
import { loadJobState, listJobStates } from "../state/store.js";
import { getJobSlug } from "../state/job-slug.js";
import type { JobState } from "../state/schema.js";
import { loadConfig } from "../config/store.js";
import { spawnCommand } from "../util/spawn.js";
import { setJobsLocation } from "../util/xdg.js";

const UUID_REGEX = /^[a-f0-9-]{36}$/;

/**
 * Run `job show` — print 6 key fields to stdout.
 * Calls process.exit() on error.
 */
export async function runJobShow(input: string): Promise<void> {
  // Resolve jobs storage location; fall back to XDG on any error
  try {
    const config = await loadConfig();
    const gitResult = await spawnCommand("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() });
    if (gitResult.exitCode === 0) {
      setJobsLocation(config.jobs?.location ?? "project", gitResult.stdout.trim());
    } else {
      setJobsLocation("xdg");
    }
  } catch {
    setJobsLocation("xdg");
  }

  let state: JobState;

  if (UUID_REGEX.test(input)) {
    // Load directly by jobId
    try {
      state = await loadJobState(input);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${msg}\n`);
      process.exit(1);
    }
  } else {
    // Resolve by slug
    const allJobs = await listJobStates();
    const matching = allJobs.filter((j) => getJobSlug(j) === input);
    if (matching.length === 0) {
      process.stderr.write(`Error: Job not found for slug: ${input}\n`);
      process.exit(1);
    }
    // Pick most recently updated
    state = [...matching].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0]!;
  }

  printJobState(state);
}

function printJobState(state: JobState): void {
  process.stdout.write(`Job ID:  ${state.jobId}\n`);
  process.stdout.write(`Status:  ${state.status}\n`);
  process.stdout.write(`Branch:  ${state.branch ?? "(none)"}\n`);
  process.stdout.write(`Step:    ${state.step ?? "(none)"}\n`);
  process.stdout.write(`Created: ${state.createdAt}\n`);
  process.stdout.write(`Updated: ${state.updatedAt}\n`);
}
