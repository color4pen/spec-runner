/**
 * Generic validation rule interface.
 *
 * TInput  — the validated subject type
 * TViolation — the violation record type returned when the rule fails
 * TName — the string literal union constraining the rule name (defaults to string for backward compatibility)
 */
export interface ValidationRule<TInput, TViolation, TName extends string = string> {
  name: TName;
  severity: "error" | "warning";
  check(input: TInput): TViolation[];
}
