/**
 * CLI handler for `specrunner guide [topic]`.
 * Extracted from command-registry.ts inline handler (T-15).
 */

import type { ParsedArgs } from "./flag-parser.js";
import { runGuide } from "../core/command/guide.js";

export async function handleGuide(parsed: ParsedArgs): Promise<number> {
  return runGuide(parsed.positional);
}
