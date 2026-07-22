/**
 * Pure verdict derivation functions for judge steps.
 *
 * Design: agent 判断を「finding 単位のラベル付け」に限定し、verdict の集計を
 * CLI の決定的な関数に移すことで findings と verdict の不整合を構造的に排除する。
 *
 * All functions are pure (no side effects, no I/O).
 */
import type { Finding, FixTarget, Evidence } from "../../kernel/report-result.js";
import {
  selectUnroutableCanonFindings,
  judgeEffectiveFixer,
  conformanceEffectiveFixer,
  type CanonWriteScope,
} from "./canon-escalation.js";
export type { FindingRef } from "../port/runtime-strategy.js";
export type { CanonWriteScope } from "./canon-escalation.js";

/**
 * Collect findings that affect verdict routing.
 * Returns findings that are severity critical/high OR resolution decision-needed.
 * These are the findings that trigger non-approved verdicts.
 */
export function collectVerdictAffectingFindings(findings: Finding[]): Finding[] {
  return findings.filter(
    (f) => f.severity === "critical" || f.severity === "high" || f.resolution === "decision-needed",
  );
}

/**
 * Derive the judge verdict from findings, ok flag, and optional evidence.
 *
 * Priority order:
 * 1. ok=false → escalation (voluntary failure takes precedence over findings)
 * 2. evidence present && checked === 0 → escalation (vacuous check: no items verified)
 * 3. decision-needed ≥ 1 → escalation
 * 4. critical|high ≥ 1 → needs-fix
 * 5. else → approved
 *
 * When evidence is undefined (legacy path), the vacuous check is skipped and
 * derivation follows the pre-evidence rules (backward compatible).
 */
export function deriveJudgeVerdict(
  findings: Finding[],
  ok: boolean,
  evidence?: Evidence,
  canonScope?: CanonWriteScope,
): "approved" | "needs-fix" | "escalation" {
  if (!ok) return "escalation";
  if (evidence !== undefined && evidence.checked === 0) return "escalation"; // vacuous check
  if (findings.some((f) => f.resolution === "decision-needed")) return "escalation";
  // R1: canon-finding escalation — insert before critical|high → needs-fix
  if (canonScope && selectUnroutableCanonFindings(findings, canonScope, judgeEffectiveFixer).length > 0) {
    return "escalation";
  }
  if (findings.some((f) => f.severity === "critical" || f.severity === "high")) return "needs-fix";
  return "approved";
}

/**
 * Aggregate fixTarget from a set of verdict-affecting findings.
 *
 * Priority: spec-fixer > implementer > code-fixer
 * Rationale: spec/design errors invalidate downstream fixes, so spec-fixer takes
 * precedence. implementer handles missing implementation; code-fixer handles
 * local code non-conformities.
 *
 * Findings without fixTarget default to "implementer".
 */
export function aggregateFixTarget(findings: Finding[]): FixTarget {
  const relevant = findings.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  );

  // Collect unique targets (default missing to "implementer")
  const targets = new Set<FixTarget>(relevant.map((f) => f.fixTarget ?? "implementer"));

  // Apply priority: spec-fixer > implementer > code-fixer
  if (targets.has("spec-fixer")) return "spec-fixer";
  if (targets.has("implementer")) return "implementer";
  return "code-fixer";
}

/**
 * Derive the conformance verdict from findings, ok flag, and optional evidence.
 *
 * Extends deriveJudgeVerdict: when the base verdict is "needs-fix", the
 * target step is derived from finding fixTarget values via aggregateFixTarget.
 *
 * evidence is forwarded to deriveJudgeVerdict — when checked=0, returns "escalation"
 * before fixTarget aggregation (vacuous check precedes fixTarget routing).
 *
 * Returns:
 *   "approved"                — all items pass
 *   "escalation"              — ok=false, checked=0, or decision-needed findings
 *   "needs-fix:implementer"   — missing/incomplete implementation
 *   "needs-fix:code-fixer"    — local code non-conformity
 *   "needs-fix:spec-fixer"    — spec/design error
 */
export function deriveConformanceVerdict(
  findings: Finding[],
  ok: boolean,
  evidence?: Evidence,
  canonScope?: CanonWriteScope,
): "approved" | "escalation" | "needs-fix:implementer" | "needs-fix:code-fixer" | "needs-fix:spec-fixer" {
  // Call deriveJudgeVerdict WITHOUT canonScope (conformance uses conformanceEffectiveFixer, not judgeEffectiveFixer)
  const base = deriveJudgeVerdict(findings, ok, evidence);
  if (base === "escalation") return base;

  // R1: canon-finding escalation using conformanceEffectiveFixer
  if (canonScope && selectUnroutableCanonFindings(findings, canonScope, conformanceEffectiveFixer).length > 0) {
    return "escalation";
  }

  if (base !== "needs-fix") return base;

  const target = aggregateFixTarget(findings);
  return `needs-fix:${target}`;
}

/**
 * Collect fixable findings for approved-route routing purposes.
 * Returns findings where resolution === "fixable".
 *
 * At the approved verdict point, critical/high and decision-needed findings do not exist
 * (they would have triggered needs-fix or escalation). Therefore the returned set is
 * effectively low/medium fixable findings — candidates for the observation-fix pass via
 * code-fixer before conformance.
 *
 * Pure function — no side effects, no I/O.
 */
export function collectFixableFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.resolution === "fixable");
}

/**
 * Derive the verdict for regression-gate steps.
 *
 * Unlike deriveJudgeVerdict, ANY fixable finding (regardless of severity) triggers needs-fix.
 * Rationale: the regression-gate ledger exclusively contains previously-fixed findings that
 * regressed; any regression (even low/medium severity) must be re-fixed.
 *
 * The vacuous check applies here as in deriveJudgeVerdict: the gate only runs when the
 * findings ledger is non-empty, so a checked=0 report means the agent verified none of the
 * ledger items — approving would leave regressions unchecked.
 *
 * Priority order:
 * 1. ok=false → escalation
 * 2. evidence present && checked === 0 → escalation (vacuous check: no ledger items verified)
 * 3. decision-needed ≥ 1 → escalation
 * 4. fixable ≥ 1 → needs-fix (any severity, including medium/low)
 * 5. else → approved
 */
export function deriveRegressionGateVerdict(
  findings: Finding[],
  ok: boolean,
  evidence?: Evidence,
  canonScope?: CanonWriteScope,
): "approved" | "needs-fix" | "escalation" {
  if (!ok) return "escalation";
  if (evidence !== undefined && evidence.checked === 0) return "escalation"; // vacuous check
  if (findings.some((f) => f.resolution === "decision-needed")) return "escalation";
  // R1: canon-finding escalation — insert before fixable → needs-fix
  if (canonScope && selectUnroutableCanonFindings(findings, canonScope, judgeEffectiveFixer).length > 0) {
    return "escalation";
  }
  if (findings.some((f) => f.resolution === "fixable")) return "needs-fix";
  return "approved";
}

/**
 * Derive the request-review verdict from findings, ok flag, and optional evidence.
 *
 * Blocking finding: severity critical/high OR resolution decision-needed.
 *
 * Priority order:
 * 1. ok=false → needs-discussion (voluntary failure, highest priority)
 * 2. evidence present && checked === 0 → needs-discussion (vacuous check: no items verified)
 * 3. blocking ≥ 1 → needs-discussion
 * 4. else → approve
 *
 * When evidence is undefined (legacy path), the vacuous check is skipped and
 * derivation follows the pre-evidence rules (backward compatible).
 *
 * Note: "reject" is not derived — pipeline routes needs-discussion and reject
 * identically (both escalate), so agent-declared reject labeling has no routing value.
 */
export function deriveRequestReviewVerdict(
  findings: Finding[],
  ok: boolean,
  evidence?: Evidence,
): "approve" | "needs-discussion" {
  if (!ok) return "needs-discussion";
  if (evidence !== undefined && evidence.checked === 0) return "needs-discussion"; // vacuous check
  const hasBlocking = findings.some(
    (f) =>
      f.severity === "critical" ||
      f.severity === "high" ||
      f.resolution === "decision-needed",
  );
  return hasBlocking ? "needs-discussion" : "approve";
}
