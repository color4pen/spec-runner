/**
 * Credentials file I/O and GitHub token resolver.
 *
 * File: ~/.config/specrunner/credentials.json (0600)
 * Structure: { "github": { "token": "ghp_..." } }
 *
 * Priority for resolveGitHubToken:
 *   1. credentials.json github.token
 *   2. GITHUB_TOKEN env var
 *   3. SpecRunnerError with hint to run 'specrunner login'
 */
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import type { CredentialsFile } from "./types.js";
import { loadCredentials, saveCredentials } from "./credentials-io.js";

export type { CredentialsFile };
export { loadCredentials, saveCredentials };

/**
 * Resolve GitHub token with priority:
 *   1. credentials.json github.token
 *   2. GITHUB_TOKEN env var
 *   3. Throw SpecRunnerError with login hint
 */
export async function resolveGitHubToken(
  env: Record<string, string | undefined>,
): Promise<{ token: string; source: "credentials" | "env" }> {
  // Priority 1: credentials file
  const creds = await loadCredentials();
  if (creds.github?.token && creds.github.token.length > 0) {
    return { token: creds.github.token, source: "credentials" };
  }

  // Priority 2: GITHUB_TOKEN env var
  const envToken = env["GITHUB_TOKEN"];
  if (envToken && envToken.length > 0) {
    return { token: envToken, source: "env" };
  }

  // Neither — throw with guidance
  throw new SpecRunnerError(
    ERROR_CODES.GITHUB_TOKEN_MISSING,
    "Run 'specrunner login' to authenticate with GitHub, or set GITHUB_TOKEN env var.",
    "GitHub token not found in credentials file or GITHUB_TOKEN env var.",
  );
}
