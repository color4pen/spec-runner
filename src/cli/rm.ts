/**
 * CLI entry point for `specrunner rm`.
 *
 * Exit codes: 0 (success), 1 (execution error), 2 (arg error).
 *
 * Usage:
 *   specrunner rm <jobId> [--force]
 *   specrunner rm --all-terminated [--yes]
 */
import { loadConfig } from "../config/store.js";
import { createAnthropicClient } from "../adapter/managed-agent/client.js";
import { removeSingleJob, removeAllTerminated } from "../core/rm/runner.js";
import { resolveJobId } from "../state/store.js";
import { SpecRunnerError } from "../errors.js";

export interface RunRmOptions {
  jobId?: string;
  force: boolean;
  allTerminated: boolean;
  yes: boolean;
}

/**
 * Run the rm command.
 * Returns exit code: 0 (success), 1 (error), 2 (arg error).
 * Caller (bin/specrunner.ts) is responsible for process.exit().
 */
export async function runRm(opts: RunRmOptions): Promise<number> {
  const { jobId, force, allTerminated, yes } = opts;

  // Arg validation
  if (!allTerminated && !jobId) {
    process.stderr.write("Error: specrunner rm requires a <jobId> or --all-terminated.\n");
    return 2;
  }
  if (allTerminated && jobId) {
    process.stderr.write("Error: --all-terminated cannot be combined with a <jobId> argument.\n");
    return 2;
  }

  // Load config
  let config;
  try {
    config = await loadConfig();
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\n`);
      if (err.hint) process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    return 1;
  }

  // Build Anthropic client for managed mode
  const anthropicClient =
    config.runtime === "managed" && process.env["SPECRUNNER_API_KEY"]
      ? createAnthropicClient(process.env["SPECRUNNER_API_KEY"])
      : undefined;

  if (allTerminated) {
    const result = await removeAllTerminated({
      yes,
      config,
      anthropicClient,
    });
    writeResult(result);
    return result.exitCode;
  }

  // Single job removal — resolve short ID to full UUID first
  let resolvedJobId: string;
  try {
    resolvedJobId = await resolveJobId(jobId!);
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\n`);
      if (err.hint) process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    return 1;
  }

  const result = await removeSingleJob({
    jobId: resolvedJobId,
    force,
    config,
    anthropicClient,
  });
  writeResult(result);
  return result.exitCode;
}

/**
 * Write all runner result messages to stdout/stderr.
 * info[] → stdout, warnings[] → stderr, message → stdout (success) or stderr (error).
 */
function writeResult(result: { exitCode: number; message?: string; warnings?: string[]; info?: string[] }): void {
  for (const msg of result.info ?? []) {
    process.stdout.write(`${msg}\n`);
  }
  for (const warn of result.warnings ?? []) {
    process.stderr.write(`${warn}\n`);
  }
  if (result.message) {
    if (result.exitCode === 0) {
      process.stdout.write(`${result.message}\n`);
    } else {
      process.stderr.write(`Error: ${result.message}\n`);
    }
  }
}
