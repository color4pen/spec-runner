/**
 * Types for request management — canonical location in shared-kernel (parser/).
 *
 * These types were moved here from src/core/request/types.ts per structure-rulings D4.
 * The core/request/types.ts module re-exports from this file (domain → kernel, allowed).
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
  /**
   * Whether to run the adr-gen step for this request.
   * true → judge agent evaluates if ADR-worthy and generates if so.
   * false → adr-gen step is a no-op.
   * Required field — missing or invalid values cause REQUEST_MD_INVALID.
   */
  adr: boolean;
  /** Optional section extracts for PR body generation. */
  sections?: ParsedRequestSections;
  /** Issue reference from Meta section (e.g. "#264"). undefined if not present. */
  issue?: string;
}
