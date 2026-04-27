/**
 * GitHub OAuth App client ID for specrunner.
 * Can be overridden via SPECRUNNER_GITHUB_CLIENT_ID env var.
 * Device Flow does not require client_secret.
 */
export function getGithubClientId(): string {
  return process.env["SPECRUNNER_GITHUB_CLIENT_ID"] ?? "Iv23liasdfGHclient0001";
}

export const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_SCOPE = "repo";
