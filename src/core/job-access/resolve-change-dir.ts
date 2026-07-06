/**
 * Resolve the absolute path to a change folder for a given slug.
 *
 * Resolution order: active change → archive (most recent by date prefix).
 * Returns null if not found in either location.
 */
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import { archivedChangesDirRel, parseArchiveDirName } from "../../util/paths.js";

/**
 * Resolve the absolute path to the change folder for the given slug.
 * Returns null if not found in active changes or archive.
 * Resolution order: active → archive (most recent by date).
 */
export async function resolveChangeDir(slug: string, repoRoot: string): Promise<string | null> {
  // 1. Active change
  const activeDir = path.join(repoRoot, "specrunner", "changes", slug);
  try {
    await fsPromises.access(activeDir);
    return activeDir;
  } catch {
    // Not found in active
  }

  // 2. Archive — find newest date matching slug
  const archiveBaseDir = path.join(repoRoot, archivedChangesDirRel());
  let entries: string[];
  try {
    entries = await fsPromises.readdir(archiveBaseDir);
  } catch {
    return null;
  }

  let bestDate: string | null = null;
  let bestDir: string | null = null;

  for (const entry of entries) {
    const parsed = parseArchiveDirName(entry);
    if (parsed.slug === slug) {
      if (parsed.date !== null) {
        if (bestDate === null || parsed.date > bestDate) {
          bestDate = parsed.date;
          bestDir = entry;
        }
      } else if (bestDate === null && bestDir === null) {
        bestDir = entry;
      }
    }
  }

  if (bestDir) {
    return path.join(archiveBaseDir, bestDir);
  }
  return null;
}
