/**
 * Show usage details for a specific slug.
 *
 * Slug resolution order:
 * 1. specrunner/changes/<slug>/usage.json (active change)
 * 2. specrunner/changes/archive/*-<slug>/usage.json (most recent archive by date)
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readUsageFile } from "../usage/store.js";
import { usageJsonPath, archivedChangesDirRel, parseArchiveDirName } from "../../util/paths.js";
import type { ModelUsage } from "../port/model-usage.js";
import { stdoutWrite, stderrWrite } from "../../logger/stdout.js";

/**
 * Show usage details for a slug.
 * @param slug  The request slug to look up
 * @param cwd   The project root directory
 * @returns     Exit code: 0 on success, 1 if no data found
 */
export async function showUsage(slug: string, cwd: string): Promise<number> {
  // Resolve the usage.json path
  const usagePath = await resolveUsagePath(slug, cwd);
  if (!usagePath) {
    stderrWrite(`No usage data found for slug '${slug}'`);
    return 1;
  }

  const usageFile = await readUsageFile(usagePath);
  if (usageFile.commandInvocations.length === 0) {
    stdoutWrite(`No invocations recorded for '${slug}'\n`);
    return 0;
  }

  // Aggregate totals by model
  const modelTotals: Record<string, ModelUsage> = {};

  stdoutWrite(`Usage for: ${slug}\n`);
  stdoutWrite(`${"─".repeat(60)}\n`);

  for (const inv of usageFile.commandInvocations) {
    const label = inv.stepName ? `${inv.command} / ${inv.stepName}` : inv.command;
    stdoutWrite(`[${inv.timestamp}] ${label}\n`);

    if (inv.modelUsage) {
      for (const [model, usage] of Object.entries(inv.modelUsage)) {
        stdoutWrite(
          `  ${model}: in=${usage.inputTokens} out=${usage.outputTokens} cacheRead=${usage.cacheReadInputTokens} cacheCreate=${usage.cacheCreationInputTokens}\n`,
        );
        // Accumulate totals
        if (!modelTotals[model]) {
          modelTotals[model] = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
        }
        const t = modelTotals[model]!;
        t.inputTokens += usage.inputTokens;
        t.outputTokens += usage.outputTokens;
        t.cacheReadInputTokens += usage.cacheReadInputTokens;
        t.cacheCreationInputTokens += usage.cacheCreationInputTokens;
      }
    } else {
      stdoutWrite(`  (no usage data)\n`);
    }
  }

  stdoutWrite(`\n${"─".repeat(60)}\n`);
  stdoutWrite(`Totals by model:\n`);
  if (Object.keys(modelTotals).length === 0) {
    stdoutWrite(`  (no usage data)\n`);
  } else {
    for (const [model, usage] of Object.entries(modelTotals)) {
      stdoutWrite(
        `  ${model}: in=${usage.inputTokens} out=${usage.outputTokens} cacheRead=${usage.cacheReadInputTokens} cacheCreate=${usage.cacheCreationInputTokens}\n`,
      );
    }
  }

  return 0;
}

/**
 * Resolve the absolute path to usage.json for the given slug.
 * Returns null if not found in active changes or archive.
 */
async function resolveUsagePath(slug: string, cwd: string): Promise<string | null> {
  // 1. Check active changes
  const activeUsagePath = path.join(cwd, usageJsonPath(slug));
  try {
    await fs.access(activeUsagePath);
    return activeUsagePath;
  } catch {
    // Not found in active changes
  }

  // 2. Check archive — find newest date matching slug
  const archiveDir = path.join(cwd, archivedChangesDirRel());
  let entries: string[];
  try {
    entries = await fs.readdir(archiveDir);
  } catch {
    return null;
  }

  // Filter dirs matching *-<slug> pattern, pick newest date
  let bestDate: string | null = null;
  let bestDir: string | null = null;

  for (const entry of entries) {
    const parsed = parseArchiveDirName(entry);
    if (parsed.slug === slug) {
      if (parsed.date !== null) {
        if (bestDate === null || parsed.date > bestDate) {
          bestDate = parsed.date;
          bestDir = entry;
        }
      } else if (bestDate === null && bestDir === null) {
        // No-date form: use if nothing better found
        bestDir = entry;
      }
    }
  }

  if (bestDir) {
    const candidatePath = path.join(archiveDir, bestDir, "usage.json");
    try {
      await fs.access(candidatePath);
      return candidatePath;
    } catch {
      return null;
    }
  }

  return null;
}
