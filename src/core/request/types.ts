/**
 * Types for request management.
 * ParsedRequest/ParsedRequestSections are defined here and re-exported from src/parser/request-md.ts.
 */

export interface ParsedRequestSections {
  /** Content under ## 背景 heading, or undefined if heading not present. */
  背景?: string;
  /** Content under ## 目的 heading, or undefined if heading not present. */
  目的?: string;
}

export interface ParsedRequest {
  type: string;
  title: string;
  /** Canonical slug for this change — the single source of truth across the pipeline. */
  slug: string;
  /** Base branch for diff/worktree/PR operations (e.g. "main" or "master"). */
  baseBranch: string;
  content: string;
  enabled: string[];
  /** Optional section extracts for PR body generation. */
  sections?: ParsedRequestSections;
}

/**
 * Lifecycle state of a request.
 * canceled is out of scope for this change.
 */
export type RequestState = "active" | "merged";
