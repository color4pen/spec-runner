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

// ---------------------------------------------------------------------------
// matchesGlob — behavior-preserving relocation from
//   src/core/step/bite-evidence/test-file-selection.ts
//
// Note: `globMatch` (above) and `matchesGlob` (below) are two independent
// implementations with subtly different semantics (e.g. `**/ ` handling).
// Unifying the two matchers is out of scope; `matchesGlob` is added here as
// a single shared definition so both bite-evidence and staging-containment can
// import from one place without introducing a runtime dependency.
// ---------------------------------------------------------------------------

/**
 * Test whether `filePath` matches the given glob `pattern`.
 *
 * Supported glob syntax (D3: bounded translation):
 *   - double-star followed by slash: matches zero or more directory segments
 *   - double-star NOT followed by slash: matches across directory boundaries
 *   - single star: matches within one path segment, does not cross "/"
 *   - all other characters: regex-escaped (e.g., "." compiles to "\." and matches
 *     only a literal dot — not underscore or any other character)
 *
 * No brace expansion, "?", or character-class support — out of scope.
 * The compiled RegExp is anchored as "^...$".
 */
export function matchesGlob(filePath: string, pattern: string): boolean {
  let regex = "";
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i]!;

    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // Double-star
        if (pattern[i + 2] === "/") {
          // "**/" — match zero or more directory segments (including none)
          regex += "(?:.*/)?";
          i += 3; // consume the three-char sequence
        } else {
          // "**" not followed by "/" — match across segment boundaries
          regex += ".*";
          i += 2; // consume the two-char sequence
        }
      } else {
        // Single "*" — match within one segment (no "/" crossing)
        regex += "[^/]*";
        i += 1;
      }
    } else {
      // Regex-escape all regex metacharacters (including ".") so literal chars match literally.
      // "." compiles to "\." and matches only a literal dot — not underscore or any other char.
      regex += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }

  return new RegExp(`^${regex}$`).test(filePath);
}
