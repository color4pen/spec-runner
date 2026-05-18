/**
 * Generic validation rule interface.
 *
 * TInput  — the validated subject type
 * TViolation — the violation record type returned when the rule fails
 */
export interface ValidationRule<TInput, TViolation> {
  name: string;
  severity: "error" | "warning";
  check(input: TInput): TViolation[];
}
