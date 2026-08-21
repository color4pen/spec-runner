/**
 * Pure functions for the findings ledger used by the regression-gate step.
 *
 * The ledger is the union of all fixable findings produced by every step in the
 * reviewer chain across all iterations. It is the input to the regression-gate:
 * the gate checks whether each ledger entry is still fixed in the final code.
 *
 * All functions are pure (no side effects, no I/O).
 */
import { createHash } from "crypto";
import type { JobState } from "../../state/schema.js";
import type { Finding } from "../../kernel/report-result.js";
import { collectFixableFindings } from "../step/judge-verdict.js";
import { getLatestJudgeFindings } from "../step/fixer-helpers.js";
import {
  selectUnroutableCanonFindings,
  judgeEffectiveFixer,
  specReviewEffectiveFixer,
  type CanonWriteScope,
} from "../step/canon-escalation.js";
import { STEP_NAMES } from "../step/step-names.js";
import { filterUndecidedFindings } from "../decision/decision-ledger.js";

/**
 * Collect all fixable findings from every StepRun in the given reviewer chain.
 *
 * For each step in reviewerChain, walks all StepRuns and collects findings where
 * resolution === "fixable". Applies dedupeFindings before returning.
 *
 * The regression-gate step itself must NOT appear in reviewerChain — the gate
 * does not feed itself.
 *
 * @param reviewerChain - Ordered list of reviewer step names (excludes regression-gate).
 * @param state         - Current job state.
 * @returns Deduplicated set of fixable findings from all reviewer runs.
 */
export function collectFindingsLedger(
  reviewerChain: string[],
  state: JobState,
  canonScope?: CanonWriteScope,
): Finding[] {
  if (reviewerChain.length === 0) return [];

  const all: Finding[] = [];

  for (const stepName of reviewerChain) {
    const runs = state.steps?.[stepName] ?? [];
    for (const run of runs) {
      const toolResult = run.outcome.toolResult as { findings?: Finding[] } | null | undefined;
      const findings = toolResult?.findings;
      if (!findings || findings.length === 0) continue;
      const fixable = collectFixableFindings(findings);
      // Exclude disposition-decided findings before collecting (T-04 / D5).
      // filterUndecidedFindings checks step + findingKey against decisions;
      // disposition records use the same fields so no arm check needed.
      const active = filterUndecidedFindings(stepName, fixable, state.decisions);
      all.push(...active);
    }
  }

  const deduped = dedupeFindings(all);

  // R3: exclude unroutable canon findings when canonScope is provided
  if (!canonScope) return deduped;
  const unroutable = new Set(
    selectUnroutableCanonFindings(deduped, canonScope, judgeEffectiveFixer).map(
      (f) => `${f.file}|${f.line ?? ""}|${f.title}`,
    ),
  );
  return deduped.filter((f) => !unroutable.has(`${f.file}|${f.line ?? ""}|${f.title}`));
}

/**
 * Collect fixable findings from needs-fix members for the parallel coordinator's code-fixer input.
 *
 * Design D5 (reviewer-parallel-execution): after a parallel review round, the coordinator
 * collects fixable findings from all `needs-fix` members and passes them to a single
 * code-fixer session. approved / skipped members are excluded.
 *
 * The last StepRun verdict is used to determine needs-fix status.
 * `collectFindingsLedger` (regression-gate ledger) is intentionally left unchanged (D9).
 *
 * @param state   - Current job state.
 * @param members - Reviewer step names to inspect (coordinator fan-out members).
 */
export function collectParallelFixerFindings(
  state: JobState,
  members: string[],
  canonScope?: CanonWriteScope,
): Finding[] {
  const all: Finding[] = [];

  for (const name of members) {
    const runs = state.steps?.[name] ?? [];
    if (runs.length === 0) continue;
    const lastRun = runs[runs.length - 1];
    if (!lastRun) continue;

    // Only collect from needs-fix members
    const verdict = lastRun.outcome.verdict;
    if (verdict !== "needs-fix") continue;

    const findings = getLatestJudgeFindings(state, name);
    if (!findings || findings.length === 0) continue;

    const fixable = collectFixableFindings(findings);
    // Exclude disposition-decided findings (mirrors collectFindingsLedger per-step exclusion).
    const active = filterUndecidedFindings(name, fixable, state.decisions);
    all.push(...active);
  }

  const deduped = dedupeFindings(all);

  // R3: exclude unroutable canon findings when canonScope is provided
  if (!canonScope) return deduped;
  const unroutable = new Set(
    selectUnroutableCanonFindings(deduped, canonScope, judgeEffectiveFixer).map(
      (f) => `${f.file}|${f.line ?? ""}|${f.title}`,
    ),
  );
  return deduped.filter((f) => !unroutable.has(`${f.file}|${f.line ?? ""}|${f.title}`));
}

/**
 * Collect fixable findings from all spec-review runs for the regression-gate ledger.
 *
 * Walks all StepRuns in state.steps[STEP_NAMES.SPEC_REVIEW] and collects findings
 * where resolution === "fixable". Applies dedupeFindings before returning.
 *
 * Applies filterUndecidedFindings per StepRun (mirroring collectFindingsLedger) so that
 * a spec-review-origin finding disposed via wontfix (step="spec-review") is excluded from
 * the merged regression ledger — without this, disposed spec-review findings would still
 * appear in computeRegressionLedger.
 *
 * When canonScope is provided, findings that are unroutable to spec-fixer
 * (i.e. on canon files spec-fixer cannot write: request.md, test-cases.md, attestation)
 * are excluded. Findings on spec-fixer-writable paths (spec.md, design.md, tasks.md)
 * are retained. When canonScope is absent, no exclusion is applied.
 *
 * @param state      - Current job state.
 * @param canonScope - Optional canon write scope for filtering unroutable findings.
 * @returns Deduplicated set of fixable findings from all spec-review runs.
 */
export function collectSpecReviewLedger(state: JobState, canonScope?: CanonWriteScope): Finding[] {
  const runs = state.steps?.[STEP_NAMES.SPEC_REVIEW] ?? [];
  const all: Finding[] = [];

  for (const run of runs) {
    const toolResult = run.outcome.toolResult as { findings?: Finding[] } | null | undefined;
    const findings = toolResult?.findings;
    if (!findings || findings.length === 0) continue;
    const fixable = collectFixableFindings(findings);
    // Exclude disposition-decided findings before collecting (mirrors collectFindingsLedger per-run exclusion).
    // filterUndecidedFindings checks step + findingKey against decisions;
    // disposition records use the same fields so no arm check needed.
    const active = filterUndecidedFindings(STEP_NAMES.SPEC_REVIEW, fixable, state.decisions);
    all.push(...active);
  }

  const deduped = dedupeFindings(all);

  if (!canonScope) return deduped;

  // Exclude unroutable canon findings (request.md, test-cases.md, attestation)
  // using specReviewEffectiveFixer (spec-fixer writes spec.md, design.md, tasks.md).
  const unroutable = new Set(
    selectUnroutableCanonFindings(deduped, canonScope, specReviewEffectiveFixer).map(
      (f) => `${f.file}|${f.line ?? ""}|${f.title}`,
    ),
  );
  return deduped.filter((f) => !unroutable.has(`${f.file}|${f.line ?? ""}|${f.title}`));
}

/**
 * Compute the fingerprint for a finding.
 * Fingerprint = `${file}|${line ?? ""}|${title}` — same key used by dedupeFindings.
 * Export allows callers to reference the same key without drift.
 */
export function findingFingerprint(f: Finding): string {
  return `${f.file}|${f.line ?? ""}|${f.title}`;
}

/**
 * Deduplicate findings using (file + line + title) as the key.
 * Line is coerced to empty string when absent.
 * The first occurrence of each key is retained; subsequent duplicates are dropped.
 *
 * @param findings - Raw findings array (may contain structural duplicates).
 * @returns De-duplicated findings (first-occurrence wins).
 */
export function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const result: Finding[] = [];

  for (const f of findings) {
    const key = findingFingerprint(f);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(f);
    }
  }

  return result;
}

/**
 * Compute the merged findings ledger for the regression-gate.
 *
 * Merges spec-review fixable findings (collectSpecReviewLedger) with impl reviewer
 * chain findings (collectFindingsLedger) via dedupeFindings — the same computation
 * used in regression-gate.ts skipWhen and buildMessage. Sharing this function
 * prevents the two call-sites from drifting.
 *
 * **Signature note**: reviewerChain is supplied by the caller, NOT derived internally.
 * This avoids an import cycle: findings-ledger.ts → reviewer-chain.ts →
 * regression-gate.ts → findings-ledger.ts.
 *
 * @param reviewerChain - Ordered reviewer step names (from deriveImplReviewerChain).
 * @param state         - Current job state.
 * @param canonScope    - Optional canon write scope for filtering unroutable findings.
 */
export function computeRegressionLedger(
  reviewerChain: string[],
  state: JobState,
  canonScope?: CanonWriteScope,
): Finding[] {
  const specLedger = collectSpecReviewLedger(state, canonScope);
  const implLedger = collectFindingsLedger(reviewerChain, state, canonScope);
  return dedupeFindings([...specLedger, ...implLedger]);
}

/**
 * Compute a deterministic, collision-resistant provenance ref for a finding.
 *
 * The ref is derived from the finding's stable fingerprint (file|line|title) via
 * SHA-256, encoded as the first 8 hex characters (32 bits of entropy). This is:
 * - Deterministic: equal fingerprints always yield equal refs (design D3).
 * - Positionally stable: independent of ledger membership or ordering.
 * - Compact: 8 hex chars are easy for the LLM to transport verbatim.
 *
 * Two findings with the same fingerprint (file, line, title) yield the same ref.
 * This ref is NOT a redesign of computeFindingKey or findingFingerprint — it is
 * derived from the existing fingerprint formula (scope-out per tasks T-02).
 *
 * @param finding - The finding to derive a ref for.
 * @returns An 8-character lowercase hex string.
 */
export function computeLedgerRef(finding: Finding): string {
  const fp = findingFingerprint(finding);
  return createHash("sha256").update(fp, "utf8").digest("hex").slice(0, 8);
}

/**
 * Build the wontfix provenance index over ALL ledger-contributing steps.
 *
 * Walks spec-review StepRuns AND the impl reviewer chain StepRuns (the same
 * source sets that feed computeRegressionLedger), collects collectFixableFindings
 * per run, and produces Map<ref, Map<stepName, Finding>> (first-occurrence-wins
 * per step, mirroring the current step-level dedup in the old fingerprint index).
 *
 * This index is used by resolveWontfixDispositions to resolve a gate finding's
 * carried ledgerRef to its origin step(s) without depending on the LLM-regenerated
 * title or rationale.
 *
 * **Import cycle note**: reviewerChain is supplied by the caller (NOT derived
 * internally) to avoid the findings-ledger → reviewer-chain → regression-gate →
 * findings-ledger cycle (same reason as computeRegressionLedger).
 *
 * @param reviewerChain - Ordered impl reviewer step names (from deriveImplReviewerChain).
 * @param state         - Current job state.
 * @returns Map from provenance ref to Map<stepName, Finding>.
 */
export function buildProvenanceIndex(
  reviewerChain: string[],
  state: JobState,
): Map<string, Map<string, Finding>> {
  const index = new Map<string, Map<string, Finding>>();

  /** Add a finding to the provenance index (first-occurrence-wins per step). */
  function addFinding(stepName: string, finding: Finding): void {
    const ref = computeLedgerRef(finding);
    if (!index.has(ref)) {
      index.set(ref, new Map());
    }
    const stepMap = index.get(ref)!;
    // First occurrence wins per step (step-level dedup, same as old chainIndex)
    if (!stepMap.has(stepName)) {
      stepMap.set(stepName, finding);
    }
  }

  // Walk spec-review StepRuns (covers the confirmed gap where the old impl-chain-only
  // index failed to cover spec-review-origin findings).
  const specRuns = state.steps?.[STEP_NAMES.SPEC_REVIEW] ?? [];
  for (const run of specRuns) {
    const toolResult = run.outcome.toolResult as { findings?: Finding[] } | null | undefined;
    const findings = toolResult?.findings;
    if (!findings || findings.length === 0) continue;
    const fixable = collectFixableFindings(findings);
    for (const f of fixable) {
      addFinding(STEP_NAMES.SPEC_REVIEW, f);
    }
  }

  // Walk impl reviewer chain StepRuns.
  for (const stepName of reviewerChain) {
    const runs = state.steps?.[stepName] ?? [];
    for (const run of runs) {
      const toolResult = run.outcome.toolResult as { findings?: Finding[] } | null | undefined;
      const findings = toolResult?.findings;
      if (!findings || findings.length === 0) continue;
      const fixable = collectFixableFindings(findings);
      for (const f of fixable) {
        addFinding(stepName, f);
      }
    }
  }

  return index;
}

