/**
 * Core logic for the `specrunner request show` command.
 *
 * Reads and prints specrunner/requests/active/<slug>.md to stdout.
 */
import * as fs from "node:fs/promises";
import { resolve as storeResolve } from "../request/store.js";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Execute `request show` subcommand.
 * Outputs the content of specrunner/requests/active/<slug>.md to stdout.
 * Returns 0 on success, 1 if not found, 2 if slug is invalid.
 */
export async function executeShow(slug: string, cwd: string): Promise<number> {
  // slug validation
  if (!SLUG_REGEX.test(slug)) {
    process.stderr.write(
      `Error: Invalid slug '${slug}'. Must match /^[a-z0-9][a-z0-9-]{0,63}$/\n`,
    );
    return 2;
  }

  const filePath = storeResolve(cwd, slug);
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    process.stderr.write(`Request not found: ${slug}\n`);
    return 1;
  }

  process.stdout.write(content);
  return 0;
}
