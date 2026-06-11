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

/**
 * Collect all fixable findings from every StepRun in the given reviewer chain.
 *
 * For each step in reviewerChain, walks all StepRuns and collects findings where
 * resolution === "fixable". Applies dedupeFindings before returning.
 *
 * The regression-gate step itself must NOT appear in reviewerChain — the gate
 * does not feed itself.
 *
 * @param state         - Current job state.
 * @param reviewerChain - Ordered list of reviewer step names (excludes regression-gate).
 * @returns Deduplicated set of fixable findings from all reviewer runs.
 */
export function collectFindingsLedger(
  state: JobState,
  reviewerChain: string[],
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

  return dedupeFindings(all);
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
