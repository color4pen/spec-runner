/**
 * Pure functions for resolving `--wontfix` dispositions at resume time.
 *
 * Resolves comma-separated 1-based indices against the latest regression-gate
 * StepRun findings, resolves each selected finding to its source step(s) via the
 * carried provenance ref (ledgerRef), and produces DispositionDecisionRecord[] for
 * persistence.
 *
 * Resolution is performed by matching the gate finding's carried provenance ref
 * against the all-origins provenance index (spec-review + impl reviewer chain),
 * NOT by recomputing a fingerprint from the gate finding's LLM-regenerated title.
 *
 * All-or-nothing: any resolution failure returns an error and zero records.
 */
import type { JobState } from "../../state/schema.js";
import type { DispositionDecisionRecord } from "../../state/schema.js";
import { computeFindingKey } from "./decision-ledger.js";
import { getLatestJudgeFindings } from "../step/fixer-helpers.js";
import { REGRESSION_GATE_STEP_NAME } from "../step/regression-gate.js";
import { deriveImplReviewerChain } from "../pipeline/reviewer-chain.js";
import { buildProvenanceIndex } from "../pipeline/findings-ledger.js";

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

  // Build the all-origins provenance index over spec-review + impl reviewer chain.
  // This replaces the old impl-chain-only fingerprint index, covering the confirmed
  // spec-review-origin gap (design D4).
  const reviewerChain = deriveImplReviewerChain(state);
  const provenanceIndex = buildProvenanceIndex(reviewerChain, state);

  // Resolve each selected finding to records via the carried provenance ref.
  // Resolution depends on the gate finding's ledgerRef field (echoed verbatim from
  // the ledger block), NOT on recomputing a fingerprint from the gate's regenerated title.
  const records: DispositionDecisionRecord[] = [];
  for (let i = 0; i < selectedGateFindings.length; i++) {
    const gateFinding = selectedGateFindings[i]!;
    const ref = gateFinding.ledgerRef;

    // Fail all-or-nothing if the gate finding has no provenance ref
    if (!ref || typeof ref !== "string") {
      return {
        ok: false,
        error: `--wontfix: index ${indices[i]} finding has no provenance ref (ledgerRef absent) — cannot resolve to origin step`,
      };
    }

    // Fail all-or-nothing if the ref doesn't resolve to any ledger-contributing step
    const stepMap = provenanceIndex.get(ref);
    if (!stepMap || stepMap.size === 0) {
      return {
        ok: false,
        error: `--wontfix: index ${indices[i]} provenance ref '${ref}' not found in any reviewer chain step`,
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
