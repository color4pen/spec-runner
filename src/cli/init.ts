import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as readline from "node:readline";
import { loadConfig, saveConfig } from "../config/store.js";
import { getConfigPath } from "../util/xdg.js";
import { logInfo, logError, logResult } from "../logger/stdout.js";
import { ensureDotSpecrunnerGitignore } from "../util/gitignore.js";
import { changesDirRel, draftsDir } from "../util/paths.js";
import type { SpecRunnerConfig, StepConfigMap, StepExecutionConfig } from "../config/schema.js";
import { PROVIDER_DEFAULTS } from "../config/model-registry.js";
import type { Provider } from "../config/model-registry.js";

/**
 * Resolve which provider to use for init scaffold generation.
 *
 * Priority:
 * 1. `flagProvider` — explicit --provider flag value
 * 2. Non-TTY (CI) — defaults to "anthropic" (current-compatible)
 * 3. TTY — prompts user interactively via `io.ask`
 *
 * The `io` seam makes this testable without real stdin/readline.
 */
export async function resolveInitProvider(
  flagProvider: Provider | undefined,
  io: { isTTY: boolean; ask: (prompt: string) => Promise<string> },
): Promise<Provider> {
  if (flagProvider !== undefined) {
    return flagProvider;
  }
  if (!io.isTTY) {
    return "anthropic";
  }
  const answer = await io.ask("Which provider? [1] Anthropic  [2] OpenAI  (default: 1): ");
  const trimmed = answer.trim().toLowerCase();
  if (trimmed === "2" || trimmed === "openai" || trimmed === "o") {
    return "openai";
  }
  return "anthropic";
}

/**
 * Run the specrunner init command.
 * Generates a global config scaffold and a per-repo project scaffold (specrunner/drafts,
 * specrunner/changes, .gitignore entries). The caller (dispatch) is responsible for
 * ensuring a git repository is present (requiresRepo: true on the registry entry).
 * Does NOT set up managed runtime — use 'managed setup' for that.
 *
 * Returns the exit code:
 *   0 = success
 *   2 = argument error (deprecated flag)
 */
export async function runInit(options: {
  runtime?: "managed" | "local";
  provider?: Provider;
  repoRoot: string;
}): Promise<number> {
  const { runtime, provider: flagProvider, repoRoot } = options;

  if (runtime === "managed") {
    logError("init no longer sets up managed runtime. Run 'init' for config scaffold, then set SPECRUNNER_API_KEY and run 'managed setup'.");
    return 2;
  }

  if (runtime === "local") {
    logError("--runtime flag is no longer needed. 'init' generates a local-default config scaffold.");
    return 2;
  }

  // Check if global config already exists
  const configPath = getConfigPath();
  let configExists = false;
  try {
    await fs.access(configPath);
    configExists = true;
  } catch {
    // Config does not exist
  }

  if (!configExists) {
    // Resolve provider — only when we need to write the scaffold
    const isTTY = !!process.stdin.isTTY;
    const provider = await resolveInitProvider(flagProvider, {
      isTTY,
      ask: (prompt: string) =>
        new Promise<string>((resolve) => {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer);
          });
        }),
    });

    // Load existing config (best-effort)
    let existingConfig: Partial<SpecRunnerConfig> = {};
    try {
      existingConfig = await loadConfig();
    } catch {
      // No existing config — OK for first run
    }

    const defaults = PROVIDER_DEFAULTS[provider];

    // Build steps section from provider defaults
    // TC-010: add steps.defaults if not already present
    // TC-011: do not overwrite existing steps config
    // D4 (design.md): null = unlimited for maxTurns; null = no timeout for timeoutMs
    let steps: StepConfigMap | undefined = existingConfig.steps;
    if (!steps) {
      const stepsDefaults: StepExecutionConfig = {
        model: defaults.defaultModel,
        maxTurns: null,
        timeoutMs: null,
      };
      steps = { defaults: stepsDefaults };
      // Only write steps.design when designModel is defined (e.g. openai).
      // For anthropic, design.ts built-in already handles claude-opus-4-6[1m]; omitting keeps
      // scaffold byte-identical to the legacy format.
      if (defaults.designModel !== undefined) {
        steps["design"] = { model: defaults.designModel };
      }
    }

    const newConfig: SpecRunnerConfig = {
      ...existingConfig,
      version: 1,
      agents: existingConfig.agents ?? {},
      steps,
    } as SpecRunnerConfig;

    // Do NOT write runtime (let it default to local)
    // Do NOT write anthropic field
    delete (newConfig as unknown as Record<string, unknown>)["runtime"];
    delete (newConfig as unknown as Record<string, unknown>)["anthropic"];

    await saveConfig(newConfig);
    logInfo("Run 'specrunner login' to authenticate with GitHub (required for PR creation).");
  }

  // Report each artifact: created or already exists
  logResult(`global config: ${configExists ? "already exists" : "created"}`);

  // .gitignore: append .specrunner/* and !.specrunner/config.json (idempotent)
  const gitignoreChanged = await ensureDotSpecrunnerGitignore(repoRoot);
  logResult(`.gitignore: ${gitignoreChanged ? "created" : "already exists"}`);

  // specrunner/drafts: create directory (idempotent — recursive:true is no-op if exists)
  const draftsCreated = await fs.mkdir(path.join(repoRoot, draftsDir()), { recursive: true });
  logResult(`specrunner/drafts: ${draftsCreated !== undefined ? "created" : "already exists"}`);

  // specrunner/changes: create directory (idempotent — recursive:true is no-op if exists)
  const changesCreated = await fs.mkdir(path.join(repoRoot, changesDirRel()), { recursive: true });
  logResult(`specrunner/changes: ${changesCreated !== undefined ? "created" : "already exists"}`);

  return 0;
}
