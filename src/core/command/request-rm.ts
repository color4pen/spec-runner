/**
 * Core logic for the `specrunner request rm` command.
 *
 * Removes specrunner/requests/active/<slug>.md file.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ACTIVE_SUBDIR = path.join("specrunner", "requests", "active");

/**
 * Execute `request rm` subcommand.
 * Deletes specrunner/requests/active/<slug>.md.
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

  const filePath = path.join(cwd, ACTIVE_SUBDIR, slug + ".md");
  try {
    await fs.access(filePath);
  } catch {
    process.stderr.write(`Request not found: ${slug}\n`);
    return 1;
  }

  await fs.unlink(filePath);
  process.stderr.write(`Removed: specrunner/requests/active/${slug}.md\n`);
  return 0;
}
