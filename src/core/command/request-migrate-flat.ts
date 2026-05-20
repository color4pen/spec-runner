/**
 * Migration: dir形式 → flat形式
 *
 * specrunner/requests/{active,merged}/<slug>/request.md
 * → specrunner/requests/{active,merged}/<slug>.md
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

  for (const subdir of ["active", "merged"]) {
    const dir = path.join(cwd, "specrunner", "requests", subdir);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
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
        result.skipped.push(`${subdir}/${entry}`);
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
        result.migrated.push(`${subdir}/${entry}`);
      } else {
        result.partial.push(`${subdir}/${entry}`);
        process.stderr.write(
          `partial migration: ${subdir}/${entry} (extra files retained in dir)\n`,
        );
      }
    }
  }

  return result;
}
