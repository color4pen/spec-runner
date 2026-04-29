/**
 * Job state schema and types for specrunner state files.
 */

export type JobStatus = "running" | "success" | "failed" | "terminated";

export type StepName = "propose" | "spec-review";

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
  /** Step-level results journal. Optional for backward compat with v1 files. */
  steps?: Record<string, StepResult>;
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
 * Validate that a raw parsed object is a valid JobState.
 * Returns the typed state or throws describing the invalid field.
 * Backward compat: missing `steps` field is filled with `{}`.
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

  // Backward compat: fill missing steps field with empty object
  if (obj["steps"] === undefined || obj["steps"] === null) {
    obj["steps"] = {};
  }

  return raw as JobState;
}

/**
 * Append (merge-update) step result info into state.steps for the given step name.
 * Returns a new state object (pure transform — does not persist).
 */
export function appendStepResult(
  state: JobState,
  stepName: StepName,
  partial: Partial<StepResult>,
): JobState {
  const existing = state.steps?.[stepName] ?? {
    session: null,
    verdict: null,
    findingsPath: null,
    completedAt: null,
    error: null,
  };
  return {
    ...state,
    steps: {
      ...state.steps,
      [stepName]: {
        ...existing,
        ...partial,
      },
    },
    updatedAt: new Date().toISOString(),
  };
}
