/**
 * Helper: load config with project local overlay applied best-effort.
 *
 * Resolves the repo root from cwd (via git) and passes it to loadConfig() so
 * that <repoRoot>/.specrunner/config.json is picked up as a project local overlay.
 * Falls back to loadConfig() without repoRoot when git is unavailable.
 */
import { loadConfig } from "../config/store.js";
import { resolveRepoRoot } from "../util/repo-root.js";
import type { SpecRunnerConfig } from "../config/schema.js";

/**
 * Load config with project local overlay.
 * If repoRoot cannot be resolved (not inside a git repo), user global config is returned.
 *
 * @throws SpecRunnerError if config is missing or invalid.
 */
export async function loadConfigWithOverlay(cwd?: string): Promise<SpecRunnerConfig> {
  const repoRoot = await resolveRepoRoot(cwd ?? process.cwd());
  return loadConfig(repoRoot ?? undefined);
}
