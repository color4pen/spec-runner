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
 * Target step to route a conformance needs-fix finding to.
 * Used exclusively by the conformance step to signal which fixer should address each finding.
 * CLI aggregates these values to derive the final routing target (R7 contract).
 */
export type FixTarget = "implementer" | "code-fixer" | "spec-fixer";

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
  /**
   * Target step for conformance findings only.
   * When present, signals which fixer step should address this finding.
   * CLI aggregates fixTarget values from all critical/high findings to derive routing.
   * Absent for non-conformance judge steps.
   */
  fixTarget?: FixTarget;
}

/**
 * A single observation reported by a judge agent via the report_result observations array.
 *
 * Observations are informational records that do NOT affect verdict routing.
 * They represent noteworthy information that is not actionable — no fix is required,
 * no human decision is needed.
 *
 * Design:
 * - severity is for recording purposes only; it does NOT route to code-fixer,
 *   findings-ledger, or regression-gate. Verdict derivation reads only `findings`.
 * - `resolution` is intentionally absent — observations are never fixable or
 *   decision-needed by definition.
 */
export interface Observation {
  /** Severity for recording purposes only — NOT used for verdict routing or pipeline branching. */
  severity: FindingSeverity;
  /** Worktree-relative file path where the observation applies. */
  file: string;
  /** Optional line number within the file. */
  line?: number;
  /** Short title / summary of the observation. */
  title: string;
  /** Rationale explaining what was observed and why it is noteworthy. */
  rationale: string;
}
