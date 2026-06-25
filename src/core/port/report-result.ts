/**
 * Port definitions for report_result custom tool — the mechanism by which agent steps
 * declare their completion to the CLI.
 *
 * Design: "agent が tool 呼び出しで自分の完了を能動的に宣言する" (tool-driven-step-completion)
 * Replaces probabilistic end-of-turn + file parse detection with structural tool-call detection.
 */
import type { ZodRawShape } from "zod/v4";

export type { ZodRawShape };

import type { BaseReportResult, Finding, FixTarget, Observation, DecisionOption } from "../../kernel/report-result.js";
export type { BaseReportResult, Finding, FixTarget, Observation, DecisionOption } from "../../kernel/report-result.js";

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

const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low"]);
const VALID_RESOLUTIONS = new Set(["fixable", "decision-needed"]);
const VALID_FIX_TARGETS = new Set<FixTarget>(["implementer", "code-fixer", "spec-fixer"]);

/**
 * Parse and validate a findings array from unknown input.
 * Pure function — no I/O. Uses typeof checks (no zod parse).
 *
 * @param raw    Raw input to validate.
 * @param strict When true, `decision-needed` findings MUST have at least two valid options
 *               (each with non-empty `label` and `consequence`). Use true for new live tool
 *               calls; false (default) for legacy persisted state reads.
 *
 * Returns { ok: true, value: Finding[] } if input is a valid findings array.
 * Returns { ok: false } if input is missing, not an array, or contains invalid elements.
 */
export function parseFindings(raw: unknown, strict = false): { ok: true; value: Finding[] } | { ok: false } {
  if (!Array.isArray(raw)) return { ok: false };
  const findings: Finding[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return { ok: false };
    const f = item as Record<string, unknown>;
    if (!VALID_SEVERITIES.has(f["severity"] as string)) return { ok: false };
    if (!VALID_RESOLUTIONS.has(f["resolution"] as string)) return { ok: false };
    if (typeof f["file"] !== "string") return { ok: false };
    if (typeof f["title"] !== "string") return { ok: false };
    if (typeof f["rationale"] !== "string") return { ok: false };
    if ("line" in f && f["line"] !== undefined && f["line"] !== null && typeof f["line"] !== "number") return { ok: false };

    // Strict mode: decision-needed findings require at least two valid options
    if (strict && f["resolution"] === "decision-needed") {
      const opts = f["options"];
      if (!Array.isArray(opts) || opts.length < 2) return { ok: false };
      for (const opt of opts) {
        if (typeof opt !== "object" || opt === null) return { ok: false };
        const o = opt as Record<string, unknown>;
        if (typeof o["label"] !== "string" || o["label"].trim() === "") return { ok: false };
        if (typeof o["consequence"] !== "string" || o["consequence"].trim() === "") return { ok: false };
      }
    }

    const finding: Finding = {
      severity: f["severity"] as Finding["severity"],
      resolution: f["resolution"] as Finding["resolution"],
      file: f["file"] as string,
      title: f["title"] as string,
      rationale: f["rationale"] as string,
    };
    if (typeof f["line"] === "number") finding.line = f["line"] as number;
    // fixTarget: capture when present and valid; ignore invalid values (not in missingFields)
    if (typeof f["fixTarget"] === "string" && VALID_FIX_TARGETS.has(f["fixTarget"] as FixTarget)) {
      finding.fixTarget = f["fixTarget"] as FixTarget;
    }
    // options: capture when present and well-formed; legacy findings without options remain valid
    if (Array.isArray(f["options"])) {
      const parsedOptions: DecisionOption[] = [];
      let optionsValid = true;
      for (const opt of f["options"] as unknown[]) {
        if (typeof opt !== "object" || opt === null) { optionsValid = false; break; }
        const o = opt as Record<string, unknown>;
        if (typeof o["label"] !== "string" || typeof o["consequence"] !== "string") { optionsValid = false; break; }
        parsedOptions.push({ label: o["label"], consequence: o["consequence"] });
      }
      if (optionsValid && parsedOptions.length > 0) {
        finding.options = parsedOptions;
      }
    }
    // origin: capture when present and valid ("scope" only); invalid values silently ignored
    if (f["origin"] === "scope") {
      finding.origin = "scope";
    }
    findings.push(finding);
  }
  return { ok: true, value: findings };
}

/**
 * Parse and validate an observations array from unknown input.
 * Pure function — no I/O. Uses typeof checks (no zod parse).
 *
 * Each element is validated for: severity ∈ 4 values, file string, title string,
 * rationale string, line number or absent. No resolution field.
 *
 * Returns { ok: true, value: Observation[] } if input is a valid observations array.
 * Returns { ok: false } if input is not an array or contains invalid elements.
 * Callers should treat { ok: false } as silent-ignore (best-effort parse).
 */
export function parseObservations(raw: unknown): { ok: true; value: Observation[] } | { ok: false } {
  if (!Array.isArray(raw)) return { ok: false };
  const observations: Observation[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return { ok: false };
    const o = item as Record<string, unknown>;
    if (!VALID_SEVERITIES.has(o["severity"] as string)) return { ok: false };
    if (typeof o["file"] !== "string") return { ok: false };
    if (typeof o["title"] !== "string") return { ok: false };
    if (typeof o["rationale"] !== "string") return { ok: false };
    if ("line" in o && o["line"] !== undefined && o["line"] !== null && typeof o["line"] !== "number") return { ok: false };
    const observation: Observation = {
      severity: o["severity"] as Observation["severity"],
      file: o["file"] as string,
      title: o["title"] as string,
      rationale: o["rationale"] as string,
    };
    if (typeof o["line"] === "number") observation.line = o["line"] as number;
    observations.push(observation);
  }
  return { ok: true, value: observations };
}

/**
 * Typed outcome for judge steps: spec-review.
 *
 * approved: boolean — kept for backward compat; NOT used for verdict routing.
 * findings: structured findings array — used by CLI for verdict derivation.
 * observations: optional informational records — NOT used for verdict routing.
 */
export interface JudgeReportResult extends BaseReportResult {
  approved?: boolean;
  findings?: Finding[];
  observations?: Observation[];
}

/**
 * Typed outcome for code-review step (judge subtype with additional fields).
 *
 * fixableCount: number — kept for backward compat; NOT used for verdict routing.
 * findings: structured findings array — used by CLI for verdict derivation.
 * observations: inherited from JudgeReportResult — NOT used for verdict routing.
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
 * When ok=true, findings are REQUIRED and must be a valid findings array.
 * When ok=false, findings are not required (agent is declaring voluntary failure).
 * observations are always optional (best-effort silent-ignore on invalid input).
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

  // When ok=true, findings are required and must be valid (strict: decision-needed requires options)
  if (result.ok) {
    const parsed = parseFindings(obj["findings"], true);
    if (!parsed.ok) {
      return { ok: false, missingFields: ["findings"], rawInput: raw };
    }
    result.findings = parsed.value;
  }

  // observations: best-effort silent-ignore — absence or invalid input leaves field unset
  if ("observations" in obj) {
    const parsedObs = parseObservations(obj["observations"]);
    if (parsedObs.ok) {
      result.observations = parsedObs.value;
    }
    // invalid observations: silently ignored, NOT added to missingFields
  }

  return { ok: true, value: result };
}

/**
 * Parse CodeReviewReportResult from unknown tool input.
 * Builds on parseJudgeReportInput (includes base + approved + findings + observations) and optionally sets fixableCount.
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
 * verdict: "approve" | "needs-discussion" | "reject" — kept for compat; NOT used for routing.
 * findings: structured findings array — used by CLI for verdict derivation.
 * observations: optional informational records — NOT used for verdict routing.
 */
export interface RequestReviewReportResult extends BaseReportResult {
  verdict?: "approve" | "needs-discussion" | "reject";
  findings?: Finding[];
  observations?: Observation[];
}

/**
 * Typed outcome for conformance step.
 * Identity subtype of JudgeReportResult — no additional fields.
 * Separate type enables conformance-specific routing via CLI verdict derivation.
 * fixTarget values on individual findings are captured by parseFindings.
 */
export type ConformanceReportResult = JudgeReportResult;

/**
 * Parse ConformanceReportResult from unknown tool input.
 * Delegates to parseJudgeReportInput and casts result type to ConformanceReportResult.
 * fixTarget fields within findings are captured by the extended parseFindings.
 */
export function parseConformanceReportInput(
  raw: unknown,
): { ok: true; value: ConformanceReportResult } | { ok: false; missingFields: string[]; rawInput: unknown } {
  return parseJudgeReportInput(raw) as
    | { ok: true; value: ConformanceReportResult }
    | { ok: false; missingFields: string[]; rawInput: unknown };
}

/**
 * Parse RequestReviewReportResult from unknown tool input.
 * When ok=true, findings are REQUIRED and must be a valid findings array.
 * When ok=false, findings are not required.
 * observations are always optional (best-effort silent-ignore on invalid input).
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

  // When ok=true, findings are required and must be valid (strict: decision-needed requires options)
  if (result.ok) {
    const parsed = parseFindings(obj["findings"], true);
    if (!parsed.ok) {
      return { ok: false, missingFields: ["findings"], rawInput: raw };
    }
    result.findings = parsed.value;
  }

  // observations: best-effort silent-ignore — absence or invalid input leaves field unset
  if ("observations" in obj) {
    const parsedObs = parseObservations(obj["observations"]);
    if (parsedObs.ok) {
      result.observations = parsedObs.value;
    }
    // invalid observations: silently ignored, NOT added to missingFields
  }

  return { ok: true, value: result };
}
