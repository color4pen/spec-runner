import { SpecRunnerError } from "../errors.js";

/**
 * GitHub OAuth App client ID for specrunner.
 *
 * Must be supplied via the SPECRUNNER_GITHUB_CLIENT_ID env var. There is
 * intentionally no placeholder fallback — a stub client_id silently fails
 * against the GitHub Device Flow API (404/401) which is harder to diagnose
 * than a fail-fast error here. Device Flow does not require client_secret.
 */
export function getGithubClientId(): string {
  const clientId = process.env["SPECRUNNER_GITHUB_CLIENT_ID"];
  if (!clientId || clientId.length === 0) {
    throw new SpecRunnerError(
      "GITHUB_CLIENT_ID_MISSING",
      "Set SPECRUNNER_GITHUB_CLIENT_ID to your GitHub OAuth App's client_id (Device Flow enabled).",
      "SPECRUNNER_GITHUB_CLIENT_ID is not set.",
    );
  }
  return clientId;
}

export const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_SCOPE = "repo";
