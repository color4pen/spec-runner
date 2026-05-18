/**
 * Utility for normalizing requirement header names before comparison.
 *
 * Used by the baseline header consistency check in spec-merge to tolerate
 * markdown decorations (bold, italic, inline code) that agent-written delta
 * specs sometimes include but baseline specs omit.
 */

/**
 * Normalize a requirement header name by stripping markdown decorations and trimming whitespace.
 *
 * Strips:
 *   - Markdown bold: **text** → text
 *   - Markdown italic: *text* → text
 *   - Inline code: `text` → text
 *
 * Case-preserving (no toLowerCase).
 */
export function normalizeRequirementHeader(text: string): string {
  let result = text.trim();
  result = result.replace(/\*\*(.*?)\*\*/g, "$1"); // bold
  result = result.replace(/\*(.*?)\*/g, "$1"); // italic
  result = result.replace(/`(.*?)`/g, "$1"); // inline code
  return result.trim();
}
