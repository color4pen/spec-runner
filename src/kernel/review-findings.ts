/**
 * FindingSeverityCounts: severity count breakdown from a review result.
 *
 * Kernel principle: zero imports. Pure data interface.
 * Referenced by ParsedStepResult.scores in core/port/step-types.ts.
 */
export interface FindingSeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
}
