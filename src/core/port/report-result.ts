/**
 * Port definitions for report_result custom tool — the mechanism by which agent steps
 * declare their completion to the CLI.
 *
 * Design: "agent が tool 呼び出しで自分の完了を能動的に宣言する" (tool-driven-step-completion)
 * Replaces probabilistic end-of-turn + file parse detection with structural tool-call detection.
 */
import type { ZodRawShape } from "zod/v4";

export type { ZodRawShape };

import type { BaseReportResult } from "../../kernel/report-result.js";
export type { BaseReportResult } from "../../kernel/report-result.js";

/**
 * Specification for the report_result custom tool that an agent step registers.
 *
 * The same zodSchema is used in two runtimes:
 * - Local:   passed directly as `inputSchema` to createSdkMcpServer (AnyZodRawShape)
 * - Managed: converted via z.toJSONSchema(z.object(zodSchema)) for agents.create tools.input_schema
 */
export interface ReportToolSpec<TResult = BaseReportResult> {
  /** Tool name — fixed as "report_result" in phase 1. */
  name: string;
  /** Human-readable description sent to the model. */
  description: string;
  /**
   * Zod v4 schema (written with zod/v4-mini primitives).
   * Kept as ZodRawShape so adapters can decide how to consume it:
   * - Local: inputSchema = zodSchema directly (AnyZodRawShape compatible)
   * - Managed: z.object(zodSchema) → z.toJSONSchema(...)
   */
  zodSchema: ZodRawShape;
  /**
   * Parse raw unknown input from the tool call into TResult.
   * Written by hand (no zod parse/refine) to keep zod usage minimal.
   * Returns ok:true with typed value, or ok:false with missing fields list.
   */
  parseInput: (raw: unknown) =>
    | { ok: true; value: TResult }
    | { ok: false; missingFields: string[]; rawInput: unknown };
}

/**
 * Policy for follow-up retries when the agent fails to call report_result.
 * Default implementation is provided via DEFAULT_TOOL_RETRY.
 * Individual steps can override by setting toolReportRetry in AgentRunContext.policy.
 */
export interface FollowUpPolicy {
  /** Maximum number of follow-up retry attempts. Default: 2. */
  maxAttempts: number;
  /**
   * Build the follow-up prompt text for a given retry attempt.
   * Called when the agent ended a turn without calling report_result,
   * or called it with invalid input.
   */
  buildPrompt: (input: {
    /** 1-indexed attempt number (1 = first retry, 2 = second retry, ...). */
    attempt: number;
    /** Why the follow-up is being sent. */
    reason: "no-tool-call" | "invalid-input";
    /** Fields that were missing from the tool call input (only when reason = "invalid-input"). */
    missingFields?: string[];
    /** Raw input that was rejected (only when reason = "invalid-input"). */
    rawInput?: unknown;
  }) => string;
}

/**
 * Default follow-up retry policy.
 * maxAttempts = 2: the agent gets 2 chances to call report_result after the initial turn.
 * Steps that don't set toolReportRetry in their context use this automatically.
 */
const DEFAULT_MAX_TOOL_RETRY_ATTEMPTS = 2;

export const DEFAULT_TOOL_RETRY: FollowUpPolicy = {
  maxAttempts: DEFAULT_MAX_TOOL_RETRY_ATTEMPTS,
  buildPrompt: ({ attempt, reason, missingFields }) => {
    if (reason === "no-tool-call") {
      return `You did not call the report_result tool. Please call it with { ok: true } or { ok: false, reason: "..." } to complete this step. (attempt ${attempt}/${DEFAULT_MAX_TOOL_RETRY_ATTEMPTS})`;
    }
    return `The report_result tool input was invalid. Missing fields: ${missingFields?.join(", ")}. Please call it again with the required fields. (attempt ${attempt}/${DEFAULT_MAX_TOOL_RETRY_ATTEMPTS})`;
  },
};

/**
 * Shared helper to parse BaseReportResult from unknown tool input.
 * Used by all steps as their parseInput implementation in phase 1.
 * Written without zod parse API — hand-checks typeof for tree-shaking stability.
 */
export function parseBaseReportInput(
  raw: unknown,
): { ok: true; value: BaseReportResult } | { ok: false; missingFields: string[]; rawInput: unknown } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, missingFields: ["ok"], rawInput: raw };
  }
  const obj = raw as Record<string, unknown>;
  const missingFields: string[] = [];

  if (typeof obj["ok"] !== "boolean") {
    missingFields.push("ok");
  }

  if (missingFields.length > 0) {
    return { ok: false, missingFields, rawInput: raw };
  }

  const result: BaseReportResult = {
    ok: obj["ok"] as boolean,
  };
  if (typeof obj["reason"] === "string") {
    result.reason = obj["reason"];
  }

  return { ok: true, value: result };
}

// ---------------------------------------------------------------------------
// Step-class-specific typed outcome interfaces (additive / R2 expand phase)
// These extend BaseReportResult additively — existing { ok, reason? } is preserved.
// None of the new fields are read by executor.ts or pipeline/types.ts (R3).
// ---------------------------------------------------------------------------

/**
 * Typed outcome for producer steps:
 * design / implementer / spec-fixer / code-fixer / build-fixer / test-case-gen / adr-gen
 *
 * status: "success" | "error" — the semantic outcome of the producer step.
 * Optional — undefined when the agent did not populate it (expand phase).
 */
export interface ProducerReportResult extends BaseReportResult {
  status?: "success" | "error";
}

/**
 * Typed outcome for judge steps: spec-review.
 *
 * approved: boolean — whether the spec/code was approved.
 * Optional — undefined when the agent did not populate it (expand phase).
 */
export interface JudgeReportResult extends BaseReportResult {
  approved?: boolean;
}

/**
 * Typed outcome for code-review step (judge subtype with additional field).
 *
 * fixableCount: number — count of auto-fixable findings.
 * Optional — undefined when the agent did not populate it (expand phase).
 */
export interface CodeReviewReportResult extends JudgeReportResult {
  fixableCount?: number;
}

/**
 * Parse ProducerReportResult from unknown tool input.
 * Builds on parseBaseReportInput and optionally sets status when value is "success" or "error".
 * Invalid status values (not "success" | "error") are silently ignored (not in missingFields).
 */
export function parseProducerReportInput(
  raw: unknown,
): { ok: true; value: ProducerReportResult } | { ok: false; missingFields: string[]; rawInput: unknown } {
  const base = parseBaseReportInput(raw);
  if (!base.ok) return base;

  const obj = raw as Record<string, unknown>;
  const result: ProducerReportResult = { ...base.value };

  if (obj["status"] === "success" || obj["status"] === "error") {
    result.status = obj["status"];
  }

  return { ok: true, value: result };
}

/**
 * Parse JudgeReportResult from unknown tool input.
 * Builds on parseBaseReportInput and optionally sets approved when value is a boolean.
 * Non-boolean approved values are silently ignored (not in missingFields).
 */
export function parseJudgeReportInput(
  raw: unknown,
): { ok: true; value: JudgeReportResult } | { ok: false; missingFields: string[]; rawInput: unknown } {
  const base = parseBaseReportInput(raw);
  if (!base.ok) return base;

  const obj = raw as Record<string, unknown>;
  const result: JudgeReportResult = { ...base.value };

  if (typeof obj["approved"] === "boolean") {
    result.approved = obj["approved"];
  }

  return { ok: true, value: result };
}

/**
 * Parse CodeReviewReportResult from unknown tool input.
 * Builds on parseJudgeReportInput (includes base + approved) and optionally sets fixableCount.
 * Non-number fixableCount values are silently ignored (not in missingFields).
 */
export function parseCodeReviewReportInput(
  raw: unknown,
): { ok: true; value: CodeReviewReportResult } | { ok: false; missingFields: string[]; rawInput: unknown } {
  const judge = parseJudgeReportInput(raw);
  if (!judge.ok) return judge;

  const obj = raw as Record<string, unknown>;
  const result: CodeReviewReportResult = { ...judge.value };

  if (typeof obj["fixableCount"] === "number") {
    result.fixableCount = obj["fixableCount"];
  }

  return { ok: true, value: result };
}

/**
 * Typed outcome for request-review step (pipeline gate).
 *
 * verdict: "approve" | "needs-discussion" | "reject" — the architect's verdict on the request.
 * Optional — undefined when the agent did not populate it (fallback: needs-discussion).
 */
export interface RequestReviewReportResult extends BaseReportResult {
  verdict?: "approve" | "needs-discussion" | "reject";
}

/**
 * Parse RequestReviewReportResult from unknown tool input.
 * Builds on parseBaseReportInput and optionally sets verdict when value is one of the 3 valid values.
 * Invalid verdict values are silently ignored (not in missingFields).
 */
export function parseRequestReviewReportInput(
  raw: unknown,
): { ok: true; value: RequestReviewReportResult } | { ok: false; missingFields: string[]; rawInput: unknown } {
  const base = parseBaseReportInput(raw);
  if (!base.ok) return base;

  const obj = raw as Record<string, unknown>;
  const result: RequestReviewReportResult = { ...base.value };

  if (obj["verdict"] === "approve" || obj["verdict"] === "needs-discussion" || obj["verdict"] === "reject") {
    result.verdict = obj["verdict"];
  }

  return { ok: true, value: result };
}
