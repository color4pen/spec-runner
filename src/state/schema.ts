/**
 * Job state schema and types for specrunner state files.
 */

export type JobStatus = "running" | "success" | "failed" | "terminated";

export type StepName = "propose" | "spec-review" | "spec-fixer";

export type Verdict = "approved" | "needs-fix" | "escalation";

export interface HistoryEntry {
  ts: string;
  step: string;
  status: "started" | "ok" | "error" | "warning";
  message: string;
}

export interface SessionInfo {
  id: string;
  agentId: string;
  environmentId: string;
}

export interface RequestInfo {
  path: string;
  title: string;
  type: string;
}

export interface RepositoryInfo {
  owner: string;
  name: string;
}

export interface ErrorInfo {
  code: string;
  message: string;
  hint: string;
}

export interface StepResult {
  /** 1-origin iteration number within the step. Auto-assigned by pushStepResult. */
  iteration: number;
  session: SessionInfo | null;
  verdict: Verdict | null;
  findingsPath: string | null;
  completedAt: string | null;
  error: ErrorInfo | null;
  /** Raw file content for the step result file (e.g. spec-review-result.md). Optional. */
  fileContent?: string | null;
}

export interface JobState {
  version: 1;
  jobId: string;
  createdAt: string;
  updatedAt: string;
  request: RequestInfo;
  repository: RepositoryInfo;
  session: SessionInfo | null;
  step: string;
  status: JobStatus;
  branch: string | null;
  history: HistoryEntry[];
  error: ErrorInfo | null;
  /** Step-level results journal (array per step for iteration tracking). Optional for backward compat with v1 files. */
  steps?: Record<string, StepResult[]>;
}

export const MAX_HISTORY_SIZE = 100;

/**
 * Append a history entry to a job state (pure transform — returns new state).
 * Truncates oldest entries when history exceeds MAX_HISTORY_SIZE.
 */
export function appendHistoryEntry(state: JobState, entry: HistoryEntry): JobState {
  const history = [...state.history, entry];
  if (history.length > MAX_HISTORY_SIZE) {
    history.splice(0, history.length - MAX_HISTORY_SIZE);
  }
  return {
    ...state,
    history,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Normalize a steps record: convert any legacy object-form step results to arrays.
 * This handles backward compatibility with pre-array-format state files.
 */
function normalizeSteps(steps: unknown): Record<string, StepResult[]> {
  if (typeof steps !== "object" || steps === null) {
    return {};
  }
  const result: Record<string, StepResult[]> = {};
  for (const [key, value] of Object.entries(steps as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      // Already array form — use as-is (ensure iteration field exists)
      result[key] = (value as StepResult[]).map((item, idx) => {
        if (item.iteration != null) return item;
        return { ...item, iteration: idx + 1 };
      });
    } else if (typeof value === "object" && value !== null) {
      // Legacy object form — wrap in array with iteration=1
      result[key] = [{ iteration: 1, ...(value as Omit<StepResult, "iteration">) }];
    }
  }
  return result;
}

/**
 * Validate that a raw parsed object is a valid JobState.
 * Returns the typed state or throws describing the invalid field.
 * Backward compat: missing `steps` field is filled with `{}`.
 * Backward compat: steps entries that are plain objects are normalized to arrays.
 */
export function validateJobState(raw: unknown): JobState {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("State must be a JSON object.");
  }
  const obj = raw as Record<string, unknown>;

  if (obj["version"] !== 1) throw new Error("State version must be 1.");
  if (typeof obj["jobId"] !== "string" || obj["jobId"].length === 0) {
    throw new Error("Missing required field: jobId.");
  }
  if (typeof obj["createdAt"] !== "string") {
    throw new Error("Missing required field: createdAt.");
  }
  if (typeof obj["updatedAt"] !== "string") {
    throw new Error("Missing required field: updatedAt.");
  }
  if (typeof obj["request"] !== "object" || obj["request"] === null) {
    throw new Error("Missing required field: request.");
  }
  if (typeof obj["repository"] !== "object" || obj["repository"] === null) {
    throw new Error("Missing required field: repository.");
  }
  if (typeof obj["step"] !== "string") {
    throw new Error("Missing required field: step.");
  }
  if (typeof obj["status"] !== "string") {
    throw new Error("Missing required field: status.");
  }
  if (!Array.isArray(obj["history"])) {
    throw new Error("Missing required field: history.");
  }

  // Backward compat: fill missing steps field with empty object, and normalize legacy object-form steps
  obj["steps"] = normalizeSteps(obj["steps"]);

  return raw as JobState;
}

