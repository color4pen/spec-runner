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
import { boolean, number, optional, string, union, literal, object, toJSONSchema } from "zod/v4-mini";
import type { ReportToolSpec, BaseReportResult, ProducerReportResult, JudgeReportResult, CodeReviewReportResult } from "../port/report-result.js";
import { parseBaseReportInput, parseProducerReportInput, parseJudgeReportInput, parseCodeReviewReportInput } from "../port/report-result.js";
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
 * design / implementer / spec-fixer / delta-spec-fixer / code-fixer / build-fixer / test-case-gen / adr-gen
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
 * Typed ReportToolSpec for judge steps: spec-review.
 *
 * Adds approved: boolean to the base schema (additive — existing ok/reason preserved).
 * approved is optional — agents are encouraged but not required to populate it in R2.
 */
export const JUDGE_REPORT_TOOL: ReportToolSpec<JudgeReportResult> = {
  name: "report_result",
  description: "Report the completion of this step. Call with ok=true for normal completion, ok=false with a reason for voluntary failure. approved: true if the spec/code was approved, false if it needs fixes. You MUST call this tool before ending your turn.",
  zodSchema: {
    ok: boolean(),
    reason: optional(string()),
    approved: optional(boolean()),
  },
  parseInput: parseJudgeReportInput,
};

/**
 * Typed ReportToolSpec for code-review step.
 *
 * Adds approved: boolean and fixableCount: number to the base schema (additive).
 * Both fields are optional — agents are encouraged but not required to populate them in R2.
 */
export const CODE_REVIEW_REPORT_TOOL: ReportToolSpec<CodeReviewReportResult> = {
  name: "report_result",
  description: "Report the completion of this step. Call with ok=true for normal completion, ok=false with a reason for voluntary failure. approved: true if the code was approved, false if it needs fixes. fixableCount: number of findings that can be auto-fixed. You MUST call this tool before ending your turn.",
  zodSchema: {
    ok: boolean(),
    reason: optional(string()),
    approved: optional(boolean()),
    fixableCount: optional(number()),
  },
  parseInput: parseCodeReviewReportInput,
};
