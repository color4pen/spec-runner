/**
 * CLI handler for `specrunner usage [slug]`.
 * Extracted from command-registry.ts inline handler (T-15).
 */

import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";
import { showUsage } from "../core/command/usage-show.js";
import { showUsageSummary } from "../core/command/usage-summary.js";

/* c8 ignore next 9 */
export async function handleUsage(parsed: ParsedArgs, ctx?: CommandContext): Promise<number> {
  const slug = parsed.positional;
  // ctx is always provided by the dispatch layer; ctx! is safe here.
  if (slug) {
    return await showUsage(slug, ctx!.invokerCwd);
  } else {
    return await showUsageSummary(ctx!.invokerCwd);
  }
}
