/**
 * Shared artifact copy helpers for runtime setup.
 * Extracted to avoid duplication between LocalRuntime and ManagedRuntime.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import { rulesDestPath, usageJsonPath } from "../../util/paths.js";
import { RULES_MD_CONTENT } from "../../prompts/rules.js";
import { stderrWrite } from "../../logger/stdout.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import { getOutputTemplates } from "../../templates/step-output-templates.js";
import type { JobState } from "../../state/schema.js";

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
/**
 * Write step output templates to the change folder before an agent step runs.
 *
 * Templates are written as plain files — they are NOT staged with `git add`.
 * A-group templates (cleanup: false/undefined) will be overwritten by the agent.
 * B-group templates (cleanup: true) are reference files read by the agent; they
 * must be deleted by cleanupOutputTemplates() before commit-push.
 *
 * @param cwd      - Worktree root (absolute path).
 * @param slug     - Change slug.
 * @param stepName - Name of the step about to run.
 * @param state    - Current job state (used to compute iteration numbers).
 */
export async function writeOutputTemplates(
  cwd: string,
  slug: string,
  stepName: string,
  state: JobState,
): Promise<void> {
  const templates = getOutputTemplates(stepName, slug, state);
  for (const tpl of templates) {
    const dest = path.join(cwd, tpl.path);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, tpl.content, "utf-8");
  }
}

/**
 * Delete B-group (cleanup: true) templates from the change folder after a step
 * completes, before commit-push.
 *
 * A-group templates are left untouched — they have already been overwritten by
 * the agent and will be committed as final output files.
 *
 * ENOENT is silently ignored (idempotent).
 *
 * @param cwd      - Worktree root (absolute path).
 * @param slug     - Change slug.
 * @param stepName - Name of the step that just completed.
 * @param state    - Current job state (used to look up the same template list).
 */
export async function cleanupOutputTemplates(
  cwd: string,
  slug: string,
  stepName: string,
  state: JobState,
): Promise<void> {
  const templates = getOutputTemplates(stepName, slug, state);
  for (const tpl of templates) {
    if (!tpl.cleanup) continue;
    const dest = path.join(cwd, tpl.path);
    try {
      await fs.unlink(dest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
  }
}

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
