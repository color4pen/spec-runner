/**
 * R4 (contract lock): `parseFixableFindings` and `parseFindingSeverityCounts` functions deleted.
 * Both were dead code after R3 cutover to typed toolResult (fixableCount, approved).
 * Only the `FindingSeverityCounts` interface is retained — referenced by ParsedStepResult.scores
 * in types.ts. Removing the interface would require changes across multiple files.
 */

export interface FindingSeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}
