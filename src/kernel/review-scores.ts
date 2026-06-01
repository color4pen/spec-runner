/**
 * ReviewScores: structured scores extracted from a code-review result file.
 *
 * Kernel principle: zero imports. Pure data interface.
 * The parseReviewScores() function remains in core/parser/review-scores.ts.
 */
export interface ReviewScores {
  categories: Record<string, { score: number; weight: number }>;
  total: number;
}
