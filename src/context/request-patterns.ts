/**
 * request-patterns: Collect example request.md files from archived changes
 * to provide context for the LLM when generating new request files.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parseRequestMdContent } from "../parser/request-md.js";

export interface RequestPattern {
  type: string;
  title: string;
  slug: string;
  content: string;
}

/**
 * Collect example request patterns from changes/archive directory.
 *
 * Returns up to maxSamples patterns:
 * - Up to 3 from the same type (sorted alphabetically by slug)
 * - Up to 1 from a different type
 *
 * Silently skips directories/files that cannot be read.
 * Returns empty array if archive/ directory does not exist.
 */
export async function collectRequestPatterns(
  cwd: string,
  targetType: string,
  maxSamples = 4,
): Promise<RequestPattern[]> {
  const archiveDir = path.join(cwd, "specrunner", "changes", "archive");

  let entries: string[];
  try {
    const dirEntries = await fs.readdir(archiveDir, { withFileTypes: true });
    entries = dirEntries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort(); // alphabetical order (slug order)
  } catch {
    return [];
  }

  const sameTypePatterns: RequestPattern[] = [];
  const otherTypePatterns: RequestPattern[] = [];

  for (const slug of entries) {
    const requestPath = path.join(archiveDir, slug, "request.md");
    let content: string;
    try {
      content = await fs.readFile(requestPath, "utf-8");
    } catch {
      continue; // skip unreadable files
    }

    let parsed: ReturnType<typeof parseRequestMdContent>;
    try {
      parsed = parseRequestMdContent(content, requestPath);
    } catch {
      continue; // skip invalid request files
    }

    const pattern: RequestPattern = {
      type: parsed.type,
      title: parsed.title,
      slug: parsed.slug,
      content,
    };

    if (parsed.type === targetType) {
      sameTypePatterns.push(pattern);
    } else {
      otherTypePatterns.push(pattern);
    }
  }

  // Up to 3 same-type + 1 other-type, total maxSamples
  const maxSameType = Math.min(3, maxSamples);
  const result = sameTypePatterns.slice(0, maxSameType);

  if (result.length < maxSamples && otherTypePatterns.length > 0) {
    result.push(otherTypePatterns[0]!);
  }

  return result.slice(0, maxSamples);
}
