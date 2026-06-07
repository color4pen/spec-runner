/**
 * Minimal glob matcher for repo-root-relative POSIX paths.
 *
 * Supported syntax:
 *   *   — any run of non-'/' characters (single path segment)
 *   **  — any sequence of characters including '/' (cross-segment)
 *   ?   — exactly one non-'/' character
 *   all other characters — literal match
 *
 * Matching is full-path and case-sensitive.
 * No external dependencies (minimal-deps North Star).
 */

/**
 * Returns true when `filePath` matches `pattern`.
 */
export function globMatch(filePath: string, pattern: string): boolean {
  return matchRegex(pattern).test(filePath);
}

/**
 * Translate a glob pattern into an anchored RegExp.
 * Compiled once per call; callers that need high-volume matching should cache.
 */
function matchRegex(pattern: string): RegExp {
  let regexStr = "^";
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i]!;

    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // '**' — matches everything including slashes
        // Consume both stars
        i += 2;
        // If followed by '/', consume the slash too so '**/' doesn't emit '//'
        if (pattern[i] === "/") {
          i++;
          // '**/' at the end of a segment: match any prefix path (0 or more segments)
          regexStr += "(?:.+/)?";
        } else {
          // '**' with no following slash: match anything
          regexStr += ".*";
        }
      } else {
        // single '*' — matches within a single segment (no '/')
        i++;
        regexStr += "[^/]*";
      }
    } else if (ch === "?") {
      // one non-'/' character
      i++;
      regexStr += "[^/]";
    } else {
      // literal character — escape regex specials
      regexStr += escapeRegex(ch);
      i++;
    }
  }

  regexStr += "$";
  return new RegExp(regexStr);
}

/** Escape a single character that may be a regex special. */
function escapeRegex(ch: string): string {
  return ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}
