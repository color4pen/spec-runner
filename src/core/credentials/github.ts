/**
 * Credentials file I/O and GitHub token resolver.
 *
 * File: ~/.config/specrunner/credentials.json (0600)
 * Structure: { "github": { "token": "ghp_..." } }
 *
 * Priority for resolveGitHubToken:
 *   1. GH_TOKEN env var (gh CLI primary env, takes precedence over GITHUB_TOKEN)
 *   2. GITHUB_TOKEN env var
 *   3. `gh auth token` subprocess (B-6 seam via spawnCommand)
 *   4. credentials.json github.token
 *   5. SpecRunnerError with guidance hint
 */
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import type { CredentialsFile } from "./types.js";
import { loadCredentials, saveCredentials } from "./credentials-io.js";
import { spawnCommand, type SpawnFn } from "../../util/spawn.js";

export type { CredentialsFile };
export { loadCredentials, saveCredentials };

/**
 * Resolve GitHub token with priority:
 *   1. GH_TOKEN env var (gh CLI primary, env > stored)
 *   2. GITHUB_TOKEN env var
 *   3. `gh auth token` subprocess (B-6 seam); fallthrough on failure
 *   4. credentials.json github.token
 *   5. Throw SpecRunnerError with login hint
 *
 * @param env   Environment variable map (typically process.env).
 * @param opts  Optional: `host` for future host↔token binding; `spawn` for DI in tests.
 */
export async function resolveGitHubToken(
  env: Record<string, string | undefined>,
  opts?: { host?: string; spawn?: SpawnFn },
): Promise<{ token: string; source: "credentials" | "env" | "gh" }> {
  // Priority 1: GH_TOKEN env var (gh CLI primary env var)
  const ghToken = env["GH_TOKEN"];
  if (ghToken && ghToken.length > 0) {
    return { token: ghToken, source: "env" };
  }

  // Priority 2: GITHUB_TOKEN env var
  const githubToken = env["GITHUB_TOKEN"];
  if (githubToken && githubToken.length > 0) {
    return { token: githubToken, source: "env" };
  }

  // Priority 3: `gh auth token` subprocess (B-6 seam)
  try {
    const spawnFn = opts?.spawn ?? spawnCommand;
    const result = await spawnFn("gh", ["auth", "token"], {
      cwd: process.cwd(),
      timeoutMs: 5000,
    });
    if (result.exitCode === 0 && result.stdout.trim().length > 0) {
      return { token: result.stdout.trim(), source: "gh" };
    }
  } catch {
    // gh not found or other error — fallthrough
  }

  // Priority 4: credentials.json github.token
  const creds = await loadCredentials();
  if (creds.github?.token && creds.github.token.length > 0) {
    return { token: creds.github.token, source: "credentials" };
  }

  // No source — throw with guidance
  throw new SpecRunnerError(
    ERROR_CODES.GITHUB_TOKEN_MISSING,
    "Set GH_TOKEN env var, run 'gh auth login', or run 'specrunner login'.",
    "GitHub token not found.",
  );
}
