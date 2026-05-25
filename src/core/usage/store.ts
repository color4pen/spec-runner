/**
 * Read/write operations for usage.json files.
 *
 * Design: append-only — entries are never deleted or overwritten.
 * atomicWriteJson ensures partial writes don't corrupt the file.
 */
import * as fs from "node:fs/promises";
import type { UsageFile, CommandInvocation } from "./types.js";
import type { JobState } from "../../state/schema.js";
import { atomicWriteJson } from "../../util/atomic-write.js";

/**
 * Read a usage.json file from disk.
 * Returns an empty structure if the file does not exist.
 */
export async function readUsageFile(filePath: string): Promise<UsageFile> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "commandInvocations" in parsed &&
      Array.isArray((parsed as Record<string, unknown>)["commandInvocations"])
    ) {
      return parsed as UsageFile;
    }
    return { commandInvocations: [] };
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { commandInvocations: [] };
    }
    throw err;
  }
}

/**
 * Append a CommandInvocation entry to usage.json and write atomically.
 * Reads the current file first to preserve existing entries.
 */
export async function appendInvocation(
  filePath: string,
  entry: CommandInvocation,
): Promise<void> {
  const file = await readUsageFile(filePath);
  file.commandInvocations.push(entry);
  await atomicWriteJson(filePath, file);
}

/**
 * Derive CommandInvocation entries from a JobState.
 * Each StepRun in the state becomes a "job" entry.
 * Entries are sorted ascending by timestamp.
 *
 * StepRun entries with modelUsage === undefined are recorded with modelUsage: null.
 */
export async function deriveFromJobState(state: JobState): Promise<CommandInvocation[]> {
  const entries: CommandInvocation[] = [];
  const steps = state.steps ?? {};

  for (const [stepName, runs] of Object.entries(steps)) {
    for (const run of runs) {
      entries.push({
        command: "job",
        timestamp: run.endedAt,
        modelUsage: run.modelUsage ?? null,
        jobId: state.jobId,
        stepName,
      });
    }
  }

  // Sort ascending by timestamp
  entries.sort((a, b) => {
    if (a.timestamp < b.timestamp) return -1;
    if (a.timestamp > b.timestamp) return 1;
    return 0;
  });

  return entries;
}
