/**
 * Types for attestation — machine-readable summary of a single specrunner run.
 *
 * Attestation records the gate execution order, verdict derivation inputs,
 * step models, budget/cost consumption, and the SHA-256 hash of the event journal.
 *
 * Design: no version field — schema versioning deferred to the contract-freeze phase.
 */
import type { UsageFile } from "../usage/types.js";

export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface FindingsSummary {
  total: number;
  bySeverity: { critical: number; high: number; medium: number; low: number };
  byResolution: { fixable: number; decisionNeeded: number };
}

export interface GateExecution {
  step: string;
  attempt: number;           // 1-origin
  verdict: string | null;
  startedAt: string;
  endedAt: string;
  findings?: FindingsSummary; // findings を報告した gate のみ
}

export interface StepModels {
  step: string;
  models: string[];          // distinct・昇順
}

export interface StepCost {
  step: string;
  costUsd: number | null;    // null = 価格表に無い / modelUsage なし
  tokens: TokenTotals;
}

export interface CostSummary {
  totalCostUsd: number | null;
  unpricedModels: string[];  // 価格表に無い model キー（昇順・distinct）
  totalTokens: TokenTotals;
  perStep: StepCost[];
}

export interface Attestation {
  journalHash: string;       // events.jsonl の sha256 hex
  gates: GateExecution[];    // startedAt 昇順
  stepModels: StepModels[];  // step 別 model
  cost: CostSummary;
}

export interface AttestationInput {
  journalContent: string;    // events.jsonl 生バイト列
  usage: UsageFile;          // 解析済み usage.json
}

/**
 * Returns a zero-value TokenTotals (additive identity).
 * Factory function — each call returns a distinct mutable object.
 */
export function zeroTokenTotals(): TokenTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}
