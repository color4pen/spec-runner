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
import * as fs from "node:fs";
import * as path from "node:path";
import { JobStateStore } from "../store/job-state-store.js";
import { getJobSlug } from "../state/job-slug.js";
import type { JobState } from "../state/schema.js";
import { resolveRepoRoot } from "../util/repo-root.js";
import { logResult, stderrWrite } from "../logger/stdout.js";
import { getVerboseLogPath } from "../util/xdg.js";

const UUID_REGEX = /^[a-f0-9-]{36}$/;

/**
 * Run `job show` — print key fields to stdout.
 * Returns the exit code: 0 = success, 1 = error.
 */
export async function runJobShow(input: string): Promise<number> {
  // Read-only command — fallback to cwd if git unavailable
  const repoRoot = (await resolveRepoRoot()) ?? process.cwd();

  let state: JobState;

  if (UUID_REGEX.test(input)) {
    // Load directly by jobId
    try {
      const store = new JobStateStore(input, repoRoot);
      const loaded = await store.load();
      state = loaded as JobState;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        stderrWrite(`Error: Job not found: ${input}`);
        return 1;
      }
      const msg = err instanceof Error ? err.message : String(err);
      stderrWrite(`Error: ${msg}`);
      return 1;
    }
  } else {
    // Resolve by slug
    const allJobs = await JobStateStore.list(repoRoot);
    const matching = allJobs.filter((j) => getJobSlug(j) === input);
    if (matching.length === 0) {
      stderrWrite(`Error: Job not found for slug: ${input}`);
      return 1;
    }
    // Pick most recently updated
    state = [...matching].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0]!;
  }

  printJobState(state, repoRoot);
  return 0;
}

export function printJobState(state: JobState, repoRoot: string = process.cwd()): void {
  logResult(`Job ID:  ${state.jobId}`);
  logResult(`Status:  ${state.status}`);
  logResult(`Branch:  ${state.branch ?? "(none)"}`);
  logResult(`Step:    ${state.step ?? "(none)"}`);
  logResult(`Created: ${state.createdAt}`);
  logResult(`Updated: ${state.updatedAt}`);

  // Show pipeline log path (relative to repoRoot for readability)
  const logPath = getVerboseLogPath(repoRoot, state.jobId);
  if (fs.existsSync(logPath)) {
    const relPath = path.relative(repoRoot, logPath);
    logResult(`Log:     ${relPath}`);
  } else {
    logResult(`Log:     (none)`);
  }
}
