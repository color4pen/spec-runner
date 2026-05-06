import type { Verdict } from "../../state/schema.js";

/**
 * Parse the verdict from a review result file content.
 * Shared by spec-review and code-review steps.
 *
 * Design D5: extracted from parseSpecReviewVerdict in spec-review.ts.
 * Design D3: extended to tolerate format variations from agents:
 *   - `- **verdict**: approved`    (original)
 *   - `**Verdict**: approved`      (uppercase V, no `- ` prefix)
 *   - `Verdict: needs-fix`         (no bold)
 *   - `- verdict: escalation`      (`- ` prefix, no bold)
 *
 * Pattern: optional `- ` prefix, optional `**` bold markers, case-insensitive "verdict",
 *          colon, whitespace, then the verdict value.
 *
 * @returns the matched Verdict or null if not found / invalid value
 */
export function parseReviewVerdict(content: string): Verdict | null {
  const regex = /^(?:-\s*)?\*{0,2}[Vv]erdict\*{0,2}:\s*(approved|needs-fix|escalation)\s*$/m;
  const match = regex.exec(content);
  if (!match || !match[1]) {
    return null;
  }
  return match[1] as Verdict;
}
