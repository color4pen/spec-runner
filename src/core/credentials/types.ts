/**
 * Types for the credentials file (~/.config/specrunner/credentials.json).
 * Provider-keyed JSON for forward-compat with GitLab etc. (issue #246).
 */

export interface CredentialsFile {
  github?: {
    token: string;
  };
  anthropic?: {
    apiKey?: string;
  };
}
