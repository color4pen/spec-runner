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
 * A finding is "unroutable" when resolution === "fixable" AND any of the following:
 *   A. finding.file is in scope.canonPaths AND not in the fixer's declared write set.
 *   B. Any remediation.site.file is in scope.canonPaths AND not in the fixer's declared
 *      write set — regardless of whether finding.file itself is a canon path.
 *
 * Condition B covers the case where the primary path is a non-canon source file but the
 * remediation contract names a protected canon secondary site that the fixer cannot write.
 * Without this check the secondary canon site is passed to the fixer, which cannot fulfil
 * the full-site fix contract and produces a partial fix or a write-scope failure.
 *
 * Note: when finding.file is also in scope.canonPaths the primary-site check (A) fires first
 * and the secondary-site check (B) is redundant but correct — it would reach the same
 * conclusion via the auto-injected self-site entry in remediation.sites.
 *
 * @param findings            - All findings from the step result.
 * @param scope               - Canon write scope (canon paths + per-fixer writable sets).
 * @param resolveEffectiveFixer - Maps each finding to its effective FixTarget.
 * @returns                   Subset of findings where at least one site is an unwritable canon path.
 */
export function selectUnroutableCanonFindings(
  findings: Finding[],
  scope: CanonWriteScope,
  resolveEffectiveFixer: (f: Finding) => FixTarget,
): Finding[] {
  return findings.filter((f) => {
    if (f.resolution !== "fixable") return false;
    const effectiveFixer = resolveEffectiveFixer(f);
    const writable = scope.writableByFixer.get(effectiveFixer) ?? new Set<string>();
    // A: Primary site in canon and not writable → unroutable.
    if (scope.canonPaths.has(f.file) && !writable.has(f.file)) return true;
    // B: Any secondary (or primary-duplicate) canon site not writable → unroutable.
    // Runs regardless of whether f.file is in canon, capturing the case where the
    // primary path is a non-canon source file but the remediation contract requires
    // writing a protected canon secondary site.
    if (f.remediation) {
      return f.remediation.sites.some(
        (site) => scope.canonPaths.has(site.file) && !writable.has(site.file),
      );
    }
    return false;
  });
}

/**
 * Select findings that are fixable AND can be legally written by their effective fixer.
 *
 * A finding is "routable" when ALL of the following hold:
 *   1. resolution === "fixable"
 *   2. finding.file is in scope.canonPaths
 *   3. The effective fixer's declared write set INCLUDES finding.file
 *   4. No remediation.site whose file is in scope.canonPaths is absent from the
 *      fixer's declared write set (all secondary canon sites are writable).
 *
 * Condition 4 ensures that a finding whose primary path is writable but whose
 * remediation contract names an unwritable secondary canon site is classified as
 * unroutable (and escalated) rather than passed to a fixer that cannot complete
 * all required site fixes.
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
    if (!writable.has(f.file)) return false;
    // Ensure all secondary canon sites in the remediation contract are also writable.
    if (f.remediation) {
      const hasUnroutableSite = f.remediation.sites.some(
        (site) => scope.canonPaths.has(site.file) && !writable.has(site.file),
      );
      if (hasUnroutableSite) return false;
    }
    return true;
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
    "",
    "詳細: `specrunner guide escalation`",
  ].join("\n");
}
