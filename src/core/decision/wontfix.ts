/**
 * Pure functions for resolving `--wontfix` dispositions at resume time.
 *
 * Resolves comma-separated 1-based indices against the latest regression-gate
 * StepRun findings, reverse-maps each selected finding to its source step(s) in
 * the impl reviewer chain, and produces DispositionDecisionRecord[] for persistence.
 *
 * All-or-nothing: any resolution failure returns an error and zero records.
 */
import type { JobState } from "../../state/schema.js";
import type { DispositionDecisionRecord } from "../../state/schema.js";
import type { Finding } from "../../kernel/report-result.js";
import { computeFindingKey } from "./decision-ledger.js";
import { getLatestJudgeFindings } from "../step/fixer-helpers.js";
import { REGRESSION_GATE_STEP_NAME } from "../step/regression-gate.js";
import { deriveImplReviewerChain } from "../pipeline/reviewer-chain.js";
import { findingFingerprint, collectFindingsLedger } from "../pipeline/findings-ledger.js";
import { collectFixableFindings } from "../step/judge-verdict.js";

export type WontfixResolveResult =
  | { ok: true; records: DispositionDecisionRecord[] }
  | { ok: false; error: string };

/**
 * Resolve `--wontfix` indices into DispositionDecisionRecord[].
 *
 * @param state      - Current job state.
 * @param wontfix    - Comma-separated 1-based indices string (or undefined → no-op).
 * @param reason     - Mandatory reason text (required when wontfix is specified).
 * @param decidedAt  - ISO 8601 timestamp for the records.
 */
export function resolveWontfixDispositions(
  state: JobState,
  wontfix: string | undefined,
  reason: string | undefined,
  decidedAt: string,
): WontfixResolveResult {
  // No --wontfix → no-op
  if (!wontfix || wontfix.trim() === "") {
    return { ok: true, records: [] };
  }

  // reason is required when --wontfix is specified
  if (!reason || reason.trim() === "") {
    return { ok: false, error: "--wontfix-reason is required when --wontfix is specified" };
  }

  // Parse indices
  const parts = wontfix.split(",");
  const indices: number[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed === "") {
      return { ok: false, error: "--wontfix contains an empty element in the index list" };
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || isNaN(n)) {
      return { ok: false, error: `--wontfix: '${trimmed}' is not a valid integer` };
    }
    if (indices.includes(n)) {
      return { ok: false, error: `--wontfix: duplicate index ${n}` };
    }
    indices.push(n);
  }

  // Resolve gate findings
  const gateFindings = getLatestJudgeFindings(state, REGRESSION_GATE_STEP_NAME);
  if (!gateFindings || gateFindings.length === 0) {
    return { ok: false, error: "regression-gate has not run yet or reported no findings" };
  }

  // Validate indices (1-based)
  for (const idx of indices) {
    if (idx < 1 || idx > gateFindings.length) {
      return {
        ok: false,
        error: `--wontfix: index ${idx} is out of range (1–${gateFindings.length})`,
      };
    }
  }

  // Collect selected findings from gate
  const selectedGateFindings = indices.map((idx) => gateFindings[idx - 1]!);

  // Build a lookup: fingerprint → list of (stepName, actualFinding) from reviewerChain
  // One record per source step (deduplicated by step name for the same fingerprint).
  const reviewerChain = deriveImplReviewerChain(state);

  // Map: fingerprint → Map<stepName, Finding>
  const chainIndex = new Map<string, Map<string, Finding>>();
  for (const stepName of reviewerChain) {
    const runs = state.steps?.[stepName] ?? [];
    for (const run of runs) {
      const toolResult = run.outcome.toolResult as { findings?: Finding[] } | null | undefined;
      const findings = toolResult?.findings;
      if (!findings || findings.length === 0) continue;
      const fixable = collectFixableFindings(findings);
      for (const f of fixable) {
        const fp = findingFingerprint(f);
        if (!chainIndex.has(fp)) {
          chainIndex.set(fp, new Map());
        }
        const stepMap = chainIndex.get(fp)!;
        // First occurrence wins per step (step-level dedup)
        if (!stepMap.has(stepName)) {
          stepMap.set(stepName, f);
        }
      }
    }
  }

  // Resolve each selected finding to records
  const records: DispositionDecisionRecord[] = [];
  for (let i = 0; i < selectedGateFindings.length; i++) {
    const gateFinding = selectedGateFindings[i]!;
    const fp = findingFingerprint(gateFinding);
    const stepMap = chainIndex.get(fp);
    if (!stepMap || stepMap.size === 0) {
      return {
        ok: false,
        error: `--wontfix: index ${indices[i]} finding fingerprint '${fp}' not found in any reviewer chain step`,
      };
    }
    for (const [stepName, actualFinding] of stepMap) {
      const findingKey = computeFindingKey(stepName, actualFinding);
      const id = `disposition-${decidedAt}-${indices[i]}-${stepName}`;
      records.push({
        kind: "disposition",
        id,
        step: stepName,
        findingKey,
        finding: {
          title: actualFinding.title,
          file: actualFinding.file,
          line: actualFinding.line,
          rationale: actualFinding.rationale,
          severity: actualFinding.severity,
        },
        disposition: "wontfix",
        reason,
        decidedAt,
        source: "operator",
      });
    }
  }

  return { ok: true, records };
}
