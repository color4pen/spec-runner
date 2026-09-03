/**
 * CLI handlers for `specrunner rules new` and `specrunner reviewers new`.
 * Extracted from command-registry.ts inline handlers (T-14).
 */

import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";
import { executeRulesNew } from "../core/command/rules-new.js";
import { executeReviewersNew } from "../core/command/reviewers-new.js";

/* c8 ignore next 4 */
export async function handleRulesNew(parsed: ParsedArgs, ctx?: CommandContext): Promise<void> {
  // ctx is always provided by the dispatch layer; ctx! is safe here.
  process.exit(await executeRulesNew(parsed.positionals[0]!, parsed.positionals[1]!, ctx!.invokerCwd));
}

/* c8 ignore next 4 */
export async function handleReviewersNew(parsed: ParsedArgs, ctx?: CommandContext): Promise<void> {
  // ctx is always provided by the dispatch layer; ctx! is safe here.
  process.exit(await executeReviewersNew(parsed.positional!, ctx!.invokerCwd));
}
