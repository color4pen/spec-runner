/**
 * Pure judgment module for canon-finding escalation routing.
 *
 * Determines whether a fixable finding (primary file + all remediation.sites) cannot be
 * legally written by its effective routing fixer, and therefore must be escalated to the
 * operator rather than routed to a fixer session.
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
  /**
   * Fixers that have broad write access to non-canon paths (guarded-write steps).
   * These fixers can write any file that is NOT in canonPaths.
   * Fixers absent from this set can ONLY write paths listed in their writableByFixer entry.
   *
   * Optional for backward compatibility. When absent, DEFAULT_BROAD_WRITE_FIXERS is used.
   */
  broadWriteFixers?: ReadonlySet<FixTarget>;
}

// ---------------------------------------------------------------------------
// Module-level constants
// ---------------------------------------------------------------------------

/**
 * Default broad-write fixers used when CanonWriteScope.broadWriteFixers is absent.
 *
 * Corresponds to the guarded-write pipeline steps that use git-add-all staging
 * and therefore have unrestricted write access to non-canon paths:
 *   - "code-fixer":   guarded mode, writes src/** freely
 *   - "implementer":  guarded mode, writes src/** freely
 *
 * Defined inline (no import) to preserve the leaf-module constraint.
 */
const DEFAULT_BROAD_WRITE_FIXERS: ReadonlySet<FixTarget> = new Set<FixTarget>([
  "code-fixer",
  "implementer",
]);

// ---------------------------------------------------------------------------
// Shared predicate
// ---------------------------------------------------------------------------

/**
 * Determine whether a single file path is legally writable by the given fixer.
 *
 * - Canon path (in scope.canonPaths): writable only if listed in writableByFixer[fixer].
 * - Non-canon path: writable only if the fixer is in scope.broadWriteFixers (or the module
 *   default when broadWriteFixers is absent).
 */
function isFileWritableByFixer(
  file: string,
  effectiveFixer: FixTarget,
  scope: CanonWriteScope,
): boolean {
  if (scope.canonPaths.has(file)) {
    const writable = scope.writableByFixer.get(effectiveFixer) ?? new Set<string>();
    return writable.has(file);
  }
  // Non-canon path: writable only if fixer has broad write access.
  const broad = scope.broadWriteFixers ?? DEFAULT_BROAD_WRITE_FIXERS;
  return broad.has(effectiveFixer);
}

/**
 * Determine whether a finding's complete site set (primary file + all remediation.sites)
 * is entirely writable by the given effective fixer.
 *
 * This is the single shared predicate used by selectUnroutableCanonFindings and
 * selectRoutableCanonFindings for findings that carry a remediation contract, guaranteeing
 * the two selectors are exact complements for the remediation case.
 *
 * For each site:
 *   - Canon path: writable iff it appears in scope.writableByFixer[effectiveFixer].
 *   - Non-canon path: writable iff effectiveFixer is in scope.broadWriteFixers.
 *
 * Returns true when ALL sites are writable (finding is routable to the fixer).
 * Returns false when ANY site is not writable (finding must escalate).
 *
 * Callers must only invoke this function for findings where f.remediation is defined.
 */
export function isFindingWithinFixerWriteScope(
  finding: Finding,
  effectiveFixer: FixTarget,
  scope: CanonWriteScope,
): boolean {
  if (!isFileWritableByFixer(finding.file, effectiveFixer, scope)) return false;
  if (finding.remediation) {
    for (const site of finding.remediation.sites) {
      if (!isFileWritableByFixer(site.file, effectiveFixer, scope)) return false;
    }
  }
  return true;
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
 * Two code paths depending on whether the finding carries a remediation contract:
 *
 * With remediation (general path):
 *   A finding is "unroutable" when isFindingWithinFixerWriteScope returns false, i.e.
 *   ANY site (primary file or any remediation.site) is not writable by the effective fixer:
 *   - Canon path: not in the fixer's declared write set → unroutable.
 *   - Non-canon path: fixer is not in scope.broadWriteFixers → unroutable.
 *
 * Without remediation (legacy path — behavior unchanged):
 *   A finding is "unroutable" only when its primary file is in scope.canonPaths AND not in
 *   the fixer's declared write set. Non-canon primary files are ignored (pass-through).
 *
 * The two selectors (selectUnroutableCanonFindings / selectRoutableCanonFindings) are exact
 * complements for fixable findings that have a remediation contract: every such finding is
 * classified as either routable or unroutable, never both.
 *
 * @param findings              - All findings from the step result.
 * @param scope                 - Canon write scope (canon paths + per-fixer writable sets + broadWriteFixers).
 * @param resolveEffectiveFixer - Maps each finding to its effective FixTarget.
 * @returns                     Subset of fixable findings where at least one site is not writable.
 */
export function selectUnroutableCanonFindings(
  findings: Finding[],
  scope: CanonWriteScope,
  resolveEffectiveFixer: (f: Finding) => FixTarget,
): Finding[] {
  return findings.filter((f) => {
    if (f.resolution !== "fixable") return false;
    const effectiveFixer = resolveEffectiveFixer(f);

    if (f.remediation) {
      // General path: use shared predicate to check primary + all secondary sites.
      return !isFindingWithinFixerWriteScope(f, effectiveFixer, scope);
    }

    // Legacy path (no remediation): only flag if primary file is an unwritable canon path.
    if (!scope.canonPaths.has(f.file)) return false;
    const writable = scope.writableByFixer.get(effectiveFixer) ?? new Set<string>();
    return !writable.has(f.file);
  });
}

/**
 * Select findings that are fixable AND can be legally written by their effective fixer.
 *
 * Two code paths depending on whether the finding carries a remediation contract:
 *
 * With remediation (general path):
 *   A finding is "routable" when isFindingWithinFixerWriteScope returns true, i.e.
 *   ALL sites (primary file + every remediation.site) are writable by the effective fixer:
 *   - Canon path: appears in the fixer's declared write set.
 *   - Non-canon path: fixer is in scope.broadWriteFixers.
 *
 * Without remediation (legacy path — behavior unchanged):
 *   A finding is "routable" only when:
 *   1. resolution === "fixable"
 *   2. finding.file is in scope.canonPaths
 *   3. The effective fixer's declared write set INCLUDES finding.file
 *   Non-canon primary files are excluded (pass-through, not classified).
 *
 * This is the exact complement of selectUnroutableCanonFindings for fixable findings
 * with a remediation contract. For legacy findings (no remediation), non-canon primary
 * files fall into neither selector (maintaining the pre-remediation pass-through behavior).
 *
 * @param findings              - All findings from the step result.
 * @param scope                 - Canon write scope (canon paths + per-fixer writable sets + broadWriteFixers).
 * @param resolveEffectiveFixer - Maps each finding to its effective FixTarget.
 * @returns                     Subset of fixable findings where all sites are writable.
 */
export function selectRoutableCanonFindings(
  findings: Finding[],
  scope: CanonWriteScope,
  resolveEffectiveFixer: (f: Finding) => FixTarget,
): Finding[] {
  return findings.filter((f) => {
    if (f.resolution !== "fixable") return false;
    const effectiveFixer = resolveEffectiveFixer(f);

    if (f.remediation) {
      // General path: use shared predicate to check primary + all secondary sites.
      return isFindingWithinFixerWriteScope(f, effectiveFixer, scope);
    }

    // Legacy path (no remediation): primary file must be in canonPaths AND writable.
    if (!scope.canonPaths.has(f.file)) return false;
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
    "",
    "詳細: `specrunner guide escalation`",
  ].join("\n");
}
