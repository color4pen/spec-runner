/**
 * Declarative matrix of runtime → required credentials.
 * Allows preflight, doctor, and bootstrap to determine which credentials
 * are needed for a given runtime without hardcoding provider names.
 */

export type CredentialKey = "github.token" | "anthropic.apiKey" | "anthropic.claudeCodeOAuthToken";

export interface RequiredCredential {
  key: CredentialKey;
  envVar: string;
}

const LOCAL_REQUIREMENTS: RequiredCredential[] = [
  { key: "github.token", envVar: "GH_TOKEN" },
  { key: "anthropic.claudeCodeOAuthToken", envVar: "CLAUDE_CODE_OAUTH_TOKEN" },
];

const MANAGED_REQUIREMENTS: RequiredCredential[] = [
  { key: "github.token", envVar: "GH_TOKEN" },
  { key: "anthropic.apiKey", envVar: "SPECRUNNER_API_KEY" },
];

/**
 * Returns the list of credentials required for the given runtime.
 */
export function requirementsFor(
  runtime: "local" | "managed",
): RequiredCredential[] {
  if (runtime === "managed") {
    return MANAGED_REQUIREMENTS;
  }
  return LOCAL_REQUIREMENTS;
}
