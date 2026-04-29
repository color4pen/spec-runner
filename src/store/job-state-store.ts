import * as fs from "node:fs/promises";
import { getJobStatePath } from "../util/xdg.js";
import { atomicWriteJson } from "../util/atomic-write.js";
import { appendHistoryEntry } from "../state/schema.js";
import type { JobState, StepRun, StepOutcome, ErrorInfo, HistoryEntry, JobStatus } from "../state/schema.js";

/**
 * Normalized view of a JobState with steps as StepRun[].
 * This is the type returned by JobStateStore after normalization.
 */
export type NormalizedJobState = Omit<JobState, "steps"> & {
  steps: Record<string, StepRun[]>;
};

// ---------------------------------------------------------------------------
// Legacy schema detection helpers
// ---------------------------------------------------------------------------

/**
 * Detect if a step entry is a pre-PR24 single StepResult object (not an array).
 * Pre-PR24: `state.steps["propose"]` was a plain object, not an array.
 */
function isLegacySingleResult(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Detect if a step array element is a post-PR24 StepResult (has `iteration` or `session` object).
 * Post-PR24: array elements have `{ iteration, session: { id, agentId, environmentId }, verdict, ... }`
 */
function isStepResultShape(item: unknown): boolean {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  // StepResult has `verdict` at the top level and `session` as object or null
  // StepRun has `outcome.verdict` and `sessionId` (string)
  return (
    "verdict" in obj ||
    "iteration" in obj ||
    ("session" in obj && typeof obj["session"] !== "string")
  );
}

/**
 * Convert a legacy pre-PR24 single StepResult object into a StepRun.
 */
function normalizeSingleResultToStepRun(
  value: Record<string, unknown>,
  fallbackStartedAt: string,
): StepRun {
  const sessionId =
    typeof value["sessionId"] === "string"
      ? value["sessionId"]
      : typeof value["session"] === "object" && value["session"] !== null
        ? ((value["session"] as Record<string, unknown>)["id"] as string | null) ?? null
        : null;

  const verdict = (value["verdict"] as string | null) ?? null;
  const endedAt = (value["completedAt"] as string | null) ?? new Date().toISOString();

  const outcome: StepOutcome = {
    verdict: verdict as StepOutcome["verdict"],
    findingsPath: (value["findingsPath"] as string | null) ?? null,
    fileContent: (value["fileContent"] as string | null) ?? null,
    error: (value["error"] as ErrorInfo | null) ?? null,
  };

  return {
    attempt: 1,
    sessionId,
    outcome,
    startedAt: fallbackStartedAt,
    endedAt,
  };
}

/**
 * Convert a post-PR24 StepResult array element into a StepRun.
 */
function normalizeStepResultToStepRun(
  item: Record<string, unknown>,
  attempt: number,
  fallbackStartedAt: string,
): StepRun {
  const sessionId =
    typeof item["sessionId"] === "string"
      ? item["sessionId"]
      : typeof item["session"] === "object" && item["session"] !== null
        ? ((item["session"] as Record<string, unknown>)["id"] as string | null) ?? null
        : null;

  const verdict = (item["verdict"] as string | null) ?? null;
  const endedAt = (item["completedAt"] as string | null) ?? new Date().toISOString();

  const outcome: StepOutcome = {
    verdict: verdict as StepOutcome["verdict"],
    findingsPath: (item["findingsPath"] as string | null) ?? null,
    fileContent: (item["fileContent"] as string | null) ?? null,
    error: (item["error"] as ErrorInfo | null) ?? null,
  };

  return {
    attempt,
    sessionId,
    outcome,
    startedAt: fallbackStartedAt,
    endedAt,
  };
}

/**
 * Check whether an element already has the StepRun shape.
 */
function isStepRunShape(item: unknown): boolean {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  return "attempt" in obj && "outcome" in obj && "startedAt" in obj && "endedAt" in obj;
}

/**
 * Normalize a steps record from any legacy format into Record<string, StepRun[]>.
 *
 * Handles:
 *   1. Pre-PR24: `steps["propose"]` is a plain object → wrap in StepRun[]
 *   2. Post-PR24: `steps["spec-review"]` is StepResult[] → convert each to StepRun
 *   3. Current: already StepRun[] → pass through
 */
function normalizeStepsToStepRuns(
  stepsRaw: unknown,
  fallbackStartedAt: string,
): Record<string, StepRun[]> {
  if (typeof stepsRaw !== "object" || stepsRaw === null) {
    return {};
  }

  const result: Record<string, StepRun[]> = {};

  for (const [key, value] of Object.entries(stepsRaw as Record<string, unknown>)) {
    if (isLegacySingleResult(value)) {
      // Pre-PR24: plain object → StepRun[]
      result[key] = [
        normalizeSingleResultToStepRun(value as Record<string, unknown>, fallbackStartedAt),
      ];
    } else if (Array.isArray(value)) {
      // Array: may be StepResult[] (post-PR24) or StepRun[] (current)
      const runs: StepRun[] = value.map((item: unknown, idx: number) => {
        if (isStepRunShape(item)) {
          // Already StepRun
          return item as StepRun;
        }
        if (isStepResultShape(item)) {
          // Post-PR24 StepResult → StepRun
          return normalizeStepResultToStepRun(
            item as Record<string, unknown>,
            idx + 1,
            fallbackStartedAt,
          );
        }
        // Unknown shape — best effort passthrough as StepRun
        const obj = item as Record<string, unknown>;
        return {
          attempt: idx + 1,
          sessionId: null,
          outcome: {
            verdict: null,
            findingsPath: null,
            fileContent: null,
            error: null,
          },
          startedAt: fallbackStartedAt,
          endedAt: fallbackStartedAt,
          ...obj,
        } as StepRun;
      });
      result[key] = runs;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// JobStateStore class
// ---------------------------------------------------------------------------

/**
 * JobStateStore wraps the JSON state file with typed read/write operations.
 * It is the sole persistence authority for job state files.
 *
 * - load(): reads from disk, normalizes legacy schemas to StepRun[]
 * - persist(): atomically writes the current state
 * - appendStepRun(): appends a new StepRun and persists atomically
 */
export class JobStateStore {
  private readonly jobId: string;
  private readonly filePath: string;

  constructor(jobId: string) {
    this.jobId = jobId;
    this.filePath = getJobStatePath(jobId);
  }

  /**
   * Load and normalize a job state from disk.
   * Converts any legacy StepResult / plain-object format to StepRun[].
   */
  async load(): Promise<NormalizedJobState> {
    const raw = await fs.readFile(this.filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (parsed["version"] !== 1) {
      throw new Error("State version must be 1.");
    }

    const updatedAt = (parsed["updatedAt"] as string | undefined) ?? new Date().toISOString();
    const normalizedSteps = normalizeStepsToStepRuns(parsed["steps"], updatedAt);

    return {
      ...(parsed as unknown as JobState),
      steps: normalizedSteps,
    } as NormalizedJobState;
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
   * Mirrors the deprecated free function appendHistory() in state/store.ts.
   */
  async appendHistory(state: JobState, entry: HistoryEntry): Promise<JobState> {
    const updated = appendHistoryEntry(state, entry);
    await this.persist(updated);
    return updated;
  }

  /**
   * Update job state fields and persist atomically.
   * Mirrors the deprecated free function updateJobState() in state/store.ts.
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
   * Mirrors the deprecated free function failJobState() in state/store.ts.
   */
  async fail(
    state: JobState,
    errorInfo: ErrorInfo,
    step?: string,
  ): Promise<JobState> {
    const updated: JobState = {
      ...state,
      status: "failed" as JobStatus,
      updatedAt: new Date().toISOString(),
      error: errorInfo,
      step: step ?? state.step,
    };
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
