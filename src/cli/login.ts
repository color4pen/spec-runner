import * as readline from "node:readline";
import { runDeviceFlow } from "../auth/github-device.js";
import { loadConfig, saveConfig } from "../config/store.js";
import { loadCredentials, saveCredentials } from "../core/credentials/github.js";
import { saveClaudeCodeOAuthToken } from "../core/credentials/claude-code.js";
import { logError, logInfo, logSuccess, logWarn } from "../logger/stdout.js";
import { resolveGitHubHost } from "../config/github-host.js";

export interface LoginOpts {
  force?: boolean;
  env?: Record<string, string | undefined>;
  provider?: "github" | "claude";
  promptToken?: (message: string) => Promise<string>;
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
  const provider = opts?.provider ?? "github";

  if (provider === "claude") {
    return runClaudeLogin({ force, env, promptToken: opts?.promptToken });
  }

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

  // Create config scaffold if it does not exist yet
  try {
    await loadConfig();
    // Config already exists — skip scaffold generation
  } catch {
    // No config yet — create minimal scaffold
    await saveConfig({
      version: 1,
      agents: {},
    });
  }

  // Save token to credentials file (0600, provider-keyed JSON)
  const creds = await loadCredentials();
  creds.github = { token: result.accessToken };
  await saveCredentials(creds);

  logSuccess("GitHub authentication complete. Token saved to credentials file.");
  return 0;
}

async function runClaudeLogin(opts: {
  force: boolean;
  env: Record<string, string | undefined>;
  promptToken?: (message: string) => Promise<string>;
}): Promise<number> {
  logInfo("Authenticating Claude Code...");
  logInfo("Generate a long-lived OAuth token with: claude setup-token");

  const envToken = opts.env["CLAUDE_CODE_OAUTH_TOKEN"];
  if (envToken && envToken.length > 0) {
    logWarn("$CLAUDE_CODE_OAUTH_TOKEN is set and will take precedence over credentials. The stored token will not be used for resolution.");
  }

  if (!opts.force) {
    const existingCreds = await loadCredentials();
    if (
      existingCreds.anthropic?.claudeCodeOAuthToken &&
      existingCreds.anthropic.claudeCodeOAuthToken.length > 0
    ) {
      logWarn("Existing Claude Code token retained. To overwrite, run: specrunner login --provider claude --force");
      return 0;
    }
  }

  const prompt = opts.promptToken ?? promptLine;
  const token = (await prompt("Paste Claude Code OAuth token from 'claude setup-token': ")).trim();
  if (token.length === 0) {
    logError("Claude Code OAuth token cannot be empty.");
    return 1;
  }

  await saveClaudeCodeOAuthToken(token);
  logSuccess("Claude Code OAuth token saved to credentials file.");
  return 0;
}

function promptLine(message: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
