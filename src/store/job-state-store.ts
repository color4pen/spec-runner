import * as fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import { randomUUID } from "node:crypto";
import { getJobStatePath, getJobsDir } from "../util/xdg.js";
import { atomicWriteJson } from "../util/atomic-write.js";
import { appendHistoryEntry, validateJobState } from "../state/schema.js";
import type { JobState, StepRun, ErrorInfo, HistoryEntry, RequestInfo, RepositoryInfo } from "../state/schema.js";
import { transitionJob } from "../state/lifecycle.js";
import { stderrWrite } from "../logger/stdout.js";
import { SpecRunnerError, ERROR_CODES, ambiguousJobIdError } from "../errors.js";

/**
 * Normalized view of a JobState with steps as StepRun[].
 * This is the type returned by JobStateStore after normalization.
 */
export type NormalizedJobState = Omit<JobState, "steps"> & {
  steps: Record<string, StepRun[]>;
};

// ---------------------------------------------------------------------------
// JobStateStore class
// ---------------------------------------------------------------------------

/**
 * JobStateStore wraps the JSON state file with typed read/write operations.
 * It is the sole persistence authority for job state files.
 *
 * Static methods (class-level operations):
 * - create(): create a new job state and persist atomically
 * - delete(): delete a job state file (ENOENT idempotent)
 * - list(): list all valid job states from the jobs directory
 * - resolveId(): resolve a short prefix to a full jobId
 *
 * Instance methods (per-job operations):
 * - load(): read from disk, validate and normalize via validateJobState()
 * - persist(): atomically write the current state
 * - appendHistory(): append a history entry and persist
 * - update(): update fields and persist
 * - fail(): mark as failed and persist
 * - appendStepRun(): append a StepRun and persist
 * - getLatestStepRun(): return the most recent StepRun for a step
 */
export class JobStateStore {
  private readonly jobId: string;
  private readonly filePath: string;

  constructor(jobId: string, repoRoot: string) {
    this.jobId = jobId;
    this.filePath = getJobStatePath(repoRoot, jobId);
  }

  // -------------------------------------------------------------------------
  // Static methods
  // -------------------------------------------------------------------------

  /**
   * Create a new job state file and persist it atomically.
   * request.slug defaults to null if not provided (backward compat).
   */
  static async create(repoRoot: string, params: {
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
      request: {
        ...params.request,
        slug: params.request.slug !== undefined ? params.request.slug : null,
      },
      repository: params.repository,
      session: null,
      step: "init",
      status: "running",
      pid: process.pid,
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

    const filePath = getJobStatePath(repoRoot, state.jobId);
    await atomicWriteJson(filePath, state);
    return state;
  }

  /**
   * Delete a job state file by jobId.
   * Idempotent: ENOENT is silently ignored. Other errors propagate.
   */
  static async delete(repoRoot: string, jobId: string): Promise<void> {
    const filePath = getJobStatePath(repoRoot, jobId);
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
  static async list(repoRoot: string): Promise<JobState[]> {
    const jobsDir = getJobsDir(repoRoot);

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

  /**
   * Resolve a full job UUID from a prefix (short ID) or full UUID.
   *
   * - Full UUID (36 chars): returned as-is without calling list().
   * - Short prefix: calls list() and filters by startsWith(prefix).
   *   - 0 matches: throws JOB_NOT_FOUND
   *   - 1 match: returns the full UUID
   *   - 2+ matches: throws AMBIGUOUS_JOB_ID with candidate list in hint
   */
  static async resolveId(repoRoot: string, prefix: string): Promise<string> {
    // Full UUID v4 is exactly 36 characters (8-4-4-4-12 + 4 hyphens)
    if (prefix.length === 36) {
      return prefix;
    }

    const states = await JobStateStore.list(repoRoot);
    const matches = states.filter((s) => s.jobId.startsWith(prefix));

    if (matches.length === 0) {
      throw new SpecRunnerError(
        ERROR_CODES.JOB_NOT_FOUND,
        "Run 'specrunner ps' to list available job IDs.",
        `Job not found: no job ID starts with '${prefix}'`,
      );
    }

    if (matches.length === 1) {
      return matches[0]!.jobId;
    }

    throw ambiguousJobIdError(prefix, matches.map((s) => s.jobId));
  }

  // -------------------------------------------------------------------------
  // Instance methods
  // -------------------------------------------------------------------------

  /**
   * Load and validate a job state from disk.
   * Uses validateJobState() for normalization and backward compat:
   *   - legacy step formats normalized to StepRun[]
   *   - status "success" remapped to "awaiting-merge"
   *   - error.code "SESSION_TIMEOUT" remapped to "SESSION_TERMINATED"
   *   - missing slug defaulted to null
   *
   * Does NOT handle ENOENT — callers that require JOB_NOT_FOUND semantics
   * should wrap (e.g. the deprecated loadJobState() in state/store.ts).
   */
  async load(): Promise<NormalizedJobState> {
    const raw = await fs.readFile(this.filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const state = validateJobState(parsed);
    return state as NormalizedJobState;
  }

  /**
   * Atomically persist the state to disk.
   * Accepts both NormalizedJobState and plain JobState.
   */
  async persist(state: JobState): Promise<void> {
    await atomicWriteJson(this.filePath, state);
  }

  /**
   * Append a history entry and persist atomically.
   */
  async appendHistory(state: JobState, entry: HistoryEntry): Promise<JobState> {
    const updated = appendHistoryEntry(state, entry);
    await this.persist(updated);
    return updated;
  }

  /**
   * Update job state fields and persist atomically.
   */
  async update(
    state: JobState,
    patch: Partial<Omit<JobState, "version" | "jobId" | "createdAt">>,
  ): Promise<JobState> {
    const updated: JobState = {
      ...state,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.persist(updated);
    return updated;
  }

  /**
   * Mark a job as failed with error info and persist atomically.
   */
  async fail(
    state: JobState,
    errorInfo: ErrorInfo,
    step?: string,
  ): Promise<JobState> {
    const { state: updated } = transitionJob(state, "failed", {
      trigger: "store-fail",
      reason: errorInfo.message,
      patch: { error: errorInfo, step: step ?? state.step },
    });
    await this.persist(updated);
    return updated;
  }

  /**
   * Append a new StepRun to the given step's array and persist atomically.
   * Auto-assigns the attempt number as (existing.length + 1).
   */
  async appendStepRun(
    state: NormalizedJobState,
    stepName: string,
    run: Omit<StepRun, "attempt">,
  ): Promise<NormalizedJobState> {
    const existing = state.steps[stepName] ?? [];
    const attempt = existing.length + 1;
    const newRun: StepRun = { attempt, ...run };
    const updated: NormalizedJobState = {
      ...state,
      steps: {
        ...state.steps,
        [stepName]: [...existing, newRun],
      },
      updatedAt: new Date().toISOString(),
    };
    await this.persist(updated);
    return updated;
  }

  /**
   * Get the most recent StepRun for a given step.
   */
  getLatestStepRun(state: NormalizedJobState, stepName: string): StepRun | undefined {
    const runs = state.steps[stepName];
    if (!runs || runs.length === 0) return undefined;
    return runs[runs.length - 1];
  }
}
