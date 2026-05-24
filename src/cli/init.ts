import { loadConfig, saveConfig } from "../config/store.js";
import { logInfo, logSuccess, logError } from "../logger/stdout.js";
import { spawnCommand } from "../util/spawn.js";
import { ensureDotSpecrunnerGitignore } from "../util/gitignore.js";
import type { SpecRunnerConfig } from "../config/schema.js";

/**
 * Run the specrunner init command.
 * Generates a local-default config scaffold only.
 * Does NOT set up managed runtime — use 'managed setup' for that.
 */
export async function runInit(options: {
  runtime?: "managed" | "local";
}): Promise<void> {
  const { runtime } = options;

  if (runtime === "managed") {
    logError("init no longer sets up managed runtime. Run 'init' for config scaffold, then set SPECRUNNER_API_KEY and run 'managed setup'.");
    process.exit(1);
  }

  if (runtime === "local") {
    logError("--runtime flag is no longer needed. 'init' generates a local-default config scaffold.");
    process.exit(1);
  }

  // Load existing config (best-effort)
  let existingConfig: Partial<SpecRunnerConfig> = {};
  try {
    existingConfig = await loadConfig();
  } catch {
    // No existing config — OK for first run
  }

  const newConfig: SpecRunnerConfig = {
    ...existingConfig,
    version: 1,
    agents: existingConfig.agents ?? {},
    // TC-010: add steps.defaults if not already present
    // TC-011: do not overwrite existing steps config
    // D4 (design.md): null = unlimited for maxTurns; null = no timeout for timeoutMs
    steps: existingConfig.steps ?? {
      defaults: {
        model: "claude-sonnet-4-6",
        maxTurns: null,
        timeoutMs: null,
      },
    },
  } as SpecRunnerConfig;

  // Do NOT write runtime (let it default to local)
  // Do NOT write anthropic field
  delete (newConfig as unknown as Record<string, unknown>)["runtime"];
  delete (newConfig as unknown as Record<string, unknown>)["anthropic"];

  await saveConfig(newConfig);
  logSuccess("Config saved.");
  logInfo("Run 'specrunner login' to authenticate with GitHub (required for PR creation).");

  // Append .specrunner/ to .gitignore if CWD is a git repository (idempotent)
  try {
    const result = await spawnCommand("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() });
    if (result.exitCode === 0) {
      const repoRoot = result.stdout.trim();
      await ensureDotSpecrunnerGitignore(repoRoot);
    }
    // Non-zero exit = not a git repo; skip silently
  } catch {
    // git not available or other error — skip silently
  }
}
