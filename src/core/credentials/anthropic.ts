/**
 * Anthropic API key resolver and saver.
 *
 * Priority for resolveSpecRunnerApiKey:
 *   1. credentials.json anthropic.apiKey
 *   2. SPECRUNNER_API_KEY env var
 *   3. SpecRunnerError with hint (or undefined when optional: true)
 */
import { loadCredentials, saveCredentials } from "./credentials-io.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";

const ANTHROPIC_KEY_MISSING_HINT =
  "Save an API key to credentials with a future 'specrunner login --provider anthropic', or set SPECRUNNER_API_KEY env var.";

/**
 * Resolve the Anthropic API key (optional overload — never throws, may return undefined).
 */
export async function resolveSpecRunnerApiKey(
  env: Record<string, string | undefined>,
  opts: { optional: true },
): Promise<{ apiKey: string; source: "credentials" | "env" } | undefined>;

/**
 * Resolve the Anthropic API key (required overload — throws when not found).
 */
export async function resolveSpecRunnerApiKey(
  env: Record<string, string | undefined>,
  opts?: { optional?: false },
): Promise<{ apiKey: string; source: "credentials" | "env" }>;

/**
 * Implementation.
 */
export async function resolveSpecRunnerApiKey(
  env: Record<string, string | undefined>,
  opts?: { optional?: boolean },
): Promise<{ apiKey: string; source: "credentials" | "env" } | undefined> {
  // Priority 1: credentials file
  const creds = await loadCredentials();
  const credKey = creds.anthropic?.apiKey;
  if (credKey && credKey.length > 0) {
    return { apiKey: credKey, source: "credentials" };
  }

  // Priority 2: SPECRUNNER_API_KEY env var
  const envKey = env["SPECRUNNER_API_KEY"];
  if (envKey && envKey.length > 0) {
    return { apiKey: envKey, source: "env" };
  }

  // Neither — throw or return undefined based on optional flag
  if (opts?.optional) {
    return undefined;
  }

  throw new SpecRunnerError(
    ERROR_CODES.ANTHROPIC_KEY_MISSING,
    ANTHROPIC_KEY_MISSING_HINT,
    "Anthropic API key not found in credentials file or SPECRUNNER_API_KEY env var.",
  );
}

/**
 * Save the Anthropic API key to credentials file.
 */
export async function saveSpecRunnerApiKey(value: string): Promise<void> {
  await saveCredentials({ anthropic: { apiKey: value } });
}
