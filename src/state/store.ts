import * as fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import { randomUUID } from "node:crypto";
import { getJobsDir, getJobStatePath } from "../util/xdg.js";
import { atomicWriteJson } from "../util/atomic-write.js";
import { validateJobState } from "./schema.js";
import type { JobState, RequestInfo, RepositoryInfo } from "./schema.js";
import { stderrWrite } from "../logger/stdout.js";

/**
 * Create a new job state file and persist it.
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
    request: params.request,
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
