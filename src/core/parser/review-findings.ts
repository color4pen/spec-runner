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

/**
 * Parse the Findings table from review-feedback file content and count findings
 * where the `Fix` column is `yes` (case-insensitive).
 *
 * Machine-readable fixable finding count used by code-review.ts to determine
 * whether approved verdict has fixable findings (used by transition table when predicate).
 *
 * Design D5: `Fix` column is required for new format; absent = 0 (backward compat).
 *
 * @returns number of findings with Fix=yes, or 0 if Fix column / Findings section absent.
 */
export function parseFixableFindings(content: string): number {
  // Find the ## Findings section
  const findingsSectionMatch = /^##\s+Findings\s*$/m.exec(content);
  if (!findingsSectionMatch) {
    return 0;
  }

  // Extract everything from the ## Findings heading to the next ## heading (or end of string)
  const afterHeading = content.slice(findingsSectionMatch.index + findingsSectionMatch[0].length);
  const nextHeadingMatch = /^##\s+/m.exec(afterHeading);
  const sectionContent = nextHeadingMatch
    ? afterHeading.slice(0, nextHeadingMatch.index)
    : afterHeading;

  const lines = sectionContent.split("\n");

  let headerRowIndex = -1;
  let fixColumnIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (!line.startsWith("|")) continue;

    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");

    const fixIdx = cells.findIndex((c) => c.toLowerCase() === "fix");
    if (fixIdx !== -1) {
      headerRowIndex = i;
      fixColumnIndex = fixIdx;
      break;
    }
  }

  // Fix column not present — backward compat: return 0
  if (headerRowIndex === -1 || fixColumnIndex === -1) {
    return 0;
  }

  let count = 0;
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

    if (cells.length <= fixColumnIndex) continue;

    if ((cells[fixColumnIndex] ?? "").toLowerCase() === "yes") {
      count++;
    }
  }

  return count;
}
