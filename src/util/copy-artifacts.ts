/**
 * Shared artifact copy helpers for runtime setup.
 * Extracted to avoid duplication between LocalRuntime and ManagedRuntime.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SpawnFn } from "./spawn.js";
import { rulesDestPath, usageJsonPath } from "./paths.js";
import { RULES_MD_CONTENT } from "../prompts/rules.js";
import { stderrWrite } from "../logger/stdout.js";
import { SpecRunnerError, ERROR_CODES } from "../errors.js";

/**
 * Rejects a file path if it is a symbolic link.
 * Throws SpecRunnerError(SYMLINK_REJECTED) when a symlink is detected.
 * Silent no-op when the file does not exist (ENOENT) — absence is handled by the caller.
 *
 * @param filePath - Absolute path to check.
 */
export async function rejectSymlink(filePath: string): Promise<void> {
  try {
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink()) {
      throw new SpecRunnerError(
        ERROR_CODES.SYMLINK_REJECTED,
        "Remove the symlink and use a regular file.",
        `${filePath} is a symbolic link.`,
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw err;
  }
}

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
    stderrWrite(
      `Warning: failed to stage change folder rules.md: ${result.stderr.trim()}`,
    );
  }
}

/**
 * Copy the draft's usage.json (if it exists) to the change folder and stage it.
 * Silent no-op when the draft usage.json is absent (= review/generate never ran).
 *
 * @param draftRequestFilePath - Absolute path to the draft's request.md (used to derive the draft folder).
 * @param targetCwd            - Repo working directory where the change folder lives
 *                                (worktreePath for local, this.cwd for managed).
 * @param slug                 - The change slug (determines the change folder path).
 * @param spawnFn              - Spawn helper for git commands.
 */
export async function copyDraftUsageToChangeFolder(
  draftRequestFilePath: string,
  targetCwd: string,
  slug: string,
  spawnFn: SpawnFn,
): Promise<void> {
  const draftUsageSrc = path.join(path.dirname(draftRequestFilePath), "usage.json");
  const changeUsageDst = path.join(targetCwd, usageJsonPath(slug));
  await rejectSymlink(draftUsageSrc);
  try {
    await fs.cp(draftUsageSrc, changeUsageDst);
  } catch {
    // usage.json absent — normal case (review/generate not run)
    return;
  }
  await spawnFn("git", ["add", usageJsonPath(slug)], { cwd: targetCwd });
}
