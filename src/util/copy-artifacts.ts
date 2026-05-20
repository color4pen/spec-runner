/**
 * Shared artifact copy helpers for runtime setup.
 * Extracted to avoid duplication between LocalRuntime and ManagedRuntime.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SpawnFn } from "./spawn.js";
import { rulesSourcePath, rulesDestPath } from "./paths.js";

/**
 * Copies specrunner/rules.md from repoRoot into the change folder
 * so agents can read project disciplines alongside request.md.
 *
 * Non-fatal: if rules.md is absent, emits a warning and continues without throwing.
 *
 * @param repoRoot - Absolute path to the repository root (worktreePath for local, cwd for managed).
 * @param slug     - The change slug (determines the change folder path).
 * @param spawnFn  - Spawn helper for git commands.
 */
export async function copyRulesToChangeFolder(
  repoRoot: string,
  slug: string,
  spawnFn: SpawnFn,
): Promise<void> {
  const src = path.join(repoRoot, rulesSourcePath());
  const dest = path.join(repoRoot, rulesDestPath(slug));
  try {
    await fs.access(src);
    await fs.cp(src, dest);
    const result = await spawnFn("git", ["add", rulesDestPath(slug)], { cwd: repoRoot });
    if (result.exitCode !== 0) {
      process.stderr.write(
        `Warning: failed to stage change folder rules.md: ${result.stderr.trim()}\n`,
      );
    }
  } catch {
    process.stderr.write("Warning: specrunner/rules.md not found — skipping change folder copy\n");
  }
}
