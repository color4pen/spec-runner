/**
 * Show a summary of token usage across all archived change folders.
 * usage.json が存在しない archive は silent skip。
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readUsageFile } from "../usage/store.js";
import { archivedChangesDirRel, parseArchiveDirName } from "../../util/paths.js";
import type { ModelUsage } from "../port/model-usage.js";
import type { CommandInvocation } from "../usage/types.js";
import { stdoutWrite } from "../../logger/stdout.js";
import { computeCostUsd, formatUsd } from "../usage/pricing.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single archived slug and all its invocations. */
export interface SlugUsage {
  slug: string;
  invocations: CommandInvocation[];
}

/** Aggregated usage data from all slugs. */
export interface UsageAggregation {
  /** Per-slug, per-model token totals. */
  bySlug: Record<string, Record<string, ModelUsage>>;
  /** Per-step, per-model token totals. step key = stepName ?? command */
  byStepModel: Record<string, Record<string, ModelUsage>>;
  /** Grand totals per model across all slugs. */
  grandTotal: Record<string, ModelUsage>;
  /** Number of archive entries that had usage data. */
  entryCount: number;
}

// ---------------------------------------------------------------------------
// Pure: aggregateUsage
// ---------------------------------------------------------------------------

function addModelUsage(target: Record<string, ModelUsage>, model: string, usage: ModelUsage): void {
  if (!target[model]) {
    target[model] = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
  }
  const t = target[model]!;
  t.inputTokens += usage.inputTokens;
  t.outputTokens += usage.outputTokens;
  t.cacheReadInputTokens += usage.cacheReadInputTokens;
  t.cacheCreationInputTokens += usage.cacheCreationInputTokens;
}

/**
 * Aggregate usage from a list of slug usages into a structured UsageAggregation.
 *
 * - modelUsage === null entries are skipped (no usage data available).
 * - step key = inv.stepName ?? inv.command
 */
export function aggregateUsage(collected: SlugUsage[]): UsageAggregation {
  const bySlug: Record<string, Record<string, ModelUsage>> = {};
  const byStepModel: Record<string, Record<string, ModelUsage>> = {};
  const grandTotal: Record<string, ModelUsage> = {};
  let entryCount = 0;

  for (const { slug, invocations } of collected) {
    entryCount++;
    if (!bySlug[slug]) {
      bySlug[slug] = {};
    }
    const slugTotals = bySlug[slug]!;

    for (const inv of invocations) {
      if (!inv.modelUsage) continue;

      const stepKey = inv.stepName ?? inv.command;

      if (!byStepModel[stepKey]) {
        byStepModel[stepKey] = {};
      }
      const stepTotals = byStepModel[stepKey]!;

      for (const [model, usage] of Object.entries(inv.modelUsage)) {
        addModelUsage(slugTotals, model, usage);
        addModelUsage(stepTotals, model, usage);
        addModelUsage(grandTotal, model, usage);
      }
    }
  }

  return { bySlug, byStepModel, grandTotal, entryCount };
}

// ---------------------------------------------------------------------------
// Pure: renderUsageSummary
// ---------------------------------------------------------------------------

/** Compute total cost for a model→usage map. Returns { total, unpricedCount }. */
function sumCosts(modelMap: Record<string, ModelUsage>): { total: number; unpricedCount: number } {
  let total = 0;
  let unpricedCount = 0;
  for (const [model, usage] of Object.entries(modelMap)) {
    const cost = computeCostUsd(model, usage);
    if (cost === null) {
      unpricedCount++;
    } else {
      total += cost;
    }
  }
  return { total, unpricedCount };
}

/** Sort model entries by cost (descending), then by model name (ascending). */
function sortedModelEntries(modelMap: Record<string, ModelUsage>): Array<[string, ModelUsage]> {
  return Object.entries(modelMap).sort(([aModel, aUsage], [bModel, bUsage]) => {
    const aCost = computeCostUsd(aModel, aUsage) ?? -1;
    const bCost = computeCostUsd(bModel, bUsage) ?? -1;
    if (bCost !== aCost) return bCost - aCost;
    return aModel.localeCompare(bModel);
  });
}

/**
 * Render the usage summary as a plain-text string.
 *
 * Layout (design D6):
 *   Usage Summary (N archive entries)
 *   ────────────────────────────────────────
 *   By slug:
 *   <slug>:
 *     <model>: in=<i> out=<o> cacheRead=<cr> cacheCreate=<cc> cost=$<x.xxxx>
 *
 *   By step × model:
 *   <step>:
 *     <model>: in=<i> out=<o> cost=$<x.xxxx>
 *
 *   ────────────────────────────────────────
 *   Grand Total:
 *     <model>: in=<i> out=<o> cacheRead=<cr> cacheCreate=<cc> cost=$<x.xxxx>
 *   Total cost: $<x.xxxx>[ (excludes N unpriced model(s))]
 *
 *   [(K archive entries skipped — no usage.json)]
 */
export function renderUsageSummary(agg: UsageAggregation, skippedCount: number): string {
  const SEP = "─".repeat(40);
  const lines: string[] = [];

  lines.push(`Usage Summary (${agg.entryCount} archive entries)`);
  lines.push(SEP);

  // --- By slug ---
  lines.push("By slug:");
  const slugNames = Object.keys(agg.bySlug).sort();
  for (const slug of slugNames) {
    lines.push(`${slug}:`);
    const slugModels = agg.bySlug[slug]!;
    for (const [model, usage] of sortedModelEntries(slugModels)) {
      const cost = formatUsd(computeCostUsd(model, usage));
      lines.push(
        `  ${model}: in=${usage.inputTokens} out=${usage.outputTokens} cacheRead=${usage.cacheReadInputTokens} cacheCreate=${usage.cacheCreationInputTokens} cost=${cost}`,
      );
    }
  }

  // --- By step × model ---
  lines.push("");
  lines.push("By step × model:");

  // Sort steps by total cost descending, then by step name ascending
  const stepEntries = Object.entries(agg.byStepModel);
  stepEntries.sort(([aStep, aModels], [bStep, bModels]) => {
    const aTotalCost = sumCosts(aModels).total;
    const bTotalCost = sumCosts(bModels).total;
    if (bTotalCost !== aTotalCost) return bTotalCost - aTotalCost;
    return aStep.localeCompare(bStep);
  });

  for (const [step, stepModels] of stepEntries) {
    lines.push(`${step}:`);
    for (const [model, usage] of sortedModelEntries(stepModels)) {
      const cost = formatUsd(computeCostUsd(model, usage));
      lines.push(
        `  ${model}: in=${usage.inputTokens} out=${usage.outputTokens} cost=${cost}`,
      );
    }
  }

  // --- Grand Total ---
  lines.push("");
  lines.push(SEP);
  lines.push("Grand Total:");
  for (const [model, usage] of sortedModelEntries(agg.grandTotal)) {
    const cost = formatUsd(computeCostUsd(model, usage));
    lines.push(
      `  ${model}: in=${usage.inputTokens} out=${usage.outputTokens} cacheRead=${usage.cacheReadInputTokens} cacheCreate=${usage.cacheCreationInputTokens} cost=${cost}`,
    );
  }

  // Total cost line
  const { total, unpricedCount } = sumCosts(agg.grandTotal);
  let totalLine = `Total cost: ${formatUsd(total)}`;
  if (unpricedCount > 0) {
    totalLine += ` (excludes ${unpricedCount} unpriced model(s))`;
  }
  lines.push(totalLine);

  // Skip note
  if (skippedCount > 0) {
    lines.push("");
    lines.push(`(${skippedCount} archive entries skipped — no usage.json)`);
  }

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// IO: showUsageSummary
// ---------------------------------------------------------------------------

/**
 * Show a summary of token usage across all archived change folders.
 * @param cwd  The project root directory
 * @returns    Exit code: 0 always (missing usage.json is silent skip)
 */
export async function showUsageSummary(cwd: string): Promise<number> {
  const archiveDir = path.join(cwd, archivedChangesDirRel());

  let archiveEntries: string[];
  try {
    archiveEntries = await fs.readdir(archiveDir);
  } catch {
    stdoutWrite("No archive directory found.\n");
    return 0;
  }

  let skippedCount = 0;
  const collected: SlugUsage[] = [];

  for (const entry of archiveEntries) {
    const entryPath = path.join(archiveDir, entry);

    let stat: { isDirectory(): boolean };
    try {
      stat = await fs.stat(entryPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const parsed = parseArchiveDirName(entry);
    const usagePath = path.join(entryPath, "usage.json");

    let usageFile;
    try {
      usageFile = await readUsageFile(usagePath);
    } catch {
      skippedCount++;
      continue;
    }

    if (usageFile.commandInvocations.length === 0) {
      skippedCount++;
      continue;
    }

    collected.push({ slug: parsed.slug, invocations: usageFile.commandInvocations });
  }

  if (collected.length === 0) {
    stdoutWrite("No usage data found in archive.\n");
    if (skippedCount > 0) {
      stdoutWrite(`(${skippedCount} archive entries skipped — no usage.json)\n`);
    }
    return 0;
  }

  const agg = aggregateUsage(collected);
  const output = renderUsageSummary(agg, skippedCount);
  stdoutWrite(output);

  return 0;
}
