import type { ParsedRequestSections } from "../../core/request/types.js";

/**
 * Union of all parser-layer validation rule names.
 * Using this type for ValidationRule<TInput, TViolation, RequestMdRuleName>
 * ensures typos in rule names are caught at compile time.
 */
export type RequestMdRuleName =
  | "type-required"
  | "type-known"
  | "slug-required"
  | "base-branch-required"
  | "adr-required"
  | "adr-valid"
  | "title-required";

/**
 * Raw extracted fields from request.md (null = not found).
 * Used as the input type for parser-layer ValidationRule instances.
 */
export interface ParsedRequestRaw {
  title: string | null;
  type: string | null;
  slug: string | null;
  baseBranch: string | null;
  /** "true" | "false" when adr field matches exact pattern, null otherwise */
  adrRaw: string | null;
  /** raw value when adr pattern is partially matched (invalid value), null when absent */
  adrAnyValue: string | null;
  issue: string | undefined;
  sections: ParsedRequestSections;
  filePath: string;
  content: string;
}

export interface RequestMdViolation {
  rule: string;
  severity: "error" | "warning";
  message: string;
  field?: string;
}
