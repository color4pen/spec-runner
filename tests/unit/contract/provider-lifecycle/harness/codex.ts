/**
 * Codex provider harness.
 *
 * Translates a LifecycleScenario into a CodexAgentRunner backed entirely by
 * an injected _codexFactory — no real SDK loader (loadCodexSdk) is invoked.
 *
 * Turn translation:
 *   complete-with-report             → item.completed (agent_message JSON), turn.completed
 *   complete-without-report          → item.completed (empty text), turn.completed
 *   complete-with-unparseable-report → item.completed (non-JSON text), turn.completed
 *     NOTE: for Codex, complete-without-report and complete-with-unparseable-report follow
 *     the same extraction-failure path (finalResponse is not valid JSON). The distinction
 *     is semantic (whether the agent intended to report), but Codex cannot distinguish
 *     the two: both produce toolResult=null and possibly completionReportDiagnostics.
 *   fail-transient    → turn.failed with "ECONNREFUSED" message
 *   fail-non-transient→ turn.failed with "fatal non-transient error"
 *   fail-context-exhaustion → turn.failed with "Prompt is too long..." message
 *   stall-until-abort → item.started (optional), then block on opts.signal abort
 *
 * stallAfterReport (complete-with-report):
 *   Ignored for Codex. The Codex turn model has no mid-stream report reception;
 *   the agent writes the JSON response at turn completion. The "report received
 *   while streaming, then abort fires" state cannot occur in Codex.
 *
 * Invocation count: increments on every CodexThread.runStreamed() call.
 */
import { CodexAgentRunner } from "../../../../../src/adapter/codex/agent-runner.js";
import type { CodexThread, CodexInstance } from "../../../../../src/adapter/codex/agent-runner.js";
import type { AgentRunContext, AgentRunResult } from "../../../../../src/core/port/agent-runner.js";
import type { ProviderHarness, HarnessBuildOpts, HarnessBuildResult } from "./types.js";
import type { LifecycleScenario, TurnBehavior, UsageHints } from "../scenario.js";
import { buildScenarioConfig, buildScenarioPolicy } from "./_scenario-helpers.js";

// ---------------------------------------------------------------------------
// Codex event shape helpers
// ---------------------------------------------------------------------------

/** Build a turn.completed usage object from hints. */
function makeUsage(hints?: UsageHints): Record<string, unknown> | undefined {
  if (
    hints?.inputTokens === undefined &&
    hints?.outputTokens === undefined &&
    hints?.cacheReadInputTokens === undefined
  ) {
    return undefined;
  }
  return {
    input_tokens: hints?.inputTokens ?? 100,
    cached_input_tokens: hints?.cacheReadInputTokens ?? 0,
    output_tokens: hints?.outputTokens ?? 50,
  };
}

// ---------------------------------------------------------------------------
// Codex thread builder
// ---------------------------------------------------------------------------

/**
 * Build a CodexThread whose runStreamed() replays scenario turns.
 * The N-th call uses turns[N-1], repeating the last turn when exhausted.
 */
function buildCodexThread(
  scenario: LifecycleScenario,
): { thread: CodexThread; getInvocationCount: () => number } {
  let callCount = 0;

  // CodexThreadEvent is not exported from agent-runner.ts, so we cast the stub object
  // through `unknown` rather than importing the type or trying to match the exact shape.
  const thread = {
    id: "mock-codex-thread",
    runStreamed: async (
      _prompt: string,
      opts?: { signal?: AbortSignal; outputSchema?: unknown },
    ) => {
      const idx = callCount;
      callCount++;

      const turns = scenario.turns;
      const turn: TurnBehavior =
        idx < turns.length ? turns[idx]! : turns[turns.length - 1]!;

      // Throw-based failures: throw immediately so retryWithBackoff can retry them.
      if (turn.type === "fail-transient") {
        throw new Error("ECONNREFUSED connection refused by server");
      }
      if (turn.type === "fail-non-transient") {
        throw new Error("fatal non-transient error — unknown failure");
      }
      if (turn.type === "fail-context-exhaustion" && turn.throwVariant) {
        throw new Error("Prompt is too long for this model's context window");
      }

      // Event-stream failures: return an async generator that emits turn.failed.
      if (turn.type === "fail-context-exhaustion") {
        async function* failContextStream() {
          yield {
            type: "turn.failed",
            error: { message: "Prompt is too long for this model's context window" },
          };
        }
        return { events: failContextStream() };
      }

      if (turn.type === "stall-until-abort") {
        const signal = opts?.signal;
        // Destructure at the narrowing point to preserve types through the async closure.
        const { toolName, toolTarget } = turn;

        async function* stallStream() {
          if (toolName) {
            // item.started for a command_execution item: extractCodexProgress() maps it to
            // tool "Bash" with the command as target, and the runner records it via
            // tracker.onToolStart(). No item.completed follows → in-flight at timeout.
            yield {
              type: "item.started",
              item: { type: "command_execution", id: "item_stall", command: toolTarget ?? toolName },
            };
          }
          // Block until abort fires.
          await new Promise<void>((_, reject) => {
            if (signal?.aborted) {
              reject(signal.reason ?? new Error("AbortError"));
              return;
            }
            signal?.addEventListener(
              "abort",
              () => reject(signal.reason ?? new Error("AbortError")),
              { once: true },
            );
          });
          // Never yields further
        }
        return { events: stallStream() };
      }

      // Normal completion turns.
      const isReport = turn.type === "complete-with-report";
      // stallAfterReport is ignored for Codex (see module doc comment).

      const reportJson =
        isReport
          ? JSON.stringify({ ok: (turn as { payload?: { ok: boolean } }).payload?.ok ?? true })
          : null;

      const finalText =
        isReport
          ? reportJson!
          : turn.type === "complete-with-unparseable-report"
            ? "Task completed. No JSON here — this is plain prose."
            : "";

      const usageHints = (turn as { metrics?: UsageHints }).metrics;
      const usage = makeUsage(usageHints);

      async function* normalStream() {
        yield {
          type: "item.completed",
          item: { type: "agent_message", text: finalText },
        };
        const completedEvent: Record<string, unknown> = { type: "turn.completed" };
        if (usage !== undefined) completedEvent["usage"] = usage;
        yield completedEvent;
      }

      return { events: normalStream() };
    },
  } as unknown as CodexThread;

  return { thread, getInvocationCount: () => callCount };
}

// ---------------------------------------------------------------------------
// Codex harness implementation
// ---------------------------------------------------------------------------

export const codexHarness: ProviderHarness = {
  id: "codex",

  build(scenario: LifecycleScenario, opts: HarnessBuildOpts): HarnessBuildResult {
    const { thread, getInvocationCount } = buildCodexThread(scenario);

    const codexInstance: CodexInstance = {
      startThread: (_startOpts) => thread,
      resumeThread: (_threadId) => thread,
    };

    const config = buildScenarioConfig(scenario);
    const policy = buildScenarioPolicy(scenario);

    const runner = new CodexAgentRunner({
      _codexFactory: () => codexInstance,
      _sleepFn: opts.sleepFn,
    });

    // Wrap runner.run() to inject config, policy, and emit from the scenario.
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
