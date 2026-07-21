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
 * A single option presented alongside a `decision-needed` finding.
 * Reviewers MUST provide at least two options for any `decision-needed` finding.
 * If a reviewer cannot articulate two viable options, the issue is `fixable`, not `decision-needed`.
 */
export interface DecisionOption {
  /** Short label identifying this option (e.g. "Option A: keep current approach"). */
  label: string;
  /** Description of the consequence if this option is chosen. */
  consequence: string;
}

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
  /**
   * Structured options for `resolution: "decision-needed"` findings.
   * New tool calls MUST include at least two options; legacy persisted findings may omit this field.
   * Each option has a `label` and `consequence` to help the human make an informed choice.
   */
  options?: DecisionOption[];
  /**
   * Optional discriminator indicating the origin of this finding.
   *
   * absent = in-scope = 現行 (existing behavior — no change)
   * "scope" = this finding was derived from a scope boundary check (machine or semantic source)
   *
   * Coarse — carries only "scope-derived vs not"; detailed reasons go in `rationale`.
   * Additive and backward-compatible: absent origin is treated identically to all
   * pre-existing behavior.
   */
  origin?: "scope";
}

/**
 * Verification-volume counts reported by judge steps via report_result.
 * Used to detect vacuous completions where no items were actually verified.
 */
export interface Evidence {
  /** Number of items actually verified (files read, scenarios traced, requirements checked). */
  checked: number;
  /** Number of in-scope items that were NOT verified. */
  skipped: number;
  /** Number of items that could not be verified and are declared unconfirmed. */
  unverified: number;
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
