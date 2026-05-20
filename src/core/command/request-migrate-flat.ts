/**
 * Migration: dir形式 → flat形式
 *
 * specrunner/drafts/<slug>/request.md → specrunner/drafts/<slug>.md
 * specrunner/requests/merged/<slug>/request.md → specrunner/requests/merged/<slug>.md
 *
 * Extra files がある dir は request.md だけ move し、dir は残す (partial migration)。
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface MigrateResult {
  migrated: string[];
  partial: string[];
  skipped: string[];
}

export async function migrateRequestsFlat(cwd: string): Promise<MigrateResult> {
  const result: MigrateResult = { migrated: [], partial: [], skipped: [] };

  // Migrate drafts/ (new location)
  const draftsDir = path.join(cwd, "specrunner", "drafts");
  await migrateDir(draftsDir, "drafts", result);

  // Migrate requests/merged/ (historical, read-only maintenance)
  const mergedDir = path.join(cwd, "specrunner", "requests", "merged");
  await migrateDir(mergedDir, "merged", result);

  return result;
}

async function migrateDir(dir: string, label: string, result: MigrateResult): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry);
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(entryPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const requestMdPath = path.join(entryPath, "request.md");
    try {
      await fs.access(requestMdPath);
    } catch {
      result.skipped.push(`${label}/${entry}`);
      continue;
    }

    // Read request.md content
    const content = await fs.readFile(requestMdPath, "utf-8");

    // Write flat file
    const flatPath = path.join(dir, entry + ".md");
    await fs.writeFile(flatPath, content, "utf-8");

    // Remove request.md from dir
    await fs.unlink(requestMdPath);

    // Check for extra files
    const remaining = await fs.readdir(entryPath);
    if (remaining.length === 0) {
      await fs.rmdir(entryPath);
      result.migrated.push(`${label}/${entry}`);
    } else {
      result.partial.push(`${label}/${entry}`);
      process.stderr.write(
        `partial migration: ${label}/${entry} (extra files retained in dir)\n`,
      );
    }
  }
}
