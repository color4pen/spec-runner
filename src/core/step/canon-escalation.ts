/**
 * Pure judgment module for canon-finding escalation routing.
 *
 * Determines whether a fixable finding on a protected canon path cannot be
 * legally written by its effective routing fixer, and therefore must be
 * escalated to the operator rather than routed to a fixer session.
 *
 * Leaf module: imports ONLY types from kernel/report-result.js.
 * No write-scope, no slug, no I/O dependencies.
 */
import type { Finding, FixTarget } from "../../kernel/report-result.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Write-scope configuration for canon-aware verdict derivation.
 *
 * Passed into verdict derivation functions so they remain pure (no I/O).
 * Constructed by buildCanonWriteScope (canon-write-scope.ts) at pipeline wiring points.
 */
export interface CanonWriteScope {
  /** Worktree-relative paths of all protected canon files for this slug. */
  canonPaths: ReadonlySet<string>;
  /**
   * Map from FixTarget to the set of canon paths that fixer is declared to write.
   * Paths not in this set (for a given fixer) are NOT legally writable by that fixer.
   */
  writableByFixer: ReadonlyMap<FixTarget, ReadonlySet<string>>;
}

// ---------------------------------------------------------------------------
// Effective fixer resolvers
// ---------------------------------------------------------------------------

/**
 * Effective fixer resolver for judge / regression-gate paths.
 * The judge/regression-gate step always routes to code-fixer regardless of finding.fixTarget.
 */
export const judgeEffectiveFixer: (f: Finding) => FixTarget = () => "code-fixer";

/**
 * Effective fixer resolver for the conformance path.
 * Uses finding.fixTarget if present; defaults to "implementer" when absent.
 */
export const conformanceEffectiveFixer: (f: Finding) => FixTarget = (f) =>
  f.fixTarget ?? "implementer";

/**
 * Effective fixer resolver for the spec-review path.
 * The spec-review step always routes to spec-fixer regardless of finding.fixTarget.
 * Rationale: loopFixerPairs[SPEC_REVIEW] = SPEC_FIXER makes spec-fixer structurally
 * the one-and-only fixer for the spec-review round; no agent fixTarget declaration needed.
 */
export const specReviewEffectiveFixer: (f: Finding) => FixTarget = () => "spec-fixer";

// ---------------------------------------------------------------------------
// Core filters
// ---------------------------------------------------------------------------

/**
 * Select findings that are fixable but cannot be legally written by their effective fixer.
 *
 * A finding is "unroutable" when ALL of the following hold:
 *   1. resolution === "fixable"
 *   2. finding.file is in scope.canonPaths
 *   3. The effective fixer's declared write set does NOT include finding.file
 *
 * @param findings            - All findings from the step result.
 * @param scope               - Canon write scope (canon paths + per-fixer writable sets).
 * @param resolveEffectiveFixer - Maps each finding to its effective FixTarget.
 * @returns                   Subset of findings that meet all three conditions.
 */
export function selectUnroutableCanonFindings(
  findings: Finding[],
  scope: CanonWriteScope,
  resolveEffectiveFixer: (f: Finding) => FixTarget,
): Finding[] {
  return findings.filter((f) => {
    if (f.resolution !== "fixable") return false;
    if (!scope.canonPaths.has(f.file)) return false;
    const effectiveFixer = resolveEffectiveFixer(f);
    const writable = scope.writableByFixer.get(effectiveFixer) ?? new Set<string>();
    return !writable.has(f.file);
  });
}

/**
 * Select findings that are fixable AND can be legally written by their effective fixer.
 *
 * A finding is "routable" when ALL of the following hold:
 *   1. resolution === "fixable"
 *   2. finding.file is in scope.canonPaths
 *   3. The effective fixer's declared write set INCLUDES finding.file
 *
 * This is the complement of selectUnroutableCanonFindings for the same resolver.
 *
 * @param findings            - All findings from the step result.
 * @param scope               - Canon write scope (canon paths + per-fixer writable sets).
 * @param resolveEffectiveFixer - Maps each finding to its effective FixTarget.
 * @returns                   Subset of findings that meet all three conditions.
 */
export function selectRoutableCanonFindings(
  findings: Finding[],
  scope: CanonWriteScope,
  resolveEffectiveFixer: (f: Finding) => FixTarget,
): Finding[] {
  return findings.filter((f) => {
    if (f.resolution !== "fixable") return false;
    if (!scope.canonPaths.has(f.file)) return false;
    const effectiveFixer = resolveEffectiveFixer(f);
    const writable = scope.writableByFixer.get(effectiveFixer) ?? new Set<string>();
    return writable.has(f.file);
  });
}

// ---------------------------------------------------------------------------
// Reason builder
// ---------------------------------------------------------------------------

/**
 * Build a human-readable escalation reason string for unroutable canon findings.
 *
 * The output includes:
 *   - CANON_FINDING_ESCALATION code prefix
 *   - Each finding's file path and title
 *   - Explanation that operator intervention is required
 */
export function buildCanonEscalationReason(findings: Finding[]): string {
  const findingLines = findings
    .map((f) => `  - file: ${f.file}, title: "${f.title}"`)
    .join("\n");

  return [
    "[CANON_FINDING_ESCALATION]",
    "保護正典への fixable finding が write-scope により解消不能なため escalation に倒します。",
    "",
    "該当 finding:",
    findingLines,
    "",
    "fixer は write-scope により当該 file を修正できない。保護正典を修正後、job resume <slug> --apply-canon で operator 適用 commit として取り込んでから再開してください。",
  ].join("\n");
}
