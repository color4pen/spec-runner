/**
 * Core logic for the `specrunner request rm` command.
 *
 * Removes specrunner/requests/active/<slug>/ directory recursively.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ACTIVE_SUBDIR = path.join("specrunner", "requests", "active");

/**
 * Execute `request rm` subcommand.
 * Deletes specrunner/requests/active/<slug>/ recursively.
 * Returns 0 on success, 1 if not found, 2 if slug is invalid.
 */
export async function executeRm(slug: string, cwd: string): Promise<number> {
  // slug validation (path traversal prevention)
  if (!SLUG_REGEX.test(slug)) {
    process.stderr.write(
      `Error: Invalid slug '${slug}'. Must match /^[a-z0-9][a-z0-9-]{0,63}$/\n`,
    );
    return 2;
  }

  const dir = path.join(cwd, ACTIVE_SUBDIR, slug);
  try {
    await fs.access(dir);
  } catch {
    process.stderr.write(`Request not found: ${slug}\n`);
    return 1;
  }

  await fs.rm(dir, { recursive: true });
  process.stderr.write(`Removed: specrunner/requests/active/${slug}/\n`);
  return 0;
}
