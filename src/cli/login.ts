import * as fs from "node:fs/promises";
import { runDeviceFlow } from "../auth/github-device.js";
import { loadConfig, saveConfig } from "../config/store.js";
import { loadCredentials, saveCredentials, resolveGitHubToken } from "../core/credentials/github.js";
import { logError, logInfo, logSuccess, logWarn } from "../logger/stdout.js";
import { resolveGitHubHost, resolveGitHubApiBaseUrl } from "../config/github-host.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { getConfigPath } from "../util/xdg.js";

export interface LoginOpts {
  force?: boolean;
  env?: Record<string, string | undefined>;
  /** Seam: replaces runDeviceFlow in tests */
  runDeviceFlow?: typeof runDeviceFlow;
  /** Seam: replaces verifyTokenScopes in tests */
  verifyTokenScopes?: () => Promise<{ status: number; scopes: string[] }>;
}

/**
 * Run the specrunner login command — GitHub Device Flow only.
 *
 * --force未指定時の判定:
 *   resolveGitHubToken で最優先 token と source を解決する。
 *   - token なし（throw）→ Device Flow へ進む
 *   - token あり → verifyTokenScopes() で有効性を確認:
 *     - valid (200) → 出所を表示して exit 0（Device Flow 省略）
 *     - invalid (401) かつ source == credentials → Device Flow による更新へ進む
 *     - invalid (401) かつ source ∈ {env, gh} → 認証源の修正を案内して exit 非 0
 *     - unknown (その他/timeout) → connectivity 確認を案内して exit 非 0
 *
 * --force 時は上記を飛ばし無条件 Device Flow を実行する。
 *
 * Returns the exit code: 0 = success, 1 = error.
 */
export async function runLogin(opts?: LoginOpts): Promise<number> {
  const force = opts?.force ?? false;
  const env = opts?.env ?? (process.env as Record<string, string | undefined>);

  logInfo("Authenticating with GitHub...");

  // Load config to get GitHub host/apiBaseUrl (best-effort)
  let githubHost = "github.com";
  let githubApiBaseUrl = "https://api.github.com";
  try {
    const cfg = await loadConfig();
    githubHost = resolveGitHubHost(cfg.github);
    githubApiBaseUrl = resolveGitHubApiBaseUrl(cfg.github);
  } catch {
    // Config not available — use defaults
  }

  if (!force) {
    // Resolve the highest-priority token (same order as runtime)
    let resolvedToken: string | undefined;
    let resolvedSource: "env" | "gh" | "credentials" | undefined;

    try {
      const resolved = await resolveGitHubToken(env, { host: githubHost });
      resolvedToken = resolved.token;
      resolvedSource = resolved.source;
    } catch {
      // No token at all — proceed with Device Flow (first-time login)
      resolvedToken = undefined;
    }

    if (resolvedToken !== undefined && resolvedSource !== undefined) {
      // Verify validity via GitHub API
      let verifyResult: { status: number; scopes: string[] };
      try {
        if (opts?.verifyTokenScopes) {
          verifyResult = await opts.verifyTokenScopes();
        } else {
          const client = createGitHubClient(fetch, resolvedToken, githubApiBaseUrl);
          verifyResult = await client.verifyTokenScopes();
        }
      } catch {
        // Network timeout or other connectivity issue — unknown
        logError("Could not reach GitHub to verify the existing token. Check connectivity and retry, or use --force to run the Device Flow anyway.");
        return 1;
      }

      if (verifyResult.status === 200) {
        // Token is valid — display source and skip Device Flow
        const sourceName = describeSource(resolvedSource, env);
        logInfo(`Already authenticated (source: ${sourceName}). To re-authenticate, run: specrunner login --force`);
        return 0;
      }

      if (verifyResult.status === 401) {
        // Token is invalid
        if (resolvedSource === "credentials") {
          // credentials.json source — proceed with Device Flow to update
          logWarn("Stored GitHub token is invalid or expired. Proceeding with Device Flow to update credentials...");
          // Fall through to Device Flow below
        } else {
          // env or gh source — Device Flow would not help (upper source takes precedence)
          const sourceName = describeSource(resolvedSource, env);
          logError(`GitHub token from ${sourceName} is invalid or expired.`);
          if (resolvedSource === "gh") {
            logError("Run 'gh auth login' to re-authenticate, or unset the conflicting env var.");
          } else {
            // env source
            const envVarName = env["GH_TOKEN"] ? "GH_TOKEN" : "GITHUB_TOKEN";
            logError(`Unset or update the $${envVarName} environment variable to fix authentication.`);
          }
          logError("Running the Device Flow would not help because this source takes precedence over credentials.json at runtime.");
          return 1;
        }
      } else {
        // Unknown status (not 200, not 401) — connectivity issue or API error
        logError(`GitHub API returned HTTP ${verifyResult.status} — cannot confirm token validity. Check connectivity and retry, or use --force to run the Device Flow anyway.`);
        return 1;
      }
    }
    // Either: no token found (resolvedToken === undefined) → fresh Device Flow
    // Or: invalid credentials.json token → Device Flow to update
  }

  // Device Flow
  const deviceFlowFn = opts?.runDeviceFlow ?? runDeviceFlow;
  let result: Awaited<ReturnType<typeof runDeviceFlow>>;
  try {
    result = await deviceFlowFn(fetch, undefined, githubHost);
  } catch {
    // expired_token / access_denied — message already printed in github-device.ts
    return 1;
  }

  // Create config scaffold only when the config file does not exist yet.
  const configPath = getConfigPath();
  try {
    await fs.access(configPath);
    // Config file already exists — skip scaffold generation
  } catch {
    // Config file absent — create minimal scaffold
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

/**
 * Human-readable description of the resolved token source.
 */
function describeSource(source: "env" | "gh" | "credentials", env: Record<string, string | undefined>): string {
  if (source === "env") {
    return env["GH_TOKEN"] ? "$GH_TOKEN" : "$GITHUB_TOKEN";
  }
  if (source === "gh") {
    return "gh auth token";
  }
  return "credentials.json";
}
