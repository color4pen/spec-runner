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
 * Per category (skipped / pending / todo) the LARGEST reported number is taken,
 * then the per-category maxima are summed. This avoids double-counting when a
 * runner prints the same skips on both per-file lines and a summary line — e.g.
 * "6 skipped" + "7 skipped" + "3 skipped" per file and "16 skipped" in the
 * summary yields 16 (the max), not 32 (the sum). Different categories are still
 * summed (e.g. "2 skipped" + "1 todo" → 3). Best-effort: may under-count when
 * independent suites each print their own total with no grand total. Returns 0
 * when no skip keyword is found.
 *
 * @param output - Combined stdout/stderr from the test phase
 * @returns Total count of skipped/pending/todo tests, or 0 if none detected
 */
export function detectSkippedTests(output: string): number {
  const pattern = /(\d+)\s+(skipped|pending|todo)\b/gi;
  const maxByCategory = new Map<string, number>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(output)) !== null) {
    const count = parseInt(match[1] as string, 10);
    const category = (match[2] as string).toLowerCase();
    maxByCategory.set(category, Math.max(maxByCategory.get(category) ?? 0, count));
  }
  let total = 0;
  for (const value of maxByCategory.values()) {
    total += value;
  }
  return total;
}
