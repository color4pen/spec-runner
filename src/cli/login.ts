import { runDeviceFlow } from "../auth/github-device.js";
import { loadConfig, saveConfig } from "../config/store.js";
import { loadCredentials, saveCredentials } from "../core/credentials/github.js";
import { logInfo, logSuccess } from "../logger/stdout.js";
import type { SpecRunnerConfig } from "../config/schema.js";

/**
 * Run the specrunner login command.
 * Runs GitHub Device Flow and saves the access token to credentials.json (0600).
 * Config is still loaded/created as a scaffold (version, agents) but no token is stored there.
 */
export async function runLogin(): Promise<void> {
  logInfo("Authenticating with GitHub...");

  const result = await runDeviceFlow();

  // Load or initialize config scaffold (ensures config.json exists with version + agents)
  let config: SpecRunnerConfig;
  try {
    config = await loadConfig();
  } catch {
    // No config yet — create minimal scaffold
    config = {
      version: 1,
      agents: {},
    };
  }

  // Save config scaffold (without github field — secrets go to credentials file)
  await saveConfig(config);

  // Save token to credentials file (0600, provider-keyed JSON)
  const creds = await loadCredentials();
  creds.github = { token: result.accessToken };
  await saveCredentials(creds);

  logSuccess("GitHub authentication complete. Token saved to credentials file.");
}
