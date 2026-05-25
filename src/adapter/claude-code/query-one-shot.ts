/**
 * One-shot query wrapper for pipeline-step-independent commands.
 *
 * Provides a thin abstraction over Claude Agent SDK query() for use cases like
 * request-review, request-create generator, and watch risk assessment —
 * none of which require the full AgentRunContext of pipeline steps.
 *
 * Design: queryOneShot is orthogonal to AgentRunner (pipeline step lifecycle).
 * - AgentRunner: step / state / branch / slug / emit — pipeline step context
 * - queryOneShot: systemPrompt / prompt / config — one-shot command context
 */
import {
  query as sdkQuery,
  type SDKMessage,
  type SDKResultMessage,
  type SDKResultSuccess,
} from "@anthropic-ai/claude-agent-sdk";
import { getStepExecutionConfig } from "../../config/step-config.js";
import { SpecRunnerError } from "../../errors.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { ModelUsage } from "../../core/port/model-usage.js";

// ---------------------------------------------------------------------------
// QueryFn type (local definition — avoids circular dependency with agent-runner.ts)
// ---------------------------------------------------------------------------

export type QueryFn = (params: {
  prompt: string | AsyncIterable<unknown>;
  options?: Record<string, unknown>;
}) => AsyncGenerator<unknown, void>;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface QueryOneShotOptions {
  /** System prompt passed to the model (MUST). */
  systemPrompt: string;
  /** User message / initial prompt (MUST). */
  prompt: string;
  /** Allowed tools list. Default: ["Read", "Bash", "Grep", "Glob"]. */
  allowedTools?: string[];
  /** Maximum number of turns. Optional — feeds into config chain stepDefaults. */
  maxTurns?: number;
  /** Timeout in milliseconds. Optional — feeds into config chain stepDefaults. */
  timeoutMs?: number;
  /** Working directory. Default: process.cwd(). */
  cwd?: string;
  /**
   * Config resolution key (step name). Default: "one-shot".
   * Set to the command name (e.g. "request-review") to pick up step-level config overrides.
   */
  stepName?: string;
  /** Model identifier. Default: "claude-sonnet-4-5". Feeds into config chain stepDefaults. */
  model?: string;
}

export interface QueryOneShotResult {
  /** Final assistant text response (raw — structured parse is caller's responsibility). */
  text: string;
  /** SDK session_id from the success result (managed runtime). undefined for local runtime. */
  sessionId?: string;
  /** Reserved for future use — currently always undefined. */
  turnCount?: number;
  /** Completion reason from SDKResultMessage.subtype (e.g. "success", "max_turns"). */
  stopReason?: string;
  /** Per-model token usage from the agent run. undefined if not available. */
  modelUsage?: Record<string, ModelUsage>;
}

// ---------------------------------------------------------------------------
// queryOneShot
// ---------------------------------------------------------------------------

/**
 * Execute a one-shot query via Claude Agent SDK.
 *
 * Encapsulates:
 * - Config resolution (model / maxTurns / timeoutMs via getStepExecutionConfig)
 * - AbortController construction + timeout wiring
 * - for-await loop over SDK messages
 * - Completion judgment + result assembly
 *
 * @param opts     Query options (systemPrompt + prompt are required)
 * @param config   SpecRunnerConfig for config resolution
 * @param queryFn  Injectable query function (default: SDK query). Used for testing.
 */
export async function queryOneShot(
  opts: QueryOneShotOptions,
  config: SpecRunnerConfig,
  queryFn?: QueryFn,
): Promise<QueryOneShotResult> {
  const fn = queryFn ?? (sdkQuery as unknown as QueryFn);

  // Step 1: Resolve execution config via 4-level chain
  const resolvedConfig = getStepExecutionConfig(config, opts.stepName ?? "one-shot", {
    model: opts.model ?? "claude-sonnet-4-5",
    maxTurns: opts.maxTurns,
    timeoutMs: opts.timeoutMs,
  });

  // Step 2: maxTurns option — omit when null (unlimited)
  const maxTurnsOption: Record<string, unknown> =
    resolvedConfig.maxTurns !== null ? { maxTurns: resolvedConfig.maxTurns } : {};

  // Step 3: AbortController + timeout
  const abortController = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
    timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
  }

  // Step 4: Execute query and capture last result message
  let lastResult: SDKResultMessage | null = null;
  try {
    const messages = fn({
      prompt: opts.prompt,
      options: {
        cwd: opts.cwd ?? process.cwd(),
        allowedTools: opts.allowedTools ?? ["Read", "Bash", "Grep", "Glob"],
        permissionMode: "bypassPermissions",
        ...maxTurnsOption,
        model: resolvedConfig.model,
        systemPrompt: opts.systemPrompt,
        abortController,
      },
    });

    for await (const message of messages as AsyncGenerator<SDKMessage, void>) {
      if (message.type === "result") {
        lastResult = message as SDKResultMessage;
      }
    }
  } catch (err) {
    // Timeout: abortController was fired by our setTimeout
    if (abortController.signal.aborted && timeoutId !== undefined) {
      throw new SpecRunnerError(
        "QUERY_ONE_SHOT_TIMEOUT",
        "Increase timeoutMs in config or investigate the query for excessive tool use.",
        `queryOneShot timed out after ${resolvedConfig.timeoutMs}ms`,
      );
    }
    throw err;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  // Step 5: Check completion status
  if (!lastResult || lastResult.subtype !== "success") {
    const subtype = lastResult?.subtype ?? "no-result";
    throw new SpecRunnerError(
      "QUERY_ONE_SHOT_FAILED",
      "Check the session logs for more information.",
      `queryOneShot failed (${subtype})`,
    );
  }

  // Step 6: Assemble result (raw text — structured parse is caller's responsibility)
  const successResult = lastResult as SDKResultSuccess;

  // Extract modelUsage (same pattern as ClaudeCodeRunner)
  let modelUsage: Record<string, ModelUsage> | undefined;
  const rawUsage = (successResult as Record<string, unknown>).modelUsage;
  if (rawUsage && typeof rawUsage === "object" && Object.keys(rawUsage as object).length > 0) {
    modelUsage = {};
    for (const [model, usage] of Object.entries(rawUsage as Record<string, Record<string, number>>)) {
      modelUsage[model] = {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cacheReadInputTokens: usage.cacheReadInputTokens ?? 0,
        cacheCreationInputTokens: usage.cacheCreationInputTokens ?? 0,
      };
    }
  }

  return {
    text: successResult.result,
    sessionId: successResult.session_id,
    stopReason: lastResult.subtype,
    modelUsage,
  };
}
