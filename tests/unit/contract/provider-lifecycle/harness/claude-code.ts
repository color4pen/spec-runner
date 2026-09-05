/**
 * Claude Code provider harness.
 *
 * Translates a LifecycleScenario into a ClaudeCodeRunner backed entirely by
 * injected dependencies — no real SDK loader (loadClaudeAgentSdk) is invoked.
 *
 * Turn translation:
 *   complete-with-report             → call report handler, yield success result
 *   complete-with-report+stall       → call report handler, stall until mainQueryAbort
 *   complete-without-report          → yield success result (handler never called)
 *   complete-with-unparseable-report → yield success result (handler never called)
 *   fail-transient                   → throw new Error("ECONNREFUSED ...")
 *   fail-non-transient               → throw new Error("fatal non-transient error")
 *   fail-context-exhaustion          → yield error result with "Prompt is too long" OR throw
 *   stall-until-abort                → optionally emit a tool_use content_block_start, then wait for abortController
 *
 * Invocation count: increments on every _queryFn call (main + retry + repair + postWork).
 */
import { ClaudeCodeRunner } from "../../../../../src/adapter/claude-code/agent-runner.js";
import type { QueryFn, CreateMcpServerFn } from "../../../../../src/adapter/claude-code/agent-runner.js";
import type { AgentRunContext, AgentRunResult } from "../../../../../src/core/port/agent-runner.js";
import type { ProviderHarness, HarnessBuildOpts, HarnessBuildResult } from "./types.js";
import type { LifecycleScenario, TurnBehavior, UsageHints } from "../scenario.js";
import { buildScenarioConfig, buildScenarioPolicy } from "./_scenario-helpers.js";

// ---------------------------------------------------------------------------
// SDK message shape helpers
// ---------------------------------------------------------------------------

/** Build a minimal SDK success result message. */
function makeSuccessResult(
  hints?: UsageHints,
  fallbackModel = "claude-sonnet-4-6",
): Record<string, unknown> {
  const model = hints?.modelName ?? fallbackModel;
  const sessionId = hints?.sessionId ?? "test-session-claude";
  const result: Record<string, unknown> = {
    type: "result",
    subtype: "success",
    result: "",
    session_id: sessionId,
    is_error: false,
    stop_reason: "end_turn",
    permission_denials: [],
    uuid: "test-uuid-claude",
  };
  if (hints?.numTurns !== undefined) result["num_turns"] = hints.numTurns;
  if (hints?.durationMs !== undefined) result["duration_ms"] = hints.durationMs;
  if (hints?.durationApiMs !== undefined) result["duration_api_ms"] = hints.durationApiMs;
  if (hints?.totalCostUsd !== undefined) result["total_cost_usd"] = hints.totalCostUsd;
  if (
    hints?.inputTokens !== undefined ||
    hints?.outputTokens !== undefined ||
    hints?.cacheReadInputTokens !== undefined ||
    hints?.contextWindowTokens !== undefined
  ) {
    const modelEntry: Record<string, unknown> = {
      inputTokens: hints?.inputTokens ?? 100,
      outputTokens: hints?.outputTokens ?? 50,
      cacheReadInputTokens: hints?.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: 0,
    };
    if (hints?.contextWindowTokens !== undefined) {
      // contextObserver.observeResult() reads modelUsage[model].contextWindow
      modelEntry["contextWindow"] = hints.contextWindowTokens;
    }
    result["modelUsage"] = { [model]: modelEntry };
  }
  return result;
}

/** Build an exhaustion error result message. */
function makeExhaustionResult(): Record<string, unknown> {
  return {
    type: "result",
    subtype: "error_during_execution",
    is_error: true,
    stop_reason: null,
    errors: ["Prompt is too long for this model's context window"],
    session_id: "sess-exhaust",
    modelUsage: {},
    permission_denials: [],
    uuid: "test-uuid-exhaust",
  };
}

// ---------------------------------------------------------------------------
// Harness query function builder
// ---------------------------------------------------------------------------

/**
 * Build a QueryFn that replays the scenario turns on each call.
 * The N-th call uses turns[N-1] if available, otherwise repeats turns[last].
 * getInvocationCount() counts all calls.
 */
function buildQueryFn(
  scenario: LifecycleScenario,
  getReportHandler: () => ((args: unknown) => Promise<unknown>) | null,
): { queryFn: QueryFn; getInvocationCount: () => number } {
  let callCount = 0;

  const queryFn: QueryFn = async function* claudeContractQuery(
    params: { prompt: string; options?: Record<string, unknown> },
  ) {
    const idx = callCount;
    callCount++;

    const turns = scenario.turns;
    const turn: TurnBehavior = idx < turns.length ? turns[idx]! : turns[turns.length - 1]!;

    switch (turn.type) {
      case "complete-with-report": {
        const handler = getReportHandler();
        if (handler) {
          await handler({ ok: turn.payload?.ok ?? true });
        }
        if (turn.stallAfterReport) {
          // Wait for mainQueryAbort (grace timer) to fire — do NOT yield success.
          // The grace settle path in ClaudeCodeRunner will produce success via outer catch
          // (abortController.signal.aborted && capturedToolResult !== null) or via
          // the runQuery grace-exit path (settledByReport && !shared.aborted).
          const abortCtrl = (params.options?.["abortController"] as AbortController | undefined);
          await new Promise<void>((_, reject) => {
            if (abortCtrl?.signal.aborted) {
              reject(new Error("AbortError"));
              return;
            }
            abortCtrl?.signal.addEventListener(
              "abort",
              () => reject(new Error("AbortError")),
              { once: true },
            );
          });
          // Never yields
          return;
        }
        yield makeSuccessResult(turn.metrics) as unknown;
        return;
      }

      case "complete-without-report": {
        // Handler intentionally NOT called — agent skipped the report tool.
        yield makeSuccessResult(turn.metrics) as unknown;
        return;
      }

      case "complete-with-unparseable-report": {
        // Handler NOT called; yield success so the runner sees a completed turn.
        // No JSON structure that could be mistaken for a valid report.
        yield makeSuccessResult(turn.metrics) as unknown;
        return;
      }

      case "fail-transient": {
        // ECONNREFUSED is on the TRANSIENT_TOKENS list in transient-error.ts
        throw new Error("ECONNREFUSED connection refused by server");
      }

      case "fail-non-transient": {
        // A message that does NOT match any TRANSIENT_TOKENS
        throw new Error("fatal non-transient error — unknown failure");
      }

      case "fail-context-exhaustion": {
        if (turn.throwVariant) {
          // Throw path: error with exhaustion message in cause chain.
          throw new Error("Prompt is too long for this model's context window");
        }
        // Result path: emit error result with exhaustion text in errors[].
        yield makeExhaustionResult() as unknown;
        return;
      }

      case "stall-until-abort": {
        if (turn.toolName) {
          // Emit a real tool_use content_block_start stream event (the shape isToolUse()
          // in message-types.ts recognizes) so the runner emits step:progress and records
          // last-tool context via tracker.onToolStart(). No tool_result follows, so the
          // tracker reports the tool as in-flight in tracker.timeoutHint().
          yield {
            type: "stream_event",
            event: {
              type: "content_block_start",
              content_block: {
                type: "tool_use",
                name: turn.toolName,
                id: "toolu_stall",
                input: turn.toolTarget !== undefined ? { command: turn.toolTarget } : {},
              },
            },
          } as unknown;
        }
        // Stall until abortController fires (inactivity watchdog or step timeout).
        const abortCtrl = (params.options?.["abortController"] as AbortController | undefined);
        await new Promise<void>((_, reject) => {
          if (abortCtrl?.signal.aborted) {
            reject(new Error("AbortError"));
            return;
          }
          abortCtrl?.signal.addEventListener(
            "abort",
            () => reject(new Error("AbortError")),
            { once: true },
          );
        });
        // Never yields
        return;
      }

      default: {
        // Unreachable — TypeScript exhaustiveness
        yield makeSuccessResult() as unknown;
        return;
      }
    }
  } as QueryFn;

  return { queryFn, getInvocationCount: () => callCount };
}

// ---------------------------------------------------------------------------
// Claude harness implementation
// ---------------------------------------------------------------------------

export const claudeCodeHarness: ProviderHarness = {
  id: "claude-code",

  build(scenario: LifecycleScenario, opts: HarnessBuildOpts): HarnessBuildResult {
    // Capture the MCP tool handler registered by ClaudeCodeRunner.
    let capturedHandler: ((args: unknown) => Promise<unknown>) | null = null;
    const createMcpServerFn: CreateMcpServerFn = (
      params: Record<string, unknown>,
    ) => {
      const tools = params["tools"] as
        | Array<{ handler: (args: unknown) => Promise<unknown> }>
        | undefined;
      if (tools?.[0]) {
        capturedHandler = tools[0].handler;
      }
      return {};
    };

    const { queryFn, getInvocationCount } = buildQueryFn(
      scenario,
      () => capturedHandler,
    );

    // Build config from scenario
    const config = buildScenarioConfig(scenario);

    // Build policy from scenario
    const policy = buildScenarioPolicy(scenario);

    const runner = new ClaudeCodeRunner({
      cwd: opts.tempDir,
      _queryFn: queryFn,
      _createMcpServerFn: createMcpServerFn,
      _sleepFn: opts.sleepFn,
    });

    // Wrap runner.run() to inject config and policy from the scenario,
    // and wire the emit function.
    const wrappedRunner = {
      run: async (ctx: AgentRunContext): Promise<AgentRunResult> => {
        const mergedCtx: AgentRunContext = {
          ...ctx,
          config: { ...ctx.config, ...config },
          policy: { ...ctx.policy, ...policy },
          emit: opts.emit as AgentRunContext["emit"],
        };
        return runner.run(mergedCtx);
      },
    };

    return { runner: wrappedRunner, getInvocationCount };
  },
};
