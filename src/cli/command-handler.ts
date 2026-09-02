/**
 * Neutral CommandHandler type contract.
 * Kept separate from command-registry.ts to prevent circular imports:
 *   registry → handler module → command-handler (type only)
 *   registry → command-handler (type only)
 */

import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";

export type CommandHandler = (parsed: ParsedArgs, ctx?: CommandContext) => Promise<void>;
