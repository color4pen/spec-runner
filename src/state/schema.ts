/**
 * Job state schema and types for specrunner state files.
 */

export type JobStatus = "running" | "awaiting-resume" | "awaiting-archive" | "failed" | "terminated" | "archived" | "canceled";

import type { ModelUsage } from "../kernel/model-usage.js";
import type { BaseReportResult, Finding, Observation, DecisionOption, FindingSeverity } from "../kernel/report-result.js";
import type { CompletionReportDiagnostic } from "../kernel/completion-report-diagnostic.js";
import type { AgentStepName as AgentStepNameUnion } from "../kernel/agent-definition.js";
import type { ReviewerSnapshot, ReviewerStatus } from "../kernel/reviewer-snapshot.js";
export type { ReviewerStatus } from "../kernel/reviewer-snapshot.js";
/**
 * Re-export from canonical location in the kernel layer.
 * Both the port layer and state layer reference this single definition.
 */
export type { ModelUsage } from "../kernel/model-usage.js";

import { AGENT_STEP_NAMES, CLI_STEP_NAMES } from "../kernel/step-names.js";

/**
 * StepName: extended to string to support arbitrary step names in records.
 * Whitelist enforcement (standard pipeline steps) is done by isStandardStepName()
 * in core/step/step-names.ts. The STEP_NAMES / AGENT_STEP_NAMES / CLI_STEP_NAMES
 * arrays remain the single source of truth for standard pipeline step names.
 */
export type StepName = string;

/**
 * AgentStepName: names of steps that run as AI agent sessions.
 * Derived from AGENT_STEP_NAMES whitelist — new steps must be added to the appropriate array.
 */
export type AgentStepName = typeof AGENT_STEP_NAMES[number];

// ---------------------------------------------------------------------------
// Compile-time sync guard: AGENT_STEP_NAMES (kernel/step-names.ts) ↔ AgentStepName (kernel/agent-definition.ts)
//
// Enforces bidirectional consistency between the runtime array and the literal
// union.  If either side is updated without updating the other, `tsc` fails here.
// To fix: update AGENT_STEP_NAMES in kernel/step-names.ts AND AgentStepName in
// kernel/agent-definition.ts so both sides contain exactly the same step names.
//
// Technique: Exclude<A, B> extends never — non-distributive check that catches
// values present in A but absent in B (and vice versa for the reverse direction).
// ---------------------------------------------------------------------------
type _AssertNever<T extends never> = T;
// Direction 1: array → union (catches values in AGENT_STEP_NAMES not in AgentStepName)
type _AgentStepExtraInArray = _AssertNever<Exclude<typeof AGENT_STEP_NAMES[number], AgentStepNameUnion>>;
// Direction 2: union → array (catches values in AgentStepName not in AGENT_STEP_NAMES)
type _AgentStepExtraInUnion = _AssertNever<Exclude<AgentStepNameUnion, typeof AGENT_STEP_NAMES[number]>>;

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
  | "error"
  | "skipped";

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
  /** Base branch for this request (e.g. "main", "develop").
   * Set from request.md base-branch at job start.
   * Optional for backward compat — absent in legacy state files.
   * When absent, escalation notifications fall back to "main". */
  baseBranch?: string | null;
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
  verdict: Verdict | string | null;
  findingsPath: string | null;
  error: ErrorInfo | null;
  /**
   * Result reported by the agent via report_result tool call.
   * null = tool was not called. undefined = field absent (legacy records).
   * Added in tool-driven-step-completion.
   * Widened to include findings and observations arrays for judge steps.
   */
  toolResult?: (BaseReportResult & { findings?: Finding[]; observations?: Observation[] }) | null;
  /**
   * Number of follow-up retry attempts made to get the agent to call report_result.
   * 0 = the agent called the tool on the first turn (or feature not applicable).
   * Added in tool-driven-step-completion.
   */
  followUpAttempts?: number;
  /**
   * Number of transient-error auto-retry attempts made before this step succeeded
   * or the retry budget was exhausted.
   * 0 = no retries needed. Absent when feature was disabled (maxRetries: 0).
   * Added in transient-error-auto-retry.
   */
  transientRetryAttempts?: number;
  /**
   * Human-readable reason for a skipped verdict.
   * Only present when verdict === "skipped".
   * Documents which activation condition was not satisfied.
   */
  skipReason?: string;
  /**
   * Diagnostics from failed completion-report extraction attempts (Codex adapter only).
   * Adapter-populated; absent on success.
   * Added in codex-completion-contract-injection.
   */
  completionReportDiagnostics?: CompletionReportDiagnostic[];
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
  verdict: Verdict | string | null;
  findingsPath: string | null;
  completedAt: string | null;
  error: ErrorInfo | null;
}

export interface PullRequestInfo {
  url: string;
  number: number;
  createdAt: string;
}

/**
 * A snapshot of a finding stored in the decision ledger.
 * Captures the fields that identify and describe the finding at the time of the decision.
 */
export interface DecisionFindingSnapshot {
  title: string;
  file: string;
  line?: number;
  rationale: string;
  severity: FindingSeverity;
  options?: DecisionOption[];
}

/**
 * A single selected option recorded in the decision ledger.
 */
export interface DecisionSelectedOption {
  /** 1-based index of the selected option within the finding's options array. */
  number: number;
  label: string;
  consequence: string;
}

/**
 * A recorded human decision for a `decision-needed` finding.
 * Persisted in `JobState.decisions` before the job resumes.
 * Verdict derivation uses the decision ledger to suppress re-escalation of already-decided findings.
 */
export interface DecisionRecord {
  /** Stable unique ID for this decision record (e.g. "decision-<ISO timestamp>-<counter>"). */
  id: string;
  /** Step that produced the decision-needed finding (e.g. "spec-review"). */
  step: string;
  /** Deterministic finding key derived from step, file, line, title, and rationale (normalized). */
  findingKey: string;
  /** Snapshot of the finding at the time the decision was made. */
  finding: DecisionFindingSnapshot;
  /** The option selected by the human. */
  selectedOption: DecisionSelectedOption;
  /** Raw /resume comment body or prose supplement when available. */
  resumeComment?: string;
  /** ISO 8601 timestamp when the decision was recorded. */
  decidedAt: string;
  /** How the decision was sourced. Currently always "issue-comment". */
  source: "issue-comment";
}

export interface JobState {
  /**
   * Schema version.
   * - 1: original version (pre-artifact-observability R5)
   * - 2: introduces lineage recording (journal-side) and arbitrary step name support.
   * Backward compat: version 1 state files are accepted and normalized to 2 on read
   * (validateJobState). New state files always write version 2 (buildInitialJobState).
   */
  version: 1 | 2;
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
  /**
   * Identifies which pipeline definition was used to execute this job.
   * Recorded at job creation; absent in legacy state files.
   * When missing, getPipelineId resolves to "standard".
   * Optional for backward compat — absent in legacy state is valid.
   */
  pipelineId?: string;
  resumePoint?: ResumePoint | null;
  /** PID of the process that set status to "running". Optional for backward compat. */
  pid?: number | null;
  /** ISO 8601 timestamp when the job was canceled. Set by `job cancel`. Optional. */
  canceledAt?: string;
  /**
   * Indicates this job was executed in no-worktree mode (--no-worktree flag).
   * Portable: written to state.json and readable by the archive command in a
   * separate process to skip worktree remove/prune.
   * Absent (undefined) means the job ran in normal worktree mode.
   */
  noWorktree?: boolean;
  /**
   * GitHub issue number this job is linked to via `--issue <number>`.
   * When set, terminal transitions (awaiting-resume / awaiting-archive) write
   * a comment to the linked issue via GitHubClient.createIssueComment.
   * Absent (undefined) means no issue is linked — notification is suppressed.
   * Optional for backward compat — absent in legacy state files is valid.
   */
  issueNumber?: number | null;
  /**
   * Crash-loop guard for inbox auto-recovery of orphaned running jobs.
   * - attempts: consecutive auto-recoveries with no progress since the last recovery.
   * - stepCount: total step-run count (Σ steps[*].length) observed at the last recovery,
   *   used as a progress fingerprint. When the current count differs, attempts resets to 0.
   * Optional for backward compat — absent/null in existing state files is valid.
   */
  staleRecovery?: { attempts: number; stepCount: number } | null;
  /**
   * Snapshot of custom reviewer definitions captured at job start.
   * Used by composeReviewerDescriptor to build the pipeline shape for this job.
   * Absent in legacy state files and jobs with no custom reviewers (treated as []).
   * Optional for backward compat.
   */
  reviewers?: ReviewerSnapshot[];
  /**
   * Human decision ledger — records of decisions made for `decision-needed` findings.
   * Verdict derivation uses this ledger to suppress re-escalation of already-decided findings.
   * Absent (undefined/null) in legacy state files → treated as an empty ledger (no decisions).
   * Optional for backward compat.
   */
  decisions?: DecisionRecord[];
  /**
   * Per-reviewer execution status records for custom reviewer parallel execution.
   *
   * Design D1 (reviewer-parallel-execution): tracks each reviewer's status
   * (pending / approved / skipped) and approvedAtCommit for invalidation.
   *
   * state.json projection で round-trip、event-journal threading 不要
   * (`reviewers` / `decisions` と同型の top-level フィールド)。
   *
   * Absent in jobs without custom reviewers and in legacy state files.
   * Optional for backward compat.
   */
  reviewerStatuses?: ReviewerStatus[];
}

/**
 * Maximum number of history entries shown in display/UI (e.g. job show).
 * Persistent storage (events.jsonl) retains the full journal without truncation (D4).
 * Display layer uses this cap to limit output.
 */
export const MAX_HISTORY_SIZE = 100;

/**
 * Append a history entry to a job state (pure transform — returns new state).
 * Design D4: no persistent truncation — the full history is retained in the journal.
 * Callers that need display truncation should apply cap at presentation time.
 */
export function appendHistoryEntry(state: JobState, entry: HistoryEntry): JobState {
  const history = [...state.history, entry];
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

  // Backward compat: accept version 1 (pre-R5) and normalize to 2 on read.
  // Version 2 introduces lineage recording (journal-side) and arbitrary step name support.
  // Versions other than 1 or 2 are rejected.
  if (obj["version"] !== 1 && obj["version"] !== 2) {
    throw new Error(`State version must be 1 or 2 (got ${JSON.stringify(obj["version"])}).`);
  }
  if (obj["version"] === 1) {
    obj["version"] = 2;
  }
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

  // Backward compat: remap legacy status="success" to "awaiting-archive"
  if (obj["status"] === "success") {
    obj["status"] = "awaiting-archive";
  }

  // Backward compat: remap legacy status="awaiting-merge" to "awaiting-archive"
  if (obj["status"] === "awaiting-merge") {
    obj["status"] = "awaiting-archive";
  }

  // Validate status is a known value
  const VALID_STATUSES: Set<string> = new Set([
    "running", "awaiting-resume", "awaiting-archive", "failed", "terminated", "archived", "canceled",
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

  // Validate issueNumber when present (backward compat: absence is OK)
  if ("issueNumber" in obj && obj["issueNumber"] !== null && obj["issueNumber"] !== undefined) {
    const n = obj["issueNumber"];
    if (typeof n !== "number" || !Number.isInteger(n) || n <= 0) {
      throw new Error("issueNumber must be a positive integer when present.");
    }
  }

  // Validate reviewers when present (backward compat: absence is OK → treated as [])
  if ("reviewers" in obj && obj["reviewers"] !== null && obj["reviewers"] !== undefined) {
    if (!Array.isArray(obj["reviewers"])) {
      throw new Error("reviewers must be an array when present.");
    }
    for (const r of obj["reviewers"] as unknown[]) {
      if (typeof r !== "object" || r === null) {
        throw new Error("Each entry in reviewers must be an object.");
      }
      const rObj = r as Record<string, unknown>;
      if (typeof rObj["name"] !== "string" || !rObj["name"]) {
        throw new Error("Each reviewer snapshot must have a non-empty string 'name'.");
      }
      if (typeof rObj["maxIterations"] !== "number") {
        throw new Error(`Reviewer snapshot "${rObj["name"]}" must have a numeric 'maxIterations'.`);
      }
      // Backward compat: paths/requestTypes are optional. When present must be arrays.
      if ("paths" in rObj && rObj["paths"] !== null && rObj["paths"] !== undefined) {
        if (!Array.isArray(rObj["paths"])) {
          throw new Error(`Reviewer snapshot "${rObj["name"]}" paths must be an array when present.`);
        }
      }
      if ("requestTypes" in rObj && rObj["requestTypes"] !== null && rObj["requestTypes"] !== undefined) {
        if (!Array.isArray(rObj["requestTypes"])) {
          throw new Error(`Reviewer snapshot "${rObj["name"]}" requestTypes must be an array when present.`);
        }
      }
    }
  }

  // Validate reviewerStatuses when present (backward compat: absence is OK → treated as undefined)
  // Design D1 (reviewer-parallel-execution): lightweight check — array with name + status per entry.
  if ("reviewerStatuses" in obj && obj["reviewerStatuses"] !== null && obj["reviewerStatuses"] !== undefined) {
    if (!Array.isArray(obj["reviewerStatuses"])) {
      throw new Error("reviewerStatuses must be an array when present.");
    }
    const VALID_REVIEWER_STATUSES: Set<string> = new Set(["pending", "approved", "skipped"]);
    for (const rs of obj["reviewerStatuses"] as unknown[]) {
      if (typeof rs !== "object" || rs === null) {
        throw new Error("Each entry in reviewerStatuses must be an object.");
      }
      const rsObj = rs as Record<string, unknown>;
      if (typeof rsObj["name"] !== "string" || !rsObj["name"]) {
        throw new Error("Each reviewerStatus entry must have a non-empty string 'name'.");
      }
      if (typeof rsObj["status"] !== "string" || !VALID_REVIEWER_STATUSES.has(rsObj["status"] as string)) {
        throw new Error(`reviewerStatus "${rsObj["name"]}" has invalid status: ${JSON.stringify(rsObj["status"])}. Must be "pending", "approved", or "skipped".`);
      }
    }
  }

  return raw as JobState;
}

