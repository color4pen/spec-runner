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
 *
 * For github.com (or unspecified host):
 *   1. GH_TOKEN env var (gh CLI primary, env > stored)
 *   2. GITHUB_TOKEN env var
 *   3. `gh auth token` subprocess (B-6 seam); fallthrough on failure
 *   4. credentials.json github.token
 *   5. Throw SpecRunnerError with login hint
 *
 * For non-github.com hosts (GHES — B-10 host↔token binding):
 *   1. GH_ENTERPRISE_TOKEN env var
 *   2. GITHUB_ENTERPRISE_TOKEN env var
 *   3. `gh auth token --hostname {host}` subprocess; fallthrough on failure
 *   4. credentials.json github.token
 *   5. Throw SpecRunnerError with login hint (host-specific)
 *
 * @param env   Environment variable map (typically process.env).
 * @param opts  Optional: `host` for host↔token binding (B-10); `spawn` for DI in tests.
 */
export async function resolveGitHubToken(
  env: Record<string, string | undefined>,
  opts?: { host?: string; spawn?: SpawnFn },
): Promise<{ token: string; source: "credentials" | "env" | "gh" }> {
  const host = opts?.host;
  const isEnterprise = host !== undefined && host !== "" && host !== "github.com";

  if (isEnterprise) {
    // Enterprise host: use GH_ENTERPRISE_TOKEN / GITHUB_ENTERPRISE_TOKEN (B-10)
    const ghEnterpriseToken = env["GH_ENTERPRISE_TOKEN"];
    if (ghEnterpriseToken && ghEnterpriseToken.length > 0) {
      return { token: ghEnterpriseToken, source: "env" };
    }

    const githubEnterpriseToken = env["GITHUB_ENTERPRISE_TOKEN"];
    if (githubEnterpriseToken && githubEnterpriseToken.length > 0) {
      return { token: githubEnterpriseToken, source: "env" };
    }

    // `gh auth token --hostname {host}` subprocess (B-6 seam)
    try {
      const spawnFn = opts?.spawn ?? spawnCommand;
      const result = await spawnFn("gh", ["auth", "token", "--hostname", host], {
        cwd: process.cwd(),
        timeoutMs: 5000,
      });
      if (result.exitCode === 0 && result.stdout.trim().length > 0) {
        return { token: result.stdout.trim(), source: "gh" };
      }
    } catch {
      // gh not found or other error — fallthrough
    }

    // credentials.json github.token (shared fallback)
    const creds = await loadCredentials();
    if (creds.github?.token && creds.github.token.length > 0) {
      return { token: creds.github.token, source: "credentials" };
    }

    throw new SpecRunnerError(
      ERROR_CODES.GITHUB_TOKEN_MISSING,
      `Set GH_ENTERPRISE_TOKEN env var, run 'gh auth login --hostname ${host}', or run 'specrunner login'.`,
      `GitHub token not found for host ${host}.`,
    );
  }

  // Public github.com host (default)
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
