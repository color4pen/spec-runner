/**
 * Show a summary of token usage across all archived change folders.
 * usage.json が存在しない archive は silent skip。
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readUsageFile } from "../usage/store.js";
import { archivedChangesDirRel, parseArchiveDirName } from "../../util/paths.js";
import type { ModelUsage } from "../port/model-usage.js";

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
    process.stdout.write("No archive directory found.\n");
    return 0;
  }

  let skippedCount = 0;
  const grandTotals: Record<string, ModelUsage> = {};
  const slugRows: Array<{ slug: string; totals: Record<string, ModelUsage> }> = [];

  for (const entry of archiveEntries) {
    const entryPath = path.join(archiveDir, entry);

    // Only process directories
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

    // Aggregate per-slug totals
    const slugTotals: Record<string, ModelUsage> = {};

    for (const inv of usageFile.commandInvocations) {
      if (!inv.modelUsage) continue;
      for (const [model, usage] of Object.entries(inv.modelUsage)) {
        if (!slugTotals[model]) {
          slugTotals[model] = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
        }
        const t = slugTotals[model]!;
        t.inputTokens += usage.inputTokens;
        t.outputTokens += usage.outputTokens;
        t.cacheReadInputTokens += usage.cacheReadInputTokens;
        t.cacheCreationInputTokens += usage.cacheCreationInputTokens;

        // Also accumulate grand totals
        if (!grandTotals[model]) {
          grandTotals[model] = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
        }
        const gt = grandTotals[model]!;
        gt.inputTokens += usage.inputTokens;
        gt.outputTokens += usage.outputTokens;
        gt.cacheReadInputTokens += usage.cacheReadInputTokens;
        gt.cacheCreationInputTokens += usage.cacheCreationInputTokens;
      }
    }

    slugRows.push({ slug: parsed.slug, totals: slugTotals });
  }

  if (slugRows.length === 0) {
    process.stdout.write("No usage data found in archive.\n");
    if (skippedCount > 0) {
      process.stdout.write(`(${skippedCount} archive entries skipped — no usage.json)\n`);
    }
    return 0;
  }

  process.stdout.write(`Usage Summary (${slugRows.length} archive entries)\n`);
  process.stdout.write(`${"─".repeat(60)}\n`);

  for (const { slug, totals } of slugRows) {
    process.stdout.write(`${slug}:\n`);
    for (const [model, usage] of Object.entries(totals)) {
      process.stdout.write(
        `  ${model}: in=${usage.inputTokens} out=${usage.outputTokens} cacheRead=${usage.cacheReadInputTokens} cacheCreate=${usage.cacheCreationInputTokens}\n`,
      );
    }
  }

  process.stdout.write(`\n${"─".repeat(60)}\n`);
  process.stdout.write(`Grand Total:\n`);
  if (Object.keys(grandTotals).length === 0) {
    process.stdout.write(`  (no usage data)\n`);
  } else {
    for (const [model, usage] of Object.entries(grandTotals)) {
      process.stdout.write(
        `  ${model}: in=${usage.inputTokens} out=${usage.outputTokens} cacheRead=${usage.cacheReadInputTokens} cacheCreate=${usage.cacheCreationInputTokens}\n`,
      );
    }
  }

  if (skippedCount > 0) {
    process.stdout.write(`\n(${skippedCount} archive entries skipped — no usage.json)\n`);
  }

  return 0;
}
