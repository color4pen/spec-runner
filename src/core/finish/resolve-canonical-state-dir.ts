/**
 * Resolve the canonical physical location of a job's slug state dir.
 *
 * D2: slug state can exist in two locations:
 *   1. Active:  repoRoot/specrunner/changes/<slug>/          (state.json present)
 *   2. Archive: repoRoot/specrunner/changes/archive/<dated>/ (parseArchiveDirName(name).slug === slug, state.json present)
 *
 * Active takes priority over archive. Returns null when neither is found.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { changeFolderPath, archivedChangesDirRel, parseArchiveDirName } from "../../util/paths.js";

/**
 * Resolve the absolute path of the directory that holds state.json + events.jsonl
 * for the given slug, or null if no such directory exists.
 *
 * Priority: active (`changes/<slug>/`) before archive (`changes/archive/<dated>-<slug>/`).
 * Archive scan is limited to directories that contain a state.json file.
 */
export async function resolveCanonicalStateDir(slug: string, repoRoot: string): Promise<string | null> {
  // 1. Active: changes/<slug>/state.json
  const activeDir = path.join(repoRoot, changeFolderPath(slug));
  try {
    await fs.access(path.join(activeDir, "state.json"));
    return activeDir;
  } catch {
    // not found — fall through to archive
  }

  // 2. Archive: changes/archive/*/state.json where slug matches
  const archiveDirAbs = path.join(repoRoot, archivedChangesDirRel());
  try {
    const entries = await fs.readdir(archiveDirAbs, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const { slug: entrySlug } = parseArchiveDirName(entry.name);
      if (entrySlug !== slug) continue;
      const entryDir = path.join(archiveDirAbs, entry.name);
      try {
        await fs.access(path.join(entryDir, "state.json"));
        return entryDir;
      } catch {
        // no state.json in this entry — skip
      }
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }

  return null;
}
