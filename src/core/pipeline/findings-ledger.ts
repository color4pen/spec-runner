/**
 * Pure functions for the findings ledger used by the regression-gate step.
 *
 * The ledger is the union of all fixable findings produced by every step in the
 * reviewer chain across all iterations. It is the input to the regression-gate:
 * the gate checks whether each ledger entry is still fixed in the final code.
 *
 * All functions are pure (no side effects, no I/O).
 */
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
      all.push(...fixable);
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
    all.push(...fixable);
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
    all.push(...fixable);
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
    const key = `${f.file}|${f.line ?? ""}|${f.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(f);
    }
  }

  return result;
}
