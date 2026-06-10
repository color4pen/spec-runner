/**
 * Minimal completion result reported by the agent via report_result tool.
 * ok: true  = normal completion
 * ok: false = agent's voluntary failure declaration (with reason)
 */
export interface BaseReportResult {
  ok: boolean;
  reason?: string;
}

/** Severity levels for findings reported by judge steps. */
export type FindingSeverity = "critical" | "high" | "medium" | "low";

/** Resolution classification for a finding. */
export type FindingResolution = "fixable" | "decision-needed";

/**
 * A single finding reported by a judge agent via the report_result findings array.
 * Represents a single identified issue with severity, resolution, and location.
 */
export interface Finding {
  severity: FindingSeverity;
  resolution: FindingResolution;
  /** Worktree-relative file path where the issue was found. */
  file: string;
  /** Optional line number within the file. */
  line?: number;
  /** Short title / summary of the finding. */
  title: string;
  /** Rationale explaining why this is an issue. */
  rationale: string;
}
