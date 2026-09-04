/**
 * Frozen case ID registry for the provider lifecycle parity contract suite.
 *
 * THIS ARRAY IS THE CANONICAL SOURCE OF TRUTH FOR REQUIRED CASE IDs.
 * It is written by hand and MUST NOT be derived from the case table.
 * The coverage ratchet (contract-ratchet.test.ts) checks that the case
 * table's ID set equals this array exactly — neither a subset nor a superset.
 *
 * Adding a case: append its ID here AND add a matching entry in case-table.ts.
 * Removing a case: remove from BOTH files. Removing from only one fails the ratchet.
 *
 * No imports — this file is a leaf node so the dependency graph stays acyclic.
 */

// No imports in this file (including type imports) — the ratchet enforces this.

export const LIFECYCLE_AREAS = [
  "main-work",
  "report",
  "post-work",
  "output-repair",
  "transient",
  "timeout",
  "context",
  "metrics",
  "completion-error",
] as const;

export type LifecycleArea = (typeof LIFECYCLE_AREAS)[number];

export const CONTRACT_PROVIDERS = ["claude-code", "codex"] as const;

export type ContractProvider = (typeof CONTRACT_PROVIDERS)[number];

/**
 * The 31 required case IDs for the provider lifecycle parity contract.
 *
 * Each ID has the form "<area>.<scenario>".
 * The area prefix must be one of LIFECYCLE_AREAS.
 * IDs are unique — duplicates are caught by the ratchet.
 */
export const REQUIRED_CASE_IDS = [
  "main-work.success-minimal",
  "main-work.result-file-content",
  "report.first-turn-success",
  "report.follow-up-recovers",
  "report.follow-up-budget-exhausted",
  "report.settle-on-abort-with-captured-report",
  "report.parse-failure-diagnostics",
  "post-work.single-prompt-adds-turn",
  "post-work.excluded-from-follow-up-attempts",
  "output-repair.violation-then-clean",
  "output-repair.budget-exhausted",
  "output-repair.detect-failure-skips-loop",
  "transient.retry-then-success",
  "transient.budget-exhausted",
  "transient.non-transient-not-retried",
  "transient.disabled-omits-attempts-field",
  "timeout.inactivity-watchdog",
  "timeout.wall-clock-step-timeout",
  "timeout.abort-not-retried",
  "context.exhaustion-typed-error",
  "context.rollover-recovers-in-fresh-session",
  "context.rollover-budget-exhausted",
  "metrics.model-usage-populated",
  "metrics.invocation-metrics-presence",
  "metrics.context-metrics-presence",
  "metrics.touched-files-presence",
  "metrics.added-turns-invariant",
  "metrics.session-rollovers-absent-without-rollover",
  "completion-error.generic-sdk-failure-code",
  "completion-error.result-file-not-found",
  "completion-error.success-field-coherence",
] as const;

export type RequiredCaseId = (typeof REQUIRED_CASE_IDS)[number];
