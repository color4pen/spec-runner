/**
 * buildAttestation — pure function to build an Attestation from journal + usage.
 *
 * Pure: no file I/O, no network, no global state mutation.
 * Inputs: journalContent (events.jsonl string) + parsed UsageFile.
 * Output: Attestation object.
 *
 * Design D2/D3/D4/D5: mirrors the pure-function pattern of judge-verdict.ts (B-5).
 */
import { createHash } from "node:crypto";
import { fold } from "../../store/event-journal.js";
import { computeCostUsd } from "../usage/pricing.js";
import type { Finding } from "../../kernel/report-result.js";
import {
  zeroTokenTotals,
  type AttestationInput,
  type Attestation,
  type GateExecution,
  type StepModels,
  type StepCost,
  type CostSummary,
  type TokenTotals,
  type FindingsSummary,
} from "./types.js";

function addTokenTotals(acc: TokenTotals, delta: TokenTotals): TokenTotals {
  return {
    input: acc.input + delta.input,
    output: acc.output + delta.output,
    cacheRead: acc.cacheRead + delta.cacheRead,
    cacheWrite: acc.cacheWrite + delta.cacheWrite,
  };
}

function buildFindingsSummary(findings: Finding[]): FindingsSummary {
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const byResolution = { fixable: 0, decisionNeeded: 0 };

  for (const f of findings) {
    if (f.severity === "critical") bySeverity.critical++;
    else if (f.severity === "high") bySeverity.high++;
    else if (f.severity === "medium") bySeverity.medium++;
    else if (f.severity === "low") bySeverity.low++;

    if (f.resolution === "fixable") byResolution.fixable++;
    else if (f.resolution === "decision-needed") byResolution.decisionNeeded++;
  }

  return {
    total: findings.length,
    bySeverity,
    byResolution,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build an Attestation from journal content and parsed usage data.
 * Pure function — no I/O, no side effects.
 */
export function buildAttestation(input: AttestationInput): Attestation {
  const { journalContent, usage } = input;

  // 1. Journal hash (sha256 of raw content string)
  const journalHash = createHash("sha256").update(journalContent).digest("hex");

  // 2. Fold journal to get steps
  const { steps } = fold(journalContent);

  // 3. Build gates: flatten all StepRun entries with step name, sort by startedAt
  type FlatRun = {
    step: string;
    attempt: number;
    verdict: string | null;
    startedAt: string;
    endedAt: string;
    findings: Finding[] | undefined;
  };

  const flatRuns: FlatRun[] = [];
  for (const [stepName, runs] of Object.entries(steps)) {
    for (const run of runs) {
      const findings = run.outcome.toolResult?.findings as Finding[] | undefined;
      flatRuns.push({
        step: stepName,
        attempt: run.attempt,
        verdict: (run.outcome.verdict as string | null) ?? null,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        findings: findings && findings.length > 0 ? findings : undefined,
      });
    }
  }

  // Stable sort by startedAt ascending
  flatRuns.sort((a, b) => {
    if (a.startedAt < b.startedAt) return -1;
    if (a.startedAt > b.startedAt) return 1;
    return 0;
  });

  const gates: GateExecution[] = flatRuns.map((r) => {
    const gate: GateExecution = {
      step: r.step,
      attempt: r.attempt,
      verdict: r.verdict,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
    };
    if (r.findings !== undefined) {
      gate.findings = buildFindingsSummary(r.findings);
    }
    return gate;
  });

  // 4. Build stepModels and cost from usage.commandInvocations
  // Only consider "job" invocations that have a stepName
  const jobInvocations = usage.commandInvocations.filter(
    (inv) => inv.command === "job" && typeof inv.stepName === "string",
  );

  // Group by stepName
  const byStep: Record<string, typeof jobInvocations> = {};
  for (const inv of jobInvocations) {
    const name = inv.stepName as string;
    if (!byStep[name]) byStep[name] = [];
    byStep[name]!.push(inv);
  }

  const stepModelsList: StepModels[] = [];
  const perStep: StepCost[] = [];
  const unpricedModelsSet = new Set<string>();
  let totalCostAccumulator: number | null = null;
  const totalTokensAccumulator = zeroTokenTotals();

  for (const [stepName, invocations] of Object.entries(byStep)) {
    const modelsSet = new Set<string>();
    let stepCostUsd: number | null = null;
    let stepHasUnpriced = false;
    const stepTokens = zeroTokenTotals();

    for (const inv of invocations) {
      if (inv.modelUsage === null) {
        // No usage data — cost stays null direction
        stepHasUnpriced = true;
        continue;
      }

      for (const [model, modelUsage] of Object.entries(inv.modelUsage)) {
        modelsSet.add(model);

        // Accumulate tokens
        const delta: TokenTotals = {
          input: modelUsage.inputTokens,
          output: modelUsage.outputTokens,
          cacheRead: modelUsage.cacheReadInputTokens,
          cacheWrite: modelUsage.cacheCreationInputTokens,
        };
        const newStepTokens = addTokenTotals(stepTokens, delta);
        stepTokens.input = newStepTokens.input;
        stepTokens.output = newStepTokens.output;
        stepTokens.cacheRead = newStepTokens.cacheRead;
        stepTokens.cacheWrite = newStepTokens.cacheWrite;

        // Accumulate total tokens
        const newTotal = addTokenTotals(totalTokensAccumulator, delta);
        totalTokensAccumulator.input = newTotal.input;
        totalTokensAccumulator.output = newTotal.output;
        totalTokensAccumulator.cacheRead = newTotal.cacheRead;
        totalTokensAccumulator.cacheWrite = newTotal.cacheWrite;

        // Compute cost
        const cost = computeCostUsd(model, modelUsage);
        if (cost === null) {
          stepHasUnpriced = true;
          unpricedModelsSet.add(model);
        } else {
          stepCostUsd = (stepCostUsd ?? 0) + cost;
          totalCostAccumulator = (totalCostAccumulator ?? 0) + cost;
        }
      }
    }

    // If any invocation was unpriced, the step cost is null
    if (stepHasUnpriced) {
      stepCostUsd = null;
    }

    stepModelsList.push({
      step: stepName,
      models: Array.from(modelsSet).sort(),
    });

    perStep.push({
      step: stepName,
      costUsd: stepCostUsd,
      tokens: { ...stepTokens },
    });
  }

  // Sort unpricedModels ascending
  const unpricedModels = Array.from(unpricedModelsSet).sort();

  const cost: CostSummary = {
    totalCostUsd: totalCostAccumulator,
    unpricedModels,
    totalTokens: { ...totalTokensAccumulator },
    perStep,
  };

  return {
    journalHash,
    gates,
    stepModels: stepModelsList,
    cost,
  };
}
