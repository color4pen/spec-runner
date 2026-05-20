/**
 * Core logic for the `specrunner request new` command.
 *
 * Creates a new request file at specrunner/requests/active/<slug>.md.
 */
import * as path from "node:path";
import { buildScaffoldTemplate } from "./request.js";
import { checkSlugCollision, write as storeWrite } from "../request/store.js";
import { SpecRunnerError } from "../../errors.js";

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Execute `request new` subcommand.
 * Creates specrunner/requests/active/<slug>.md from a scaffold template.
 * Returns 0 on success, 1 on slug collision, 2 on invalid slug.
 */
export async function executeNew(
  slug: string,
  type: string,
  cwd: string,
): Promise<number> {
  // slug validation (path traversal prevention)
  if (!SLUG_REGEX.test(slug)) {
    process.stderr.write(
      `Error: Invalid slug '${slug}'. Must match /^[a-z0-9][a-z0-9-]{0,63}$/\n`,
    );
    return 2;
  }

  // Collision check
  try {
    await checkSlugCollision(cwd, slug);
  } catch (err) {
    if (err instanceof SpecRunnerError) {
      process.stderr.write(`Error: ${err.message}\nHint: ${err.hint}\n`);
      return 1;
    }
    throw err;
  }

  // Generate template
  const content = buildScaffoldTemplate({
    title: "<タイトルを記入>",
    type,
    slug,
  });

  // Write file
  await storeWrite(cwd, slug, content);

  const relPath = path.join("specrunner", "requests", "active", slug + ".md");
  process.stderr.write(`Created: ${relPath}\n`);
  return 0;
}
