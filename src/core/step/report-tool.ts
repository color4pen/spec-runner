/**
 * Shared report_result tool specification for all agent steps (phase 1).
 *
 * Phase 1 uses BaseReportResult schema {ok, reason?} uniformly across all 10 steps.
 * Each step imports REPORT_TOOL and sets it as step.reportTool.
 *
 * Phase 3 (R2 expand): per-step-class typed specs added additively.
 * PRODUCER_REPORT_TOOL / JUDGE_REPORT_TOOL / CODE_REVIEW_REPORT_TOOL extend {ok, reason?}
 * with step-class fields. The old REPORT_TOOL / REPORT_TOOL_CUSTOM_TOOL_SPEC remain for compat.
 */
import { boolean, number, optional, string, union, literal, object, array, toJSONSchema } from "zod/v4-mini";
import type { ReportToolSpec, BaseReportResult, ProducerReportResult, JudgeReportResult, CodeReviewReportResult, RequestReviewReportResult, ConformanceReportResult } from "../port/report-result.js";
import { parseBaseReportInput, parseProducerReportInput, parseJudgeReportInput, parseCodeReviewReportInput, parseRequestReviewReportInput, parseConformanceReportInput } from "../port/report-result.js";
import type { CustomToolSpec } from "../agent/definition.js";

/**
 * Shared ReportToolSpec for phase 1: {ok, reason?}.
 * All 10 agent steps use this same spec in phase 1.
 * Kept for backward compatibility — not removed in R2.
 */
export const REPORT_TOOL: ReportToolSpec<BaseReportResult> = {
  name: "report_result",
  description: "Report the completion of this step. Call with ok=true for normal completion, ok=false with a reason for voluntary failure. You MUST call this tool before ending your turn.",
  zodSchema: {
    ok: boolean(),
    reason: optional(string()),
  },
  parseInput: parseBaseReportInput,
};

/**
 * CustomToolSpec for the report_result tool, for use in AgentDefinition.tools.
 * input_schema is derived from REPORT_TOOL.zodSchema via z.toJSONSchema — single source of truth.
 * Kept for backward compatibility — not removed in R2.
 */
export const REPORT_TOOL_CUSTOM_TOOL_SPEC: CustomToolSpec = {
  type: "custom",
  name: REPORT_TOOL.name,
  description: REPORT_TOOL.description,
  input_schema: toJSONSchema(object(REPORT_TOOL.zodSchema)) as CustomToolSpec["input_schema"],
};

// ---------------------------------------------------------------------------
// R2 expand: per-step-class typed tool specs + toCustomToolSpec helper
// ---------------------------------------------------------------------------

/**
 * Convert a ReportToolSpec to a CustomToolSpec for use in AgentDefinition.tools.
 * Derives input_schema from spec.zodSchema via z.toJSONSchema — single source of truth.
 */
export function toCustomToolSpec(spec: ReportToolSpec): CustomToolSpec {
  return {
    type: "custom",
    name: spec.name,
    description: spec.description,
    input_schema: toJSONSchema(object(spec.zodSchema)) as CustomToolSpec["input_schema"],
  };
}

/**
 * Typed ReportToolSpec for producer steps:
 * design / implementer / spec-fixer / code-fixer / build-fixer / test-case-gen / adr-gen
 *
 * Adds status: "success" | "error" to the base schema (additive — existing ok/reason preserved).
 * status is optional — agents are encouraged but not required to populate it in R2.
 */
export const PRODUCER_REPORT_TOOL: ReportToolSpec<ProducerReportResult> = {
  name: "report_result",
  description: 'Report the completion of this step. Call with ok=true for normal completion, ok=false with a reason for voluntary failure. status: "success" or "error" indicates the semantic outcome of this producer step. You MUST call this tool before ending your turn.',
  zodSchema: {
    ok: boolean(),
    reason: optional(string()),
    status: optional(union([literal("success"), literal("error")])),
  },
  parseInput: parseProducerReportInput,
};

/**
 * Zod schema for the evidence field in judge report tools.
 * All three counts (checked, skipped, unverified) are required non-negative integers.
 * Evidence is required when ok=true; enforcement is via parseInput, not zod.
 */
const evidenceSchema = object({
  checked: number(),
  skipped: number(),
  unverified: number(),
});

/**
 * Zod schema for a single decision option within a decision-needed finding.
 */
const decisionOptionSchema = object({
  label: string(),
  consequence: string(),
});

/**
 * Zod schema for a single finding object.
 * Used by judge tools to report structured findings for CLI verdict derivation.
 *
 * `options` is required when `resolution` is `"decision-needed"` (at least two options).
 * For `"fixable"` findings, `options` must not be provided.
 * The hand-written `parseFindings` in report-result.ts enforces the ≥2 options rule at parse time.
 */
const findingSchema = array(object({
  severity: union([literal("critical"), literal("high"), literal("medium"), literal("low")]),
  resolution: union([literal("fixable"), literal("decision-needed")]),
  file: string(),
  line: optional(number()),
  title: string(),
  rationale: string(),
  options: optional(array(decisionOptionSchema)),
  origin: optional(literal("scope")),
}));

/**
 * Zod schema for a single observation object.
 * Used by judge tools to record informational observations that do NOT affect verdict routing.
 * Intentionally lacks `resolution` — observations are never fixable or decision-needed.
 */
const observationSchema = array(object({
  severity: union([literal("critical"), literal("high"), literal("medium"), literal("low")]),
  file: string(),
  line: optional(number()),
  title: string(),
  rationale: string(),
}));

/**
 * Typed ReportToolSpec for judge steps: spec-review.
 *
 * Adds approved: boolean (compat) and findings array to the base schema.
 * verdict is derived by the CLI from findings — approved boolean is ignored for routing.
 * observations: optional channel for informational records that do NOT affect verdict routing.
 * evidence: REQUIRED when ok=true — verification-volume counts. checked=0 is treated as indeterminate.
 */
export const JUDGE_REPORT_TOOL: ReportToolSpec<JudgeReportResult> = {
  name: "report_result",
  description: "Report the completion of this step. Call with ok=true for normal completion, ok=false with a reason for voluntary failure. REQUIRED when ok=true: provide a 'findings' array — each element is { severity: 'critical'|'high'|'medium'|'low', resolution: 'fixable'|'decision-needed', file: string, line?: number, title: string, rationale: string, options?: [{label: string, consequence: string}] }. When resolution is 'decision-needed', options is REQUIRED and must contain at least 2 entries — each with label and consequence. The CLI derives the verdict from findings; the 'approved' field is kept for compatibility but is NOT used for routing. REQUIRED when ok=true: provide an 'evidence' object { checked: number, skipped: number, unverified: number } — all values must be non-negative integers. checked = number of items actually verified; skipped = in-scope items not verified; unverified = items declared unconfirmed. checked=0 is treated as indeterminate (判定不能). Optional: 'observations' array for informational records that do not require action and do not affect the verdict — each element is { severity, file, line?, title, rationale } (no resolution field). Omit observations if there is nothing noteworthy to record. You MUST call this tool before ending your turn.",
  zodSchema: {
    ok: boolean(),
    reason: optional(string()),
    approved: optional(boolean()),
    findings: optional(findingSchema),
    observations: optional(observationSchema),
    evidence: optional(evidenceSchema),
  },
  parseInput: parseJudgeReportInput,
};

/**
 * Typed ReportToolSpec for code-review step.
 *
 * Adds approved: boolean (compat) and findings array.
 * verdict is derived by the CLI from findings.
 * fixableCount: number remains in zodSchema for compat with old prompt caches, but
 * agents are not required to report it — routing is derived from findings.
 * observations: optional channel for informational records that do NOT affect verdict routing.
 * evidence: REQUIRED when ok=true — verification-volume counts. checked=0 is treated as indeterminate.
 */
export const CODE_REVIEW_REPORT_TOOL: ReportToolSpec<CodeReviewReportResult> = {
  name: "report_result",
  description: "Report the completion of this step. Call with ok=true for normal completion, ok=false with a reason for voluntary failure. REQUIRED when ok=true: provide a 'findings' array — each element is { severity: 'critical'|'high'|'medium'|'low', resolution: 'fixable'|'decision-needed', file: string, line?: number, title: string, rationale: string, options?: [{label: string, consequence: string}] }. When resolution is 'decision-needed', options is REQUIRED and must contain at least 2 entries — each with label and consequence. The CLI derives the verdict from findings; the 'approved' field is kept for compatibility but is NOT used for routing. REQUIRED when ok=true: provide an 'evidence' object { checked: number, skipped: number, unverified: number } — all values must be non-negative integers. checked = number of items actually verified; skipped = in-scope items not verified; unverified = items declared unconfirmed. checked=0 is treated as indeterminate (判定不能). Optional: 'observations' array for informational records that do not require action and do not affect the verdict — each element is { severity, file, line?, title, rationale } (no resolution field). Omit observations if there is nothing noteworthy to record. You MUST call this tool before ending your turn.",
  zodSchema: {
    ok: boolean(),
    reason: optional(string()),
    approved: optional(boolean()),
    fixableCount: optional(number()),
    findings: optional(findingSchema),
    observations: optional(observationSchema),
    evidence: optional(evidenceSchema),
  },
  parseInput: parseCodeReviewReportInput,
};

/**
 * Zod schema for a single conformance finding object.
 * Extends the base findingSchema with the optional fixTarget field.
 * Used exclusively by CONFORMANCE_REPORT_TOOL.
 */
const conformanceFindingSchema = array(object({
  severity: union([literal("critical"), literal("high"), literal("medium"), literal("low")]),
  resolution: union([literal("fixable"), literal("decision-needed")]),
  file: string(),
  line: optional(number()),
  title: string(),
  rationale: string(),
  fixTarget: optional(union([literal("implementer"), literal("code-fixer"), literal("spec-fixer")])),
  options: optional(array(decisionOptionSchema)),
  origin: optional(literal("scope")),
}));

/**
 * Typed ReportToolSpec for the conformance step.
 *
 * Extends the judge findings schema with fixTarget for fix routing.
 * The CLI derives the routing target from findings (R7 contract — not agent-declared).
 * evidence: REQUIRED when ok=true — verification-volume counts. checked=0 is treated as indeterminate.
 *
 * fixTarget semantics (per finding):
 *   "spec-fixer"  — spec/design errors: the spec or design artifact is wrong/incomplete
 *   "implementer" — implementation gaps: the implementation is missing or incomplete
 *   "code-fixer"  — local code non-conformities: isolated code-level issues
 *   (omitted)     — defaults to "implementer"
 */
export const CONFORMANCE_REPORT_TOOL: ReportToolSpec<ConformanceReportResult> = {
  name: "report_result",
  description: "Report the completion of the conformance step. Call with ok=true for normal completion, ok=false with a reason for voluntary failure. REQUIRED when ok=true: provide a 'findings' array — each element is { severity: 'critical'|'high'|'medium'|'low', resolution: 'fixable'|'decision-needed', file: string, line?: number, title: string, rationale: string, fixTarget?: 'implementer'|'code-fixer'|'spec-fixer', options?: [{label: string, consequence: string}] }. When resolution is 'decision-needed', options is REQUIRED and must contain at least 2 entries — each with label and consequence. The CLI derives the routing target from findings; do NOT declare a routing verdict yourself. fixTarget routing: 'spec-fixer' = spec/design artifact is wrong; 'implementer' = implementation is missing or incomplete; 'code-fixer' = local code non-conformity; omit to default to 'implementer'. REQUIRED when ok=true: provide an 'evidence' object { checked: number, skipped: number, unverified: number } — all values must be non-negative integers. checked = number of items actually verified; checked=0 is treated as indeterminate (判定不能). You MUST call this tool before ending your turn.",
  zodSchema: {
    ok: boolean(),
    reason: optional(string()),
    approved: optional(boolean()),
    findings: optional(conformanceFindingSchema),
    evidence: optional(evidenceSchema),
  },
  parseInput: parseConformanceReportInput,
};

/**
 * Typed ReportToolSpec for request-review step (pipeline gate).
 *
 * Adds verdict: "approve" | "needs-discussion" | "reject" (compat) and findings array.
 * Routing verdict is derived by the CLI from findings.
 * observations: optional channel for informational records that do NOT affect verdict routing.
 *
 * Verdict semantics (for findings):
 *   approve          — no blocking findings (critical/high/decision-needed)
 *   needs-discussion — one or more blocking findings
 *   reject           — kept for compat; CLI treats same as needs-discussion for routing
 */
export const REQUEST_REVIEW_REPORT_TOOL: ReportToolSpec<RequestReviewReportResult> = {
  name: "report_result",
  description: "Report the completion of the request-review step. Call with ok=true for normal completion. REQUIRED when ok=true: provide a 'findings' array — each element is { severity: 'critical'|'high'|'medium'|'low', resolution: 'fixable'|'decision-needed', file: string, line?: number, title: string, rationale: string, options?: [{label: string, consequence: string}] }. When resolution is 'decision-needed', options is REQUIRED and must contain at least 2 entries — each with label and consequence. The CLI derives the verdict from findings; the 'verdict' field is kept for compatibility but is NOT used for routing. Optional: 'observations' array for informational records that do not require action and do not affect the verdict — each element is { severity, file, line?, title, rationale } (no resolution field). Omit observations if there is nothing noteworthy to record. You MUST call this tool before ending your turn.",
  zodSchema: {
    ok: boolean(),
    reason: optional(string()),
    verdict: optional(union([literal("approve"), literal("needs-discussion"), literal("reject")])),
    findings: optional(findingSchema),
    observations: optional(observationSchema),
  },
  parseInput: parseRequestReviewReportInput,
};
