/**
 * Minimal lcov parser for the changed-line coverage gate.
 *
 * Reads SF: / DA: lines only. All other records (FN, BRDA, LF, LH, etc.) are ignored.
 * No external dependencies — node:path only.
 *
 * Output: Map<normalizedFilePath, Map<lineNumber, executionCount>>
 * File paths are normalized to repo-root-relative POSIX (no leading "./").
 */
import * as nodePath from "node:path";

/**
 * Normalize an SF: path to a repo-root-relative POSIX path.
 *
 * Rules (applied in order):
 * 1. Absolute path that starts with cwd/ (or equals cwd) → strip cwd prefix, keep relative part.
 * 2. Strip any leading "./" prefix.
 * 3. Convert backslashes to forward slashes (Windows normalization, no-op on POSIX).
 *
 * Returns a repo-root-relative POSIX path with no leading "./" or "/".
 *
 * @param sfPath - Path as it appears after "SF:" in the lcov file.
 * @param cwd    - Working directory (repo root). Used to strip absolute prefixes.
 */
export function normalizeSfPath(sfPath: string, cwd: string): string {
  // Normalize cwd to POSIX separators and ensure no trailing slash.
  const normalizedCwd = cwd.replace(/\\/g, "/").replace(/\/+$/, "");

  // Convert sfPath to POSIX separators.
  let p = sfPath.replace(/\\/g, "/");

  // Strip cwd prefix when sfPath is absolute.
  if (nodePath.isAbsolute(sfPath)) {
    const cwdPrefix = normalizedCwd + "/";
    if (p.startsWith(cwdPrefix)) {
      p = p.slice(cwdPrefix.length);
    } else if (p === normalizedCwd) {
      p = "";
    }
    // If absolute but not under cwd, keep as-is (will not match any changed file).
  }

  // Strip leading "./"
  while (p.startsWith("./")) {
    p = p.slice(2);
  }

  return p;
}

/**
 * Parse an lcov coverage report into a file→line→count map.
 *
 * Only SF: (source file) and DA: (line data) records are processed.
 * end_of_record closes each file section.
 *
 * When the same line appears in multiple DA: records within one file section,
 * the execution counts are summed.
 *
 * @param text - Full text content of the lcov file.
 * @param cwd  - Working directory (repo root) used to normalize SF: paths.
 * @returns Map where keys are normalized repo-root-relative paths and values
 *          are Maps of line number → total execution count.
 */
export function parseLcov(
  text: string,
  cwd: string = process.cwd(),
): Map<string, Map<number, number>> {
  const result = new Map<string, Map<number, number>>();

  if (!text) {
    return result;
  }

  let currentFile: string | null = null;
  let currentLines: Map<number, number> | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();

    if (line.startsWith("SF:")) {
      // Flush any in-progress section (handles missing end_of_record gracefully).
      if (currentFile !== null && currentLines !== null && currentLines.size > 0) {
        result.set(currentFile, currentLines);
      }
      const sfPath = line.slice(3); // everything after "SF:"
      currentFile = normalizeSfPath(sfPath, cwd);
      currentLines = new Map<number, number>();
    } else if (line.startsWith("DA:") && currentLines !== null) {
      // DA:<line>,<count>[,<checksum>]
      const rest = line.slice(3);
      const commaIdx = rest.indexOf(",");
      if (commaIdx === -1) continue;
      const lineNoStr = rest.slice(0, commaIdx);
      const afterComma = rest.slice(commaIdx + 1);
      // count may be followed by a second comma (checksum) — take only the count part.
      const secondComma = afterComma.indexOf(",");
      const countStr = secondComma === -1 ? afterComma : afterComma.slice(0, secondComma);
      const lineNo = parseInt(lineNoStr, 10);
      const count = parseInt(countStr, 10);
      if (!isNaN(lineNo) && !isNaN(count)) {
        // Sum counts when multiple DA records target the same line.
        currentLines.set(lineNo, (currentLines.get(lineNo) ?? 0) + count);
      }
    } else if (line === "end_of_record") {
      if (currentFile !== null && currentLines !== null) {
        // Only store files that have at least one DA record (or store all files for fail-closed).
        // We store all files regardless of DA count so "file exists in lcov" can be checked.
        result.set(currentFile, currentLines);
      }
      currentFile = null;
      currentLines = null;
    }
  }

  // Flush last section if end_of_record was missing.
  if (currentFile !== null && currentLines !== null) {
    result.set(currentFile, currentLines);
  }

  return result;
}
