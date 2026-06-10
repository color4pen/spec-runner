import { runDeviceFlow } from "../auth/github-device.js";
import { loadConfig, saveConfig } from "../config/store.js";
import { loadCredentials, saveCredentials } from "../core/credentials/github.js";
import { logInfo, logSuccess, logWarn } from "../logger/stdout.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import { resolveGitHubHost } from "../config/github-host.js";

export interface LoginOpts {
  force?: boolean;
  env?: Record<string, string | undefined>;
}

/**
 * Run the specrunner login command.
 * Runs GitHub Device Flow and saves the access token to credentials.json (0600).
 * Config is still loaded/created as a scaffold (version, agents) but no token is stored there.
 *
 * - If credentials.github.token is already set and force is false, exits 0 without overwriting.
 * - If GH_TOKEN or GITHUB_TOKEN is set in env, warns that the env var takes precedence.
 * - With force: true, always proceeds with device flow and overwrites.
 *
 * Returns the exit code: 0 = success, 1 = auth error (expired/denied).
 */
export async function runLogin(opts?: LoginOpts): Promise<number> {
  const force = opts?.force ?? false;
  const env = opts?.env ?? (process.env as Record<string, string | undefined>);

  logInfo("Authenticating with GitHub...");

  // Check for env var tokens and warn that they take precedence over credentials
  const ghToken = env["GH_TOKEN"];
  const githubToken = env["GITHUB_TOKEN"];
  if (ghToken && ghToken.length > 0) {
    logWarn("$GH_TOKEN is set and will take precedence over credentials. The stored token will not be used for resolution.");
  } else if (githubToken && githubToken.length > 0) {
    logWarn("$GITHUB_TOKEN is set and will take precedence over credentials. The stored token will not be used for resolution.");
  }

  // Check for existing credentials token — skip device flow if present and not forced
  if (!force) {
    const existingCreds = await loadCredentials();
    if (existingCreds.github?.token && existingCreds.github.token.length > 0) {
      logWarn("Existing token retained. To overwrite, run: specrunner login --force");
      return 0;
    }
  }

  // Load config to get GitHub host (best-effort)
  let githubHost = "github.com";
  try {
    const cfg = await loadConfig();
    githubHost = resolveGitHubHost(cfg.github);
  } catch {
    // Config not available — use default host
  }

  let result: Awaited<ReturnType<typeof runDeviceFlow>>;
  try {
    result = await runDeviceFlow(fetch, undefined, githubHost);
  } catch {
    // expired_token / access_denied — message already printed in github-device.ts
    return 1;
  }

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
  return 0;
}
