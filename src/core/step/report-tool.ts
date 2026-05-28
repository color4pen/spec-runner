/**
 * Shared report_result tool specification for all agent steps (phase 1).
 *
 * Phase 1 uses BaseReportResult schema {ok, reason?} uniformly across all 10 steps.
 * Each step imports REPORT_TOOL and sets it as step.reportTool.
 *
 * Phase 3 (step schema expansion) will extend this with step-specific fields
 * (verdict, fixableCount, severityCounts, etc.) and replace with per-step definitions.
 */
import { boolean, optional, string, object, toJSONSchema } from "zod/v4-mini";
import type { ReportToolSpec, BaseReportResult } from "../port/report-result.js";
import { parseBaseReportInput } from "../port/report-result.js";
import type { CustomToolSpec } from "../agent/definition.js";

/**
 * Shared ReportToolSpec for phase 1: {ok, reason?}.
 * All 10 agent steps use this same spec in phase 1.
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
 * Phase 3 schema extensions to zodSchema will automatically propagate here.
 */
export const REPORT_TOOL_CUSTOM_TOOL_SPEC: CustomToolSpec = {
  type: "custom",
  name: REPORT_TOOL.name,
  description: REPORT_TOOL.description,
  input_schema: toJSONSchema(object(REPORT_TOOL.zodSchema)) as CustomToolSpec["input_schema"],
};
