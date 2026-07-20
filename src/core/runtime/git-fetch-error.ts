/**
 * Utility for describing git fetch origin failures.
 *
 * Authentication-related failures are wrapped with a prescriptive first sentence
 * that directs the user to `specrunner login`, while preserving the original git
 * stderr as detail for debugging non-typical cases.
 *
 * Non-authentication failures return the same message format as the original code:
 *   git fetch origin failed (exit N): <stderr>
 */

/** Regex patterns that indicate a GitHub authentication failure in git stderr. */
const AUTH_PATTERNS: RegExp[] = [
  /could not read Username/i,
  /Authentication failed/i,
  /terminal prompts disabled/i,
  /Invalid username or password/i,
];

/**
 * Produce a human-readable error message for a git fetch origin failure.
 *
 * @param exitCode  The exit code from the git fetch process.
 * @param stderr    The raw stderr output from the git fetch process.
 * @returns         A string describing the failure, with authentication-aware wrapping.
 */
export function describeGitFetchFailure(exitCode: number, stderr: string): string {
  const rawDetail = `git fetch origin failed (exit ${exitCode}): ${stderr.trim()}`;

  const isAuthFailure = AUTH_PATTERNS.some((pattern) => pattern.test(stderr));
  if (isAuthFailure) {
    return `Run 'specrunner login' to re-authenticate (GitHub authentication failure)\n${rawDetail}`;
  }

  return rawDetail;
}
