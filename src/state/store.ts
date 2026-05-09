import { getJobStatePath } from "../util/xdg.js";
import { JobStateStore } from "../store/job-state-store.js";
import type { JobState, RequestInfo, RepositoryInfo } from "./schema.js";
import { SpecRunnerError, ERROR_CODES } from "../errors.js";

/**
 * Create a new job state file and persist it.
 * @deprecated Use JobStateStore.create() instead.
 */
export async function createJobState(params: {
  request: RequestInfo;
  repository: RepositoryInfo;
}): Promise<JobState> {
  return JobStateStore.create(params);
}

/**
 * Load a single job state by jobId.
 * Throws JOB_NOT_FOUND if the file does not exist.
 * Throws STATE_FILE_INVALID if the file cannot be parsed or validated.
 * @deprecated Use new JobStateStore(jobId).load() instead.
 */
export async function loadJobState(jobId: string): Promise<JobState> {
  try {
    return (await new JobStateStore(jobId).load()) as JobState;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new SpecRunnerError(
        ERROR_CODES.JOB_NOT_FOUND,
        "Run 'specrunner ps' to list available job IDs.",
        `Job not found: ${jobId}`,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    const filePath = getJobStatePath(jobId);
    throw new SpecRunnerError(
      ERROR_CODES.STATE_FILE_INVALID,
      "Delete the corrupted file and re-run specrunner.",
      `State file invalid at ${filePath}: ${message}`,
    );
  }
}

/**
 * Update a job state atomically.
 * Reads the current state, applies the mutator, then writes atomically.
 * @deprecated Use new JobStateStore(jobId).load() + mutator + store.persist() instead.
 */
export async function updateJobState(
  jobId: string,
  mutator: (state: JobState) => JobState,
): Promise<JobState> {
  const store = new JobStateStore(jobId);
  const current = await store.load();
  const updated = mutator(current as JobState);
  await store.persist(updated);
  return updated;
}

/**
 * Delete a job state file by jobId.
 * Idempotent: ENOENT is silently ignored.
 * @deprecated Use JobStateStore.delete() instead.
 */
export async function deleteJobState(jobId: string): Promise<void> {
  return JobStateStore.delete(jobId);
}

/**
 * Resolve a full job UUID from a prefix (short ID) or full UUID.
 * @deprecated Use JobStateStore.resolveId() instead.
 */
export async function resolveJobId(prefix: string): Promise<string> {
  return JobStateStore.resolveId(prefix);
}

/**
 * List all valid job states from the jobs directory.
 * Skips malformed files and logs them to stderr.
 * @deprecated Use JobStateStore.list() instead.
 */
export async function listJobStates(): Promise<JobState[]> {
  return JobStateStore.list();
}
