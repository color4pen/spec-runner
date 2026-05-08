/**
 * Parser for the structured Scores table in code-review result files.
 *
 * Parses the `## Scores` section:
 *   | Category | Score | Weight |
 *   |----------|-------|--------|
 *   | correctness | 8 | 0.30 |
 *   ...
 *   - **total**: 7.8
 *
 * Returns null if the section or total line is missing, or if any value is invalid.
 */

export interface ReviewScores {
  categories: Record<string, { score: number; weight: number }>;
  total: number;
}

/**
 * Parse the Scores table from review-feedback file content.
 *
 * @returns ReviewScores if successfully parsed, null otherwise.
 */
export function parseReviewScores(content: string): ReviewScores | null {
  // Find the ## Scores section
  const scoresSectionMatch = /^##\s+Scores\s*$/m.exec(content);
  if (!scoresSectionMatch) {
    return null;
  }

  // Extract everything from the ## Scores heading to the next ## heading (or end of string)
  const afterHeading = content.slice(scoresSectionMatch.index + scoresSectionMatch[0].length);
  const nextHeadingMatch = /^##\s+/m.exec(afterHeading);
  const sectionContent = nextHeadingMatch
    ? afterHeading.slice(0, nextHeadingMatch.index)
    : afterHeading;

  // Parse the total line: - **total**: <number>
  const totalMatch = /^-\s+\*{0,2}total\*{0,2}:\s*([\d.]+)\s*$/m.exec(sectionContent);
  if (!totalMatch || !totalMatch[1]) {
    return null;
  }
  const total = parseFloat(totalMatch[1]);
  if (isNaN(total)) {
    return null;
  }

  // Parse the markdown table rows (skip header and separator rows)
  const categories: Record<string, { score: number; weight: number }> = {};

  // Split section into lines and find table data rows
  const lines = sectionContent.split("\n");
  let inTable = false;
  let headerParsed = false;
  let separatorParsed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (inTable) {
        // End of table
        break;
      }
      continue;
    }

    inTable = true;

    // Skip header row (contains "Category")
    if (!headerParsed) {
      headerParsed = true;
      continue;
    }

    // Skip separator row (contains ---)
    if (!separatorParsed) {
      separatorParsed = true;
      continue;
    }

    // Parse data row: | category | score | weight |
    const cells = trimmed
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell) => cell !== "");

    if (cells.length < 3) {
      continue;
    }

    const category = cells[0];
    const scoreRaw = cells[1];
    const weightRaw = cells[2];

    if (!category || !scoreRaw || !weightRaw) {
      return null;
    }

    const score = parseFloat(scoreRaw);
    const weight = parseFloat(weightRaw);

    if (isNaN(score) || isNaN(weight)) {
      return null;
    }

    categories[category] = { score, weight };
  }

  return { categories, total };
}
