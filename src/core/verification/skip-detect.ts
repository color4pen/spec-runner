/**
 * Skip detection helper for verification — best-effort, non-blocking.
 *
 * Scans test phase output for framework-agnostic skip/pending/todo summaries
 * and returns the total count detected. The result is informational only and
 * NEVER affects the verification verdict (pass/fail is determined solely by
 * exit code). Detection may miss skips in unusual output formats; that is
 * intentional and acceptable.
 */

/**
 * Detect the total number of skipped/pending/todo tests reported in the output.
 *
 * Matches patterns such as:
 *   "2 skipped", "1 pending", "3 todo" (case-insensitive, word-boundary aware)
 *
 * All matches are summed; returns 0 when no skip keyword is found.
 *
 * @param output - Combined stdout/stderr from the test phase
 * @returns Total count of skipped/pending/todo tests, or 0 if none detected
 */
export function detectSkippedTests(output: string): number {
  const pattern = /(\d+)\s+(skipped|pending|todo)\b/gi;
  let total = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(output)) !== null) {
    total += parseInt(match[1] as string, 10);
  }
  return total;
}
