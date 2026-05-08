/**
 * Parser for Findings severity counts from code-review result files.
 *
 * Parses the `## Findings` section Severity column:
 *   | # | Severity | Category | File | Description | How to Fix |
 *   |---|----------|----------|------|-------------|------------|
 *   | 1 | CRITICAL | security | src/auth.ts:10 | Auth bypass | Fix auth |
 *   | 2 | HIGH | correctness | src/foo.ts:42 | Null deref | Add null check |
 *
 * Returns counts of CRITICAL / HIGH / MEDIUM / LOW findings.
 * If no Findings table is found, returns all-zero counts.
 */

export interface FindingSeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

/**
 * Parse the Findings table from review-feedback file content and count by severity.
 *
 * Case-insensitive: "critical", "Critical", "CRITICAL" all count as CRITICAL.
 * Unknown severity values are ignored.
 *
 * @returns FindingSeverityCounts — always returns an object (never null).
 */
export function parseFindingSeverityCounts(content: string): FindingSeverityCounts {
  const zeroCounts: FindingSeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

  // Find the ## Findings section
  const findingsSectionMatch = /^##\s+Findings\s*$/m.exec(content);
  if (!findingsSectionMatch) {
    return zeroCounts;
  }

  // Extract everything from the ## Findings heading to the next ## heading (or end of string)
  const afterHeading = content.slice(findingsSectionMatch.index + findingsSectionMatch[0].length);
  const nextHeadingMatch = /^##\s+/m.exec(afterHeading);
  const sectionContent = nextHeadingMatch
    ? afterHeading.slice(0, nextHeadingMatch.index)
    : afterHeading;

  // Find the Severity column index from the header row
  const lines = sectionContent.split("\n");

  let headerRowIndex = -1;
  let severityColumnIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (!line.startsWith("|")) continue;

    // This is the header row — find which column is "Severity"
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");

    const sevIdx = cells.findIndex((c) => c.toLowerCase() === "severity");
    if (sevIdx !== -1) {
      headerRowIndex = i;
      severityColumnIndex = sevIdx;
      break;
    }
  }

  if (headerRowIndex === -1 || severityColumnIndex === -1) {
    return zeroCounts;
  }

  // Parse data rows (skip header + separator rows)
  const counts: FindingSeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

  let dataStarted = false;
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (!line.startsWith("|")) break;

    // Skip the separator row (contains ---)
    if (!dataStarted) {
      dataStarted = true;
      continue;
    }

    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");

    if (cells.length <= severityColumnIndex) continue;

    const severity = cells[severityColumnIndex]?.toLowerCase() ?? "";
    switch (severity) {
      case "critical":
        counts.critical++;
        break;
      case "high":
        counts.high++;
        break;
      case "medium":
        counts.medium++;
        break;
      case "low":
        counts.low++;
        break;
    }
  }

  return counts;
}
