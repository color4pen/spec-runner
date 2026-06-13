/**
 * Decision ledger helpers.
 *
 * Pure functions for computing finding keys, checking whether a finding has been decided,
 * and filtering undecided findings from a set.
 *
 * Design D3 / D8: deterministic finding key derived from step, file, line, title, and rationale.
 * The key is used to match repeated findings against the decision ledger.
 */
import type { Finding } from "../../kernel/report-result.js";
import type { DecisionRecord, JobState } from "../../state/schema.js";

/**
 * Normalize text for finding key comparison.
 * Trims, collapses consecutive whitespace, and lowercases.
 */
function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Compute a deterministic key for a finding.
 *
 * Key format: `step|file|line-or-empty|normalized-title|normalized-rationale`
 *
 * Including `rationale` reduces false positives where a reviewer reuses a generic title
 * for a different issue. Including `step` scopes the match to the originating step.
 *
 * @param step    Name of the step that produced this finding.
 * @param finding The finding to key.
 */
export function computeFindingKey(step: string, finding: Finding): string {
  const file = finding.file ?? "";
  const line = finding.line !== undefined ? String(finding.line) : "";
  const title = normalizeText(finding.title ?? "");
  const rationale = normalizeText(finding.rationale ?? "");
  return `${step}|${file}|${line}|${title}|${rationale}`;
}

/**
 * Return true if a finding matches any existing decision in the ledger.
 *
 * Matching is by deterministic key: step + file + line + normalized title + normalized rationale.
 *
 * @param step      Step that produced the finding.
 * @param finding   The finding to test.
 * @param decisions Current decision ledger (may be empty or undefined).
 */
export function isFindingDecided(
  step: string,
  finding: Finding,
  decisions: DecisionRecord[] | undefined,
): boolean {
  if (!decisions || decisions.length === 0) return false;
  const key = computeFindingKey(step, finding);
  return decisions.some((d) => d.step === step && d.findingKey === key);
}

/**
 * Filter a set of findings, returning only those NOT already covered by the decision ledger.
 *
 * @param step      Step that produced the findings.
 * @param findings  Findings to filter (all findings from the step run).
 * @param decisions Current decision ledger (may be empty or undefined).
 */
export function filterUndecidedFindings(
  step: string,
  findings: Finding[],
  decisions: DecisionRecord[] | undefined,
): Finding[] {
  if (!decisions || decisions.length === 0) return findings;
  return findings.filter((f) => !isFindingDecided(step, f, decisions));
}

/**
 * Extract the latest open `decision-needed` findings for the job's resume step,
 * after filtering out findings already covered by the decision ledger.
 *
 * Returns an empty array when:
 * - No `resumePoint.step` is set
 * - The step has no recorded runs
 * - The latest run has no `decision-needed` findings
 * - All `decision-needed` findings are already decided
 *
 * @param state Current job state.
 */
export function getOpenDecisionFindings(state: JobState): Finding[] {
  const step = state.resumePoint?.step;
  if (!step) return [];

  const runs = state.steps?.[step];
  if (!runs || runs.length === 0) return [];

  const latest = runs[runs.length - 1];
  if (!latest) return [];

  const toolResult = latest.outcome?.toolResult as
    | { findings?: Finding[] }
    | null
    | undefined;
  const allFindings: Finding[] = toolResult?.findings ?? [];

  const decisionFindings = allFindings.filter(
    (f) => f.resolution === "decision-needed",
  );

  return filterUndecidedFindings(step, decisionFindings, state.decisions);
}
