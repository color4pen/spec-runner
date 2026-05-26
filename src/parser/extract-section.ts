/**
 * Pure utility functions for extracting sections from markdown content.
 * No I/O, no external dependencies.
 */

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract named sections from markdown content by `##`-level heading names.
 *
 * Section boundaries are `##`-level headings only. `###` or deeper headings
 * are treated as content within the enclosing `##` section.
 *
 * @param content - Full markdown text
 * @param headings - Array of heading names to extract (without `##` prefix)
 * @returns Map from heading name to section body text (leading/trailing whitespace trimmed).
 *          Headings not present in content, or with empty body, are not included in the Map.
 */
export function extractMarkdownSections(
  content: string,
  headings: string[],
): Map<string, string> {
  const result = new Map<string, string>();

  if (headings.length === 0 || content.length === 0) {
    return result;
  }

  const lines = content.split("\n");

  for (const heading of headings) {
    // Match exactly `## <heading>` (trim trailing whitespace on each line)
    const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`);

    let sectionStart = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line !== undefined && headingPattern.test(line.trimEnd())) {
        sectionStart = i;
        break;
      }
    }

    if (sectionStart === -1) {
      // Heading not present — skip
      continue;
    }

    // Find end of section: next `##`-level heading (not `###`) or EOF
    let sectionEnd = lines.length;
    for (let i = sectionStart + 1; i < lines.length; i++) {
      const line = lines[i];
      // `/^##\s+/` matches `## ` but NOT `### ` (third char is `#`, not whitespace)
      if (line !== undefined && /^##\s+/.test(line)) {
        sectionEnd = i;
        break;
      }
    }

    const bodyLines = lines.slice(sectionStart + 1, sectionEnd);
    const body = bodyLines.join("\n").trim();

    if (body.length > 0) {
      result.set(heading, body);
    }
  }

  return result;
}

/**
 * Headings in request.md that contain constraint information for agents.
 * These sections are injected into design and code-review agent contexts by the CLI.
 */
export const REQUEST_CONSTRAINT_HEADINGS = [
  "スコープ外",
  "受け入れ基準",
  "architect 評価済みの設計判断",
] as const;

/**
 * Build a formatted constraints block from request.md content.
 *
 * Extracts the three constraint sections (`スコープ外`, `受け入れ基準`,
 * `architect 評価済みの設計判断`) and formats them as a labeled block for
 * CLI-side injection into agent context (design / code-review steps).
 *
 * @returns Formatted block string, or `undefined` if no constraint sections exist.
 */
export function buildRequestConstraintsBlock(
  requestContent: string,
): string | undefined {
  const sections = extractMarkdownSections(requestContent, [
    ...REQUEST_CONSTRAINT_HEADINGS,
  ]);

  if (sections.size === 0) {
    return undefined;
  }

  const parts: string[] = [
    "## Request Constraints (CLI-injected)",
    "",
    "以下は request.md から CLI が抽出した制約情報です。設計・レビュー時に必ず参照してください。",
  ];

  for (const heading of REQUEST_CONSTRAINT_HEADINGS) {
    const sectionContent = sections.get(heading);
    if (sectionContent !== undefined) {
      parts.push("", `### ${heading}`, "", sectionContent);
    }
  }

  return parts.join("\n");
}
