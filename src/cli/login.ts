import { runDeviceFlow } from "../auth/github-device.js";
import { loadConfig, saveConfig } from "../config/store.js";
import { logInfo, logSuccess } from "../logger/stdout.js";
import type { SpecRunnerConfig } from "../config/schema.js";

/**
 * Run the specrunner login command.
 * Runs GitHub Device Flow and saves the access token to config.
 */
export async function runLogin(): Promise<void> {
  logInfo("Authenticating with GitHub...");

  const result = await runDeviceFlow();

  // Load or initialize config
  let config: SpecRunnerConfig;
  try {
    config = await loadConfig();
  } catch {
    // No config yet — login alone is not enough, but we save partial config
    config = {
      version: 1,
      agents: {},
    };
  }

  config.github = {
    accessToken: result.accessToken,
    tokenObtainedAt: new Date().toISOString(),
    scopes: result.scopes,
  };

  await saveConfig(config);
  logSuccess("GitHub authentication complete. Token saved.");
}
