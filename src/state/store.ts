import * as fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import { randomUUID } from "node:crypto";
import { getJobsDir, getJobStatePath } from "../util/xdg.js";
import { atomicWriteJson } from "../util/atomic-write.js";
import { validateJobState } from "./schema.js";
import type { JobState, RequestInfo, RepositoryInfo } from "./schema.js";
import { stderrWrite } from "../logger/stdout.js";
import { SpecRunnerError, ERROR_CODES } from "../errors.js";

/**
 * Create a new job state file and persist it.
 * request.slug defaults to null if not provided (backward compat for tests).
 */
export async function createJobState(params: {
  request: RequestInfo;
  repository: RepositoryInfo;
}): Promise<JobState> {
  const jobId = randomUUID();
  const now = new Date().toISOString();
  const state: JobState = {
    version: 1,
    jobId,
    createdAt: now,
    updatedAt: now,
    request: { ...params.request, slug: params.request.slug !== undefined ? params.request.slug : null },
    repository: params.repository,
    session: null,
    step: "init",
    status: "running",
    branch: null,
    history: [
      {
        ts: now,
        step: "init",
        status: "started",
        message: "job created",
      },
    ],
    error: null,
  };

  const filePath = getJobStatePath(state.jobId);
  await atomicWriteJson(filePath, state);
  return state;
}

/**
 * Load a single job state by jobId.
 * Throws JOB_NOT_FOUND if the file does not exist.
 * Throws STATE_FILE_INVALID if the file cannot be parsed.
 */
export async function loadJobState(jobId: string): Promise<JobState> {
  const filePath = getJobStatePath(jobId);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new SpecRunnerError(
        ERROR_CODES.JOB_NOT_FOUND,
        "Run 'specrunner ps' to list available job IDs.",
        `Job not found: ${jobId}`,
      );
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new SpecRunnerError(
      ERROR_CODES.STATE_FILE_INVALID,
      "Delete the corrupted file and re-run specrunner.",
      `State file invalid at ${filePath}: Failed to parse JSON.`,
    );
  }

  try {
    return validateJobState(parsed);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
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
 */
export async function updateJobState(
  jobId: string,
  mutator: (state: JobState) => JobState,
): Promise<JobState> {
  const current = await loadJobState(jobId);
  const updated = mutator(current);
  const filePath = getJobStatePath(jobId);
  await atomicWriteJson(filePath, updated);
  return updated;
}

/**
 * Delete a job state file by jobId.
 * Idempotent: ENOENT is silently ignored.
 * Other errors are propagated.
 */
export async function deleteJobState(jobId: string): Promise<void> {
  const filePath = getJobStatePath(jobId);
  try {
    await fs.unlink(filePath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return; // already deleted — idempotent
    }
    throw err;
  }
}

/**
 * List all valid job states from the jobs directory.
 * Skips malformed files and logs them to stderr.
 */
export async function listJobStates(): Promise<JobState[]> {
  const jobsDir = getJobsDir();

  let entries: Dirent[];
  try {
    entries = await fs.readdir(jobsDir, { withFileTypes: true });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw err;
  }

  const jsonFiles = entries.filter(
    (e) => e.isFile() && e.name.endsWith(".json") && !e.name.includes(".tmp."),
  );

  const states: JobState[] = [];
  for (const entry of jsonFiles) {
    const filePath = `${jobsDir}/${entry.name}`;
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      const state = validateJobState(parsed);
      states.push(state);
    } catch {
      stderrWrite(`Skipping malformed file: ${filePath}`);
    }
  }

  return states;
}
