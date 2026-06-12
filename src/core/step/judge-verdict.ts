/**
 * Pure verdict derivation functions for judge steps.
 *
 * Design: agent 判断を「finding 単位のラベル付け」に限定し、verdict の集計を
 * CLI の決定的な関数に移すことで findings と verdict の不整合を構造的に排除する。
 *
 * All functions are pure (no side effects, no I/O).
 */
import type { Finding, FixTarget } from "../../kernel/report-result.js";
export type { FindingRef } from "../port/runtime-strategy.js";

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
 * Derive the judge verdict from findings and ok flag.
 *
 * Priority order:
 * 1. ok=false → escalation (voluntary failure takes precedence over findings)
 * 2. decision-needed ≥ 1 → escalation
 * 3. critical|high ≥ 1 → needs-fix
 * 4. else → approved
 */
export function deriveJudgeVerdict(
  findings: Finding[],
  ok: boolean,
): "approved" | "needs-fix" | "escalation" {
  if (!ok) return "escalation";
  if (findings.some((f) => f.resolution === "decision-needed")) return "escalation";
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
 * Derive the conformance verdict from findings and ok flag.
 *
 * Extends deriveJudgeVerdict: when the base verdict is "needs-fix", the
 * target step is derived from finding fixTarget values via aggregateFixTarget.
 *
 * Returns:
 *   "approved"                — all items pass
 *   "escalation"              — ok=false or decision-needed findings
 *   "needs-fix:implementer"   — missing/incomplete implementation
 *   "needs-fix:code-fixer"    — local code non-conformity
 *   "needs-fix:spec-fixer"    — spec/design error
 */
export function deriveConformanceVerdict(
  findings: Finding[],
  ok: boolean,
): "approved" | "escalation" | "needs-fix:implementer" | "needs-fix:code-fixer" | "needs-fix:spec-fixer" {
  const base = deriveJudgeVerdict(findings, ok);
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
 * Derive the request-review verdict from findings and ok flag.
 *
 * Blocking finding: severity critical/high OR resolution decision-needed.
 *
 * Priority order:
 * 1. ok=false → needs-discussion
 * 2. blocking ≥ 1 → needs-discussion
 * 3. else → approve
 *
 * Note: "reject" is not derived — pipeline routes needs-discussion and reject
 * identically (both escalate), so agen-declared reject labeling has no routing value.
 */
export function deriveRequestReviewVerdict(
  findings: Finding[],
  ok: boolean,
): "approve" | "needs-discussion" {
  if (!ok) return "needs-discussion";
  const hasBlocking = findings.some(
    (f) =>
      f.severity === "critical" ||
      f.severity === "high" ||
      f.resolution === "decision-needed",
  );
  return hasBlocking ? "needs-discussion" : "approve";
}
