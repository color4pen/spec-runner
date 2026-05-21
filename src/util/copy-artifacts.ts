/**
 * Shared artifact copy helpers for runtime setup.
 * Extracted to avoid duplication between LocalRuntime and ManagedRuntime.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SpawnFn } from "./spawn.js";
import { rulesDestPath } from "./paths.js";
import { RULES_MD_CONTENT } from "../prompts/rules.js";

/**
 * Writes embedded rules content into the change folder
 * so agents can read project disciplines alongside request.md.
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
  const dest = path.join(repoRoot, rulesDestPath(slug));
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, RULES_MD_CONTENT);
  const result = await spawnFn("git", ["add", rulesDestPath(slug)], { cwd: repoRoot });
  if (result.exitCode !== 0) {
    process.stderr.write(
      `Warning: failed to stage change folder rules.md: ${result.stderr.trim()}\n`,
    );
  }
}
