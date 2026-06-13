/**
 * Claude Code OAuth token resolver and saver.
 *
 * Priority:
 *   1. CLAUDE_CODE_OAUTH_TOKEN env var
 *   2. credentials.json anthropic.claudeCodeOAuthToken
 */
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import { loadCredentials, saveCredentials } from "./credentials-io.js";

const CLAUDE_CODE_TOKEN_MISSING_HINT =
  "Run 'claude setup-token', then store it with 'specrunner login --provider claude', or set CLAUDE_CODE_OAUTH_TOKEN env var.";

export async function resolveClaudeCodeOAuthToken(
  env: Record<string, string | undefined>,
  opts: { optional: true },
): Promise<{ token: string; source: "env" | "credentials" } | undefined>;

export async function resolveClaudeCodeOAuthToken(
  env: Record<string, string | undefined>,
  opts?: { optional?: false },
): Promise<{ token: string; source: "env" | "credentials" }>;

export async function resolveClaudeCodeOAuthToken(
  env: Record<string, string | undefined>,
  opts?: { optional?: boolean },
): Promise<{ token: string; source: "env" | "credentials" } | undefined> {
  const envToken = env["CLAUDE_CODE_OAUTH_TOKEN"];
  if (envToken && envToken.length > 0) {
    return { token: envToken, source: "env" };
  }

  const creds = await loadCredentials();
  const credToken = creds.anthropic?.claudeCodeOAuthToken;
  if (credToken && credToken.length > 0) {
    return { token: credToken, source: "credentials" };
  }

  if (opts?.optional) {
    return undefined;
  }

  throw new SpecRunnerError(
    ERROR_CODES.RUNTIME_PREREQ_MISSING,
    CLAUDE_CODE_TOKEN_MISSING_HINT,
    "Claude Code OAuth token not found.",
  );
}

export async function saveClaudeCodeOAuthToken(value: string): Promise<void> {
  await saveCredentials({ anthropic: { claudeCodeOAuthToken: value } });
}
