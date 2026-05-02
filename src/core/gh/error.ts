/**
 * Shared gh CLI error message builder.
 * Extracted from src/core/pr-create/runner.ts for reuse.
 */

/**
 * Build a user-friendly error message for gh CLI failures.
 * Includes re-authentication hint for common auth failures.
 */
export function buildGhFailureMessage(stderr: string): string {
  const hint =
    stderr.toLowerCase().includes("auth") || stderr.toLowerCase().includes("token")
      ? "\n\nRun 'specrunner login' or 'gh auth login' to re-authenticate."
      : "\n\nIf this is an authentication error, run 'specrunner login' or 'gh auth login' to re-authenticate.";
  return `${stderr.trim()}${hint}`;
}
