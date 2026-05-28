/**
 * Port definitions for report_result custom tool — the mechanism by which agent steps
 * declare their completion to the CLI.
 *
 * Design: "agent が tool 呼び出しで自分の完了を能動的に宣言する" (tool-driven-step-completion)
 * Replaces probabilistic end-of-turn + file parse detection with structural tool-call detection.
 */
import type { ZodRawShape } from "zod/v4";

export type { ZodRawShape };

/**
 * Minimal completion result reported by the agent via report_result tool.
 * ok: true  = normal completion
 * ok: false = agent's voluntary failure declaration (with reason)
 */
export interface BaseReportResult {
  ok: boolean;
  reason?: string;
}

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
