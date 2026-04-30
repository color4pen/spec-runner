import type { Verdict } from "../../state/schema.js";

/**
 * Parse the verdict from a review result file content.
 * Shared by spec-review and code-review steps.
 *
 * Design D5: extracted from parseSpecReviewVerdict in spec-review.ts.
 * Matches the line: `- **verdict**: (approved|needs-fix|escalation)`
 *
 * @returns the matched Verdict or null if not found / invalid value
 */
export function parseReviewVerdict(content: string): Verdict | null {
  const regex = /^- \*\*verdict\*\*:\s*(approved|needs-fix|escalation)\s*$/m;
  const match = regex.exec(content);
  if (!match || !match[1]) {
    return null;
  }
  return match[1] as Verdict;
}
