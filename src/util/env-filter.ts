/**
 * Environment variable filtering utilities.
 *
 * Provides a denylist-based filter to strip credential keys from process.env
 * before passing env to subprocess spawning (spawnCommand, SDK query, etc.).
 *
 * Design: denylist approach — explicitly listed keys are removed.
 * Callers can override via opts.env for explicit values that must be passed through.
 */

/** Keys that must never be inherited by subprocesses. */
export const SECRET_DENYLIST = [
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "SPECRUNNER_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_BASE_URL",
] as const;

/**
 * Return the current SPECRUNNER_DEBUG env-var value (comma-separated subsystem list).
 * Centralises the single process.env read for diagnostic subsystem filtering.
 */
export function getDebugSubsystems(): string {
  return process.env["SPECRUNNER_DEBUG"] ?? "";
}

/**
 * Return a shallow copy of `env` with all SECRET_DENYLIST keys removed.
 * The original object is never mutated.
 *
 * @param env - Source environment (typically `process.env`).
 * @returns A new object without the denylist keys.
 */
export function stripSecrets(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const result = { ...env };
  for (const key of SECRET_DENYLIST) {
    delete result[key];
  }
  return result;
}
