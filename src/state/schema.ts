/**
 * Job state schema and types for specrunner state files.
 */

export type JobStatus = "running" | "awaiting-resume" | "awaiting-merge" | "failed" | "terminated" | "archived" | "canceled";

import type { ModelUsage } from "../core/port/model-usage.js";
import type { BaseReportResult } from "../core/port/report-result.js";
/**
 * Re-export from canonical location in the port layer.
 * Both the port layer and state layer reference this single definition.
 */
export type { ModelUsage } from "../core/port/model-usage.js";

import { AGENT_STEP_NAMES, CLI_STEP_NAMES, STEP_NAMES } from "../kernel/step-names.js";

export type StepName = typeof STEP_NAMES[keyof typeof STEP_NAMES];

/**
 * AgentStepName: names of steps that run as AI agent sessions.
 * Derived from AGENT_STEP_NAMES whitelist — new steps must be added to the appropriate array.
 */
export type AgentStepName = typeof AGENT_STEP_NAMES[number];

/**
 * CliStepName: names of steps that run as deterministic CLI processes.
 * Derived from CLI_STEP_NAMES whitelist.
 */
export type CliStepName = typeof CLI_STEP_NAMES[number];

export type Verdict =
  | "approved"
  | "needs-fix"
  | "escalation"
  | "passed"
  | "failed"
  | "success"
  | "error";

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
  /** Canonical slug for this request. Populated from pipeline-context.md at job start.
   * null for legacy state files or non-canonical paths (e.g. /tmp/...).
   * Optional for backward compat — absent in existing state files. */
  slug?: string | null;
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

export interface ResumePoint {
  step: StepName;
  reason: string;
  iterationsExhausted: number;
  /** Diagnostic: distinguishes "fixer ran to completion then review rejected" from "review exhausted before fixer max". */
  exhaustionPhase?: "review-after-final-fix" | "review-exhausted";
}

// ---------------------------------------------------------------------------
// StepRun — new schema (D1). Replaces StepResult[] in JobStateStore.
// ---------------------------------------------------------------------------

/**
 * Outcome of a single step execution.
 */
export interface StepOutcome {
  verdict: Verdict | null;
  findingsPath: string | null;
  /** Raw file content for the result file (e.g. spec-review-result.md). Optional. */
  fileContent?: string | null;
  error: ErrorInfo | null;
  /**
   * Result reported by the agent via report_result tool call.
   * null = tool was not called. undefined = field absent (legacy records).
   * Added in tool-driven-step-completion.
   */
  toolResult?: BaseReportResult | null;
  /**
   * Number of follow-up retry attempts made to get the agent to call report_result.
   * 0 = the agent called the tool on the first turn (or feature not applicable).
   * Added in tool-driven-step-completion.
   */
  followUpAttempts?: number;
}

/**
 * StepRun records a single execution attempt of a named step.
 * Replaces StepResult[] for new state files.
 */
export interface StepRun {
  /** 1-origin attempt number within this step. Auto-assigned. */
  attempt: number;
  sessionId: string | null;
  outcome: StepOutcome;
  /** ISO 8601 timestamp when this attempt started. */
  startedAt: string;
  /** ISO 8601 timestamp when this attempt ended. */
  endedAt: string;
  /**
   * Per-model token usage from the agent run.
   * Keys are model names (e.g. "claude-opus-4-6").
   * Only present for ClaudeCodeRunner steps; absent for ManagedAgentRunner and CLI steps.
   */
  modelUsage?: Record<string, ModelUsage>;
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

export interface PullRequestInfo {
  url: string;
  number: number;
  createdAt: string;
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
  steps?: Record<string, StepRun[]>;
  /** PR info recorded after pr-create step succeeds. Optional for backward compat with legacy state files. */
  pullRequest?: PullRequestInfo;
  /**
   * Path to the persistent git worktree created for this job (local runtime only).
   * Set at job start; cleared to null on finish.
   * Optional for backward compat — absent in legacy state files → treated as undefined.
   */
  worktreePath?: string | null;
  resumePoint?: ResumePoint | null;
  /** PID of the process that set status to "running". Optional for backward compat. */
  pid?: number | null;
  /** ISO 8601 timestamp when the job was canceled. Set by `job cancel`. Optional. */
  canceledAt?: string;
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
 * Normalize a steps record: convert any legacy format to StepRun[].
 * Handles:
 *   - Missing or null steps → {}
 *   - Pre-array (plain object per step) → [StepRun]
 *   - StepResult[] (iteration/session shape) → StepRun[]
 *   - StepRun[] (current shape) → StepRun[] (passthrough)
 */
function normalizeSteps(steps: unknown): Record<string, StepRun[]> {
  if (typeof steps !== "object" || steps === null) {
    return {};
  }
  const result: Record<string, StepRun[]> = {};
  const fallbackTs = new Date().toISOString();

  for (const [key, value] of Object.entries(steps as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      if (typeof value === "object" && value !== null) {
        // Pre-array: single plain object → wrap as StepRun with attempt=1
        result[key] = [legacyObjectToStepRun(value as Record<string, unknown>, 1, fallbackTs)];
      }
      continue;
    }

    // Array form: each element may be StepRun or legacy StepResult
    result[key] = (value as unknown[]).map((item, idx) => {
      if (typeof item !== "object" || item === null) return null;
      const obj = item as Record<string, unknown>;
      // StepRun has `attempt` + `outcome`; StepResult has `iteration` or `verdict` at top level
      if ("attempt" in obj && "outcome" in obj) {
        return obj as unknown as StepRun;
      }
      // Legacy StepResult shape
      return legacyObjectToStepRun(obj, idx + 1, fallbackTs);
    }).filter((r): r is StepRun => r !== null);
  }
  return result;
}

/**
 * Convert a legacy StepResult-shaped plain object to StepRun.
 */
function legacyObjectToStepRun(
  obj: Record<string, unknown>,
  attempt: number,
  fallbackTs: string,
): StepRun {
  const sessionId =
    typeof obj["sessionId"] === "string"
      ? obj["sessionId"]
      : typeof obj["session"] === "object" && obj["session"] !== null
        ? ((obj["session"] as Record<string, unknown>)["id"] as string | null) ?? null
        : null;
  const endedAt = (obj["completedAt"] as string | null) ?? fallbackTs;
  return {
    attempt,
    sessionId,
    outcome: {
      verdict: (obj["verdict"] as StepRun["outcome"]["verdict"]) ?? null,
      findingsPath: (obj["findingsPath"] as string | null) ?? null,
      fileContent: (obj["fileContent"] as string | null) ?? null,
      error: (obj["error"] as StepRun["outcome"]["error"]) ?? null,
    },
    startedAt: endedAt,
    endedAt,
  };
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
  // Backward compat: slug field absent in legacy state files → default to null
  {
    const req = obj["request"] as Record<string, unknown>;
    if (!("slug" in req)) {
      req["slug"] = null;
    }
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

  // Backward compat: worktreePath absent in legacy state files → treated as undefined (not an error)
  // No validation needed: the field is optional and null/string/undefined are all valid values.

  // Backward compat: on-read remap; mutates the parsed object so subsequent persists do not write SESSION_TIMEOUT.
  // Design D2: old state files with error.code === "SESSION_TIMEOUT" are remapped on read.
  if (
    typeof obj["error"] === "object" &&
    obj["error"] !== null &&
    (obj["error"] as Record<string, unknown>)["code"] === "SESSION_TIMEOUT"
  ) {
    (obj["error"] as Record<string, unknown>)["code"] = "SESSION_TERMINATED";
  }

  // Backward compat: remap legacy step="propose" to "design" (renamed in 2026-05)
  if (obj["step"] === "propose") {
    obj["step"] = "design";
  }

  // Backward compat: remap legacy status="success" to "awaiting-merge"
  // TODO: Remove this migration after 2026-06 release
  if (obj["status"] === "success") {
    obj["status"] = "awaiting-merge";
  }

  // Validate status is a known value
  const VALID_STATUSES: Set<string> = new Set([
    "running", "awaiting-resume", "awaiting-merge", "failed", "terminated", "archived", "canceled",
  ]);
  if (!VALID_STATUSES.has(obj["status"] as string)) {
    throw new Error(`Invalid status: ${obj["status"] as string}`);
  }

  // Validate resumePoint when present (backward compat: absence is OK)
  if ("resumePoint" in obj && obj["resumePoint"] !== null && obj["resumePoint"] !== undefined) {
    if (typeof obj["resumePoint"] !== "object") {
      throw new Error("resumePoint must be an object when present.");
    }
  }

  return raw as JobState;
}

