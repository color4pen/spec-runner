/**
 * `credentials set <name>` command handler.
 *
 * Supported names:
 *   claude-code         → saves to anthropic.claudeCodeOAuthToken (credentials.json 0600)
 *   anthropic-api-key   → saves to anthropic.apiKey (credentials.json 0600)
 *
 * Input is read without echoing (TTY: raw mode; non-TTY: stdin pipe).
 * The secret value is never written to stdout/stderr.
 */
import { logError, logInfo } from "../logger/stdout.js";
import { saveClaudeCodeOAuthToken } from "../core/credentials/claude-code.js";
import { saveSpecRunnerApiKey } from "../core/credentials/anthropic.js";
import { readSecret } from "../util/secret-input.js";

const VALID_NAMES = ["claude-code", "anthropic-api-key"] as const;
type CredentialName = (typeof VALID_NAMES)[number];

export const CREDENTIALS_SET_USAGE = `Usage: specrunner credentials set <name>

Store a credential secret to ~/.config/specrunner/credentials.json (0600).
The value is read from stdin without echoing (safe for cron / scripts).

Supported names:
  claude-code           Claude Code OAuth token (for headless cron / inbox runs)
  anthropic-api-key     Anthropic API key (for managed runtime)

After storing, run 'specrunner doctor' to verify the credential was saved correctly.

Examples:
  specrunner credentials set claude-code
  echo "$MY_TOKEN" | specrunner credentials set claude-code

Options:
  --help, -h    Show this help message
`;

export interface CredentialsSetOpts {
  /** Seam: TTY flag for readSecret (default: process.stdin.isTTY) */
  isTTY?: boolean;
  /** Seam: input stream (default: process.stdin) */
  input?: NodeJS.ReadableStream & { setRawMode?: (mode: boolean) => void };
  /** Seam: output stream (default: process.stdout) */
  output?: NodeJS.WritableStream;
}

/**
 * Run `specrunner credentials set <name>`.
 * Returns exit code: 0 = success, 1 = error.
 */
export async function runCredentialsSet(name: string, opts?: CredentialsSetOpts): Promise<number> {
  if (!(VALID_NAMES as readonly string[]).includes(name)) {
    logError(`Unknown credential name: '${name}'. Valid names: ${VALID_NAMES.join(", ")}`);
    logError(CREDENTIALS_SET_USAGE);
    return 1;
  }

  const credName = name as CredentialName;

  const isTTY = opts?.isTTY ?? !!process.stdin.isTTY;
  const input = opts?.input ?? process.stdin;
  const output = opts?.output ?? process.stdout;

  if (isTTY) {
    const promptLabel = credName === "claude-code" ? "Claude Code OAuth token" : "Anthropic API key";
    output.write(`Paste ${promptLabel} (input hidden): `);
  }

  let secret: string;
  try {
    secret = await readSecret({ isTTY, input, output });
  } catch {
    logError("Aborted.");
    return 1;
  }

  if (secret.length === 0) {
    logError("Secret cannot be empty.");
    return 1;
  }

  if (credName === "claude-code") {
    await saveClaudeCodeOAuthToken(secret);
    logInfo("Claude Code OAuth token saved. Run 'specrunner doctor' to verify (claude-code/oauth-token-present).");
  } else {
    await saveSpecRunnerApiKey(secret);
    logInfo("Anthropic API key saved. Run 'specrunner doctor' to verify (managed/api-key-present).");
  }

  return 0;
}
