/**
 * Pure glob matcher for reviewer activation conditions.
 *
 * Supports:
 *   **  — zero or more path segments (crosses /)
 *   *   — zero or more non-/ characters
 *   ?   — exactly one non-/ character
 *   literals — exact character match
 *
 * No I/O. No external dependencies.
 */

/**
 * Convert a glob pattern to a RegExp for full-path matching.
 *
 * Safety: regex metacharacters in the pattern are escaped before glob symbols
 * are substituted, preventing pattern-injection attacks.
 */
function globToRegExp(pattern: string): RegExp {
  // Step 1: protect glob tokens with placeholders before any escaping.
  // Order matters: replace **/ first (matches zero or more directories),
  // then ** (any characters including /), then *, then ?.
  const withPlaceholders = pattern
    .replace(/\*\*\//g, "\x00GLOBSLASH\x00") // **/ → zero-or-more-dirs/
    .replace(/\*\*/g, "\x00GLOBSTAR\x00")    // **  → any chars including /
    .replace(/\*/g, "\x00STAR\x00")           // *   → any chars except /
    .replace(/\?/g, "\x00QM\x00");             // ?   → one char except /

  // Step 2: escape remaining regex metacharacters in the literal parts.
  const escaped = withPlaceholders.replace(/[.+*?^${}()|[\]\\]/g, "\\$&");

  // Step 3: restore glob symbols as their regex equivalents.
  const regexStr = escaped
    .replace(/\x00GLOBSLASH\x00/g, "(.*/)?") // **/ → zero or more dirs (optional)
    .replace(/\x00GLOBSTAR\x00/g, ".*")      // **  → any characters including /
    .replace(/\x00STAR\x00/g, "[^/]*")       // *   → any characters except /
    .replace(/\x00QM\x00/g, "[^/]");          // ?   → one character except /

  return new RegExp(`^${regexStr}$`);
}

/**
 * Match a single file path against a glob pattern.
 *
 * @param pattern  - Glob pattern (e.g. "src/auth/**", "**\/*.ts").
 * @param filePath - Repo-relative file path (e.g. "src/auth/login.ts").
 * @returns true if the pattern matches the full path, false otherwise.
 */
export function matchGlob(pattern: string, filePath: string): boolean {
  const re = globToRegExp(pattern);
  return re.test(filePath);
}
