/**
 * CLI handlers for `specrunner request *` commands.
 * Extracted from command-registry.ts inline handlers (T-04).
 */

import * as path from "node:path";
import * as fs from "node:fs";
import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";
import { executeTemplate, executeValidate } from "../core/command/request.js";
import { executePrompt } from "../core/command/request-prompt.js";
import { executeList } from "../core/command/request-list.js";
import { executeNew } from "../core/command/request-new.js";
import { resolveWithFallback as storeResolve } from "../core/request/store.js";
import { SLUG_REGEX } from "../util/validation-patterns.js";
import { logError, stderrWrite } from "../logger/stdout.js";

export async function handleRequestNew(parsed: ParsedArgs, ctx?: CommandContext): Promise<void> {
  const slug = parsed.positional!;
  const requestType = (parsed.flags["type"] as string | undefined) ?? "new-feature";
  process.exit(await executeNew(slug, requestType, ctx!.repoRoot!));
}

export async function handleRequestPrompt(): Promise<void> {
  process.exit(executePrompt());
}

export async function handleRequestLs(): Promise<void> {
  process.exit(await executeList(process.cwd()));
}

export async function handleRequestTemplate(parsed: ParsedArgs): Promise<void> {
  const requestType = (parsed.flags["type"] as string | undefined) ?? "new-feature";
  process.exit(executeTemplate(requestType));
}

export async function handleRequestValidate(parsed: ParsedArgs): Promise<void> {
  const input = parsed.positional!;
  let filePath = path.resolve(process.cwd(), input);
  if (!fs.existsSync(filePath)) {
    if (!SLUG_REGEX.test(input)) {
      logError(`Invalid slug '${input}'. Must match /^[a-z0-9][a-z0-9-]{0,63}$/`);
      process.exit(2);
    }
    const slugResolved = storeResolve(process.cwd(), input);
    if (!fs.existsSync(slugResolved)) {
      logError(`'${input}' is neither a file path nor an active request slug.`);
      stderrWrite("Hint: Use 'specrunner request ls' to see available slugs.");
      process.exit(1);
    }
    filePath = slugResolved;
  }
  process.exit(await executeValidate(filePath));
}
