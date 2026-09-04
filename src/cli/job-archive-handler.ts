/**
 * CLI handler for `specrunner job archive`.
 * Extracted from archive.ts (T-19): uses static imports for archive-from-issue.ts to
 * eliminate the value-import cycle that was previously hidden by await import().
 *
 * Dependency direction:
 *   job-archive-handler → archive.ts (runArchive / ARCHIVE_USAGE)
 *   job-archive-handler → archive-from-issue.ts (runArchiveFromIssue)
 *   archive-from-issue.ts → archive.ts (runArchive)  ← existing, unchanged
 */

import { EXIT_CODE } from "../errors.js";
import { logError, stderrWrite } from "../logger/stdout.js";
import { runArchive, ARCHIVE_USAGE } from "./archive.js";
import { runArchiveFromIssue } from "./archive-from-issue.js";
import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";

/**
 * CLI handler for `specrunner job archive`.
 * Returns the exit code; process termination is owned by the dispatch boundary.
 */
export async function handleJobArchive(parsed: ParsedArgs, ctx?: CommandContext): Promise<number> {
  const slug = parsed.positional as string | undefined;
  const fromIssue = parsed.flags["from-issue"] as number | undefined;
  const withMerge = !!parsed.flags["with-merge"];

  // Strict XOR: exactly one of slug or --from-issue
  if (fromIssue !== undefined && slug !== undefined) {
    logError("'job archive': <slug> and --from-issue are mutually exclusive. Specify exactly one.");
    return EXIT_CODE.ARG_ERROR;
  }
  if (fromIssue === undefined && slug === undefined) {
    logError("'job archive': either <slug> or --from-issue is required.");
    stderrWrite(ARCHIVE_USAGE);
    return EXIT_CODE.ARG_ERROR;
  }

  // Lenient parse of --merge-wait-ms (shared by both paths)
  let mergeWaitMs: number | undefined;
  const mergeWaitMsRaw = parsed.flags["merge-wait-ms"] as string | undefined;
  if (mergeWaitMsRaw !== undefined) {
    const parsedMs = parseInt(String(mergeWaitMsRaw), 10);
    if (!Number.isNaN(parsedMs) && parsedMs >= 0) {
      mergeWaitMs = parsedMs;
    }
    // Ignore invalid values (non-numeric) — lenient behavior
  }

  if (fromIssue !== undefined) {
    // Static import — no value-import cycle with archive-from-issue.ts
    return await runArchiveFromIssue(fromIssue, { withMerge, mergeWaitMs, cwd: process.cwd() }, ctx);
  } else {
    return await runArchive({
      slug: slug!,
      withMerge,
      cwd: process.cwd(),
      mergeWaitMs,
    });
  }
}
