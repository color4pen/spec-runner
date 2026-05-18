import type { ParsedRequestSections } from "../../core/request/types.js";

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
  enabled: string[];
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
