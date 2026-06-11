/**
 * Loader for custom reviewer definitions from `specrunner/reviewers/`.
 *
 * Design: fs is injected (same convention as rules-resolve.ts).
 * No node:fs direct import — callers pass the adapter.
 */
import * as path from "node:path";
import { reviewersDirRel } from "../../util/paths.js";
import { parseReviewerDefinition } from "./definition.js";
import type { ReviewerDefinition } from "./types.js";

/**
 * Injectable fs interface for reviewer loading.
 * Matches the RulesResolveFs interface for consistency.
 */
export interface ReviewerLoadFs {
  /** List files in a directory. Returns string[] (entry names, no paths). */
  readdir(dir: string): Promise<string[]>;
  /** Read file contents as string. */
  readFile(filePath: string, encoding: string): Promise<string>;
}

/**
 * Load all reviewer definitions from `specrunner/reviewers/*.md`.
 *
 * Returns definitions sorted by filename (ascending — declaration order).
 * Returns [] when the directory does not exist (ENOENT) or is empty.
 *
 * @param cwd - Absolute path to the repository root.
 * @param fs  - Injectable fs adapter.
 */
export async function loadReviewerDefinitions(
  cwd: string,
  fs: ReviewerLoadFs,
): Promise<ReviewerDefinition[]> {
  const dir = path.join(cwd, reviewersDirRel());

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  // Only .md files, sorted ascending (declaration order)
  const mdFiles = entries.filter((e) => e.endsWith(".md")).sort();

  const defs: ReviewerDefinition[] = [];
  for (const file of mdFiles) {
    const filePath = path.join(dir, file);
    const content = await fs.readFile(filePath, "utf-8");
    defs.push(parseReviewerDefinition(file, content));
  }

  return defs;
}
