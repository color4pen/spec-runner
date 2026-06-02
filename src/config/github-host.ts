/**
 * Helpers for resolving GitHub host and API base URL from config.
 *
 * Derivation rules:
 *   - apiBaseUrl set → use as-is (trailing slash stripped)
 *   - host = "github.com" (or absent) → "https://api.github.com"
 *   - host = anything else (GHES) → "https://{host}/api/v3"
 */

/**
 * Resolve the GitHub host from config.
 * Returns "github.com" when config is absent or host is not set.
 */
export function resolveGitHubHost(
  config: { host?: string } | undefined,
): string {
  return config?.host ?? "github.com";
}

/**
 * Resolve the GitHub API base URL from config.
 * When apiBaseUrl is set it takes priority (trailing slash stripped).
 * When host is "github.com" or absent, returns the public GitHub API base.
 * For any other host (GHES), derives the REST API URL from the host.
 */
export function resolveGitHubApiBaseUrl(
  config: { host?: string; apiBaseUrl?: string } | undefined,
): string {
  if (config?.apiBaseUrl && config.apiBaseUrl.length > 0) {
    return config.apiBaseUrl.replace(/\/$/, "");
  }
  const host = config?.host;
  if (!host || host === "github.com") {
    return "https://api.github.com";
  }
  return `https://${host}/api/v3`;
}
