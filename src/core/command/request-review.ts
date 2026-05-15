/**
 * Core logic for the `specrunner request review` command.
 *
 * Performs an architect review of a request.md file using the Claude Agent SDK
 * directly (no pipeline machinery). Stateless one-shot command.
 *
 * Exit codes:
 *   0 — approve or needs-discussion (non-error verdicts)
 *   1 — reject or execution error
 */
import * as fs from "node:fs/promises";
import { parseRequestMdContent } from "../../parser/request-md.js";
import { SpecRunnerError } from "../../errors.js";
import { loadConfig } from "../../config/store.js";
import { runReview } from "../request/reviewer.js";

// Re-export types and helpers from reviewer.ts for backward compatibility
export type {
  RequestReviewVerdict,
  RequestReviewFinding,
  RequestReviewResult,
} from "../request/reviewer.js";
export {
  parseReviewOutput,
  verdictToExitCode,
  buildInitialMessage,
} from "../request/reviewer.js";

/**
 * Execute the `request review` subcommand.
 *
 * @param filePath  Path to the request.md file to review
 * @param opts      Options: json=true outputs structured JSON instead of raw text
 * @returns         Exit code: 0 (approve/needs-discussion), 1 (reject or error)
 */
export async function executeReview(filePath: string, opts: { json: boolean }): Promise<number> {
  // Step 1: Read the request.md file
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    return 1;
  }

  // Step 2: Validate format using parseRequestMdContent
  try {
    parseRequestMdContent(content, filePath);
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.stderr.write(`Hint: ${err.hint}\n`);
    } else {
      process.stderr.write(`Error: ${(err as Error).message}\n`);
    }
    return 1;
  }

  // Step 3: Load config (gracefully degrade if not initialized)
  let config: import("../../config/schema.js").SpecRunnerConfig;
  try {
    config = await loadConfig();
  } catch {
    config = {} as import("../../config/schema.js").SpecRunnerConfig;
  }

  // Steps 4-9: Delegated to runReview()
  let result: import("../request/reviewer.js").RequestReviewResult;
  try {
    result = await runReview(content, config, process.cwd());
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\n`);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: Review session failed: ${message}\n`);
    }
    return 1;
  }

  // Step 10: Output
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    const { formatHumanReadable } = await import("../request/reviewer.js");
    process.stdout.write(formatHumanReadable(result) + "\n");
  }

  // Step 12: Return exit code based on verdict
  const { verdictToExitCode } = await import("../request/reviewer.js");
  return verdictToExitCode(result.verdict);
}
