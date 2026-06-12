/**
 * CodexAgentRunner: AgentRunner adapter for OpenAI Codex SDK (local runtime).
 *
 * Implements AgentRunner port using @openai/codex-sdk Codex class.
 * Mirrors ClaudeCodeRunner in structure; uses sandboxMode instead of allowedTools.
 *
 * D1 (design.md): prompt construction mirrors ClaudeCodeRunner.
 * D2 (design.md): sandboxMode "workspace-write" for all steps.
 * D3 (design.md): JSONL verbose log via SessionLogWriter when ctx.session.logPath is set.
 * D4 (design.md): step:progress events emitted on tool-item start.
 * D5 (design.md): transient-error auto-retry via retryWithBackoff (main + follow-up turns).
 * D6 (design.md): output-verification repair loop mirrors ClaudeCodeRunner.
 *
 * tool-driven-step-completion (codex-typed-outcome):
 * - ctx.policy.reportTool set → outputSchema injected into thread.runStreamed() for main work turn.
 * - finalResponse is parsed as JSON and validated via reportTool.parseInput().
 * - follow-up retry loop mirrors ClaudeCodeRunner (up to toolReportRetry.maxAttempts).
 * - postWorkPrompts turns do NOT receive outputSchema (tool detection is main-work-turn only).
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { object, toJSONSchema } from "zod/v4-mini";
import { Codex } from "@openai/codex-sdk";
import { buildAdditionalInstructions } from "../shared/prompt-builder.js";
import { shouldRunFollowUp, mergeFollowUpResult } from "../shared/follow-up.js";
import { SessionLogWriter } from "../shared/session-log-writer.js";
import { isTransientAgentError } from "../shared/transient-error.js";
import { retryWithBackoff } from "../../util/retry.js";
import { resolveTransientRetryConfig } from "../../config/schema.js";
import type { AgentRunner, AgentRunContext, AgentRunResult, ModelUsage } from "../../core/port/agent-runner.js";
import type { StepContext } from "../../core/port/step-context.js";
import { getStepExecutionConfig } from "../../config/step-config.js";
import { stderrWrite } from "../../logger/stdout.js";
import type { BaseReportResult, ReportToolSpec } from "../../core/port/report-result.js";
import { DEFAULT_TOOL_RETRY } from "../../core/port/report-result.js";
import { toOpenAIStrictSchema, stripNullDeep } from "./strict-schema.js";

// Minimal interface for the Codex SDK types used here (avoids deep SDK type dependency in tests)
interface Turn {
  finalResponse: string;
  items: ThreadItem[];
  usage: CodexUsage | null;
}

interface FileChangeEntry {
  path: string;
  kind: "add" | "delete" | "update";
}

interface FileChangeItem {
  type: "file_change";
  changes: FileChangeEntry[];
  status: "completed" | "failed";
  [key: string]: unknown;
}

interface ThreadItem {
  type: string;
  [key: string]: unknown;
}

interface CodexUsage {
  input_tokens: number;
  cached_input_tokens?: number;
  output_tokens: number;
  reasoning_output_tokens?: number;
}

// Minimal event shapes for runStreamed (mirrors SDK's ThreadEvent)
interface ItemStartedEvent {
  type: "item.started";
  item: ThreadItem;
}
interface ItemUpdatedEvent {
  type: "item.updated";
  item: ThreadItem;
}
interface ItemCompletedEvent {
  type: "item.completed";
  item: ThreadItem & { text?: string };
}
interface TurnCompletedEvent {
  type: "turn.completed";
  usage?: CodexUsage;
}
interface TurnFailedEvent {
  type: "turn.failed";
  error: { message: string };
}
interface FatalErrorEvent {
  type: "error";
  message: string;
}

type CodexThreadEvent =
  | ItemStartedEvent
  | ItemUpdatedEvent
  | ItemCompletedEvent
  | TurnCompletedEvent
  | TurnFailedEvent
  | FatalErrorEvent
  | { type: string; [key: string]: unknown };

// Injectable for testing
export interface CodexThread {
  /** Unique identifier for this thread (used for session continuity). null when not yet assigned. */
  id: string | null;
  runStreamed(
    prompt: string,
    opts?: { signal?: AbortSignal; outputSchema?: unknown },
  ): Promise<{ events: AsyncGenerator<CodexThreadEvent> }>;
}

export interface CodexInstance {
  startThread(opts: {
    workingDirectory: string;
    sandboxMode: "read-only" | "workspace-write" | "danger-full-access";
    model?: string;
    skipGitRepoCheck?: boolean;
  }): CodexThread;
  /**
   * Resume an existing thread by ID.
   * The thread is loaded from ~/.codex/sessions/ and a new turn is appended.
   */
  resumeThread(threadId: string): CodexThread;
}

export interface CodexAgentRunnerDeps {
  /** Injectable factory for testing. Defaults to `() => new Codex()`. */
  _codexFactory?: () => CodexInstance;
  /** Injectable sleep function for deterministic retry tests. Defaults to setTimeout-based. */
  _sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Build a JSON Schema object from a ReportToolSpec for use as outputSchema in runStreamed().
 * Uses the same zod/v4-mini toJSONSchema transformation as toCustomToolSpec() in report-tool.ts.
 */
function buildOutputSchema(reportTool: ReportToolSpec): object {
  return toOpenAIStrictSchema(toJSONSchema(object(reportTool.zodSchema)) as object);
}

/**
 * Try to parse finalResponse as JSON and validate it against the reportTool.parseInput().
 * Returns the parsed result on success, null on any failure (JSON parse error or validation failure).
 */
function tryParseToolResult(finalResponse: string, reportTool: ReportToolSpec): BaseReportResult | null {
  try {
    const json: unknown = JSON.parse(finalResponse);
    const normalized = stripNullDeep(json);
    const parseResult = reportTool.parseInput(normalized);
    return parseResult.ok ? parseResult.value : null;
  } catch {
    return null;
  }
}

/**
 * Map a started ThreadItem to a progress payload for step:progress events.
 * Returns null for items that don't have a meaningful progress representation.
 */
export function extractCodexProgress(item: ThreadItem): { tool: string; target?: string } | null {
  switch (item.type) {
    case "command_execution": {
      const cmd = item["command"];
      if (typeof cmd !== "string") return { tool: "Bash" };
      return { tool: "Bash", target: cmd.length > 40 ? cmd.slice(0, 40) + "…" : cmd };
    }
    case "file_change": {
      const changes = item["changes"];
      if (!Array.isArray(changes) || changes.length === 0) return { tool: "Edit" };
      const firstPath = (changes[0] as { path?: string })?.path;
      return { tool: "Edit", ...(typeof firstPath === "string" ? { target: firstPath } : {}) };
    }
    case "mcp_tool_call": {
      const toolName = item["tool_name"] ?? item["tool"];
      const server = item["server"];
      return {
        tool: typeof toolName === "string" ? toolName : "mcp_tool_call",
        ...(typeof server === "string" ? { target: server } : {}),
      };
    }
    case "web_search": {
      const query = item["query"];
      return { tool: "WebSearch", ...(typeof query === "string" ? { target: query } : {}) };
    }
    default:
      return null;
  }
}

export class CodexAgentRunner implements AgentRunner {
  private readonly codexFactory: () => CodexInstance;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(deps: CodexAgentRunnerDeps = {}) {
    this.codexFactory = deps._codexFactory ?? (() => new Codex() as unknown as CodexInstance);
    this.sleepFn = deps._sleepFn ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  }

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const cwd = ctx.cwd;
    const step = ctx.step;
    const state = ctx.state;

    let stepCtx: StepContext = {
      config: ctx.config,
      slug: ctx.slug,
      cwd,
      request: {
        type: "feature",
        title: "",
        slug: ctx.slug,
        baseBranch: ctx.input.requestBaseBranch ?? "main",
        content: ctx.input.requestContent,
        adr: ctx.input.requestAdr ?? false,
      },
      dynamicContext: ctx.input.dynamicContext,
    };

    // D3 pattern: call enrichContext before buildMessage (same as ClaudeCodeRunner)
    if (step.enrichContext) {
      const enriched = await step.enrichContext(stepCtx.dynamicContext!, cwd, ctx.slug);
      stepCtx = { ...stepCtx, dynamicContext: enriched };
    }

    const baseMessage = step.buildMessage(state, stepCtx);
    const additionalInstructions = buildAdditionalInstructions(ctx);
    const fullPrompt = additionalInstructions
      ? `${baseMessage}\n\n${additionalInstructions}`
      : baseMessage;

    const dynamicMaxTurns = step.getMaxTurns?.(state);
    const resolvedConfig = getStepExecutionConfig(ctx.config, step.name, {
      model: step.agent.model,
      maxTurns: dynamicMaxTurns ?? step.maxTurns,
    }, ctx.requestType);

    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
      timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
    }

    // Build outputSchema if reportTool is configured
    const reportTool: ReportToolSpec | undefined = ctx.policy?.reportTool;
    const outputSchema: object | undefined = reportTool ? buildOutputSchema(reportTool) : undefined;

    // Resolve transient retry config
    const { maxRetries, baseDelayMs } = resolveTransientRetryConfig(ctx.config);
    let transientRetryAttempts = 0;
    let resumeFallbackDone = false;

    // Open session log writer if logPath is set
    const sessionLogWriter = ctx.session.logPath ? new SessionLogWriter(ctx.session.logPath) : null;

    let turn!: Turn;
    let threadId: string | null = null;
    let activeThread!: CodexThread;
    let modelUsage: Record<string, ModelUsage> | undefined;

    /**
     * Consume a runStreamed event stream and reconstruct a Turn.
     * Emits step:progress on item.started for tool items.
     * Writes every event to the session log writer when active.
     * Throws on turn.failed or fatal error events.
     */
    const executeTurn = async (
      thread: CodexThread,
      prompt: string,
      opts: { signal?: AbortSignal; outputSchema?: unknown },
      logWriter: SessionLogWriter | null,
    ): Promise<Turn> => {
      const { events } = await thread.runStreamed(prompt, opts);
      const items: (ThreadItem & { text?: string })[] = [];
      let finalResponse = "";
      let usage: CodexUsage | null = null;

      for await (const ev of events) {
        // Write every event to JSONL log
        if (logWriter !== null) {
          const entry: Record<string, unknown> = { type: ev.type };
          if ("item" in ev && ev.item !== undefined) entry["item"] = ev.item;
          if ("usage" in ev && ev.usage !== undefined) entry["usage"] = ev.usage;
          if ("error" in ev && ev.error !== undefined) entry["error"] = ev.error;
          if ("message" in ev && ev.message !== undefined) entry["message"] = ev.message;
          logWriter.write(entry);
        }

        if (ev.type === "item.started") {
          const startedEv = ev as ItemStartedEvent;
          const p = extractCodexProgress(startedEv.item);
          if (p !== null) {
            ctx.emit("step:progress", {
              step: step.name,
              tool: p.tool,
              ...(p.target !== undefined ? { target: p.target } : {}),
            });
          }
        } else if (ev.type === "item.completed") {
          const completedEv = ev as ItemCompletedEvent;
          items.push(completedEv.item);
          if (completedEv.item.type === "agent_message" && typeof completedEv.item.text === "string") {
            finalResponse = completedEv.item.text;
          }
        } else if (ev.type === "turn.completed") {
          const completedEv = ev as TurnCompletedEvent;
          if (completedEv.usage) {
            usage = completedEv.usage;
          }
        } else if (ev.type === "turn.failed") {
          const failedEv = ev as TurnFailedEvent;
          throw new Error(failedEv.error.message);
        } else if (ev.type === "error") {
          const errorEv = ev as FatalErrorEvent;
          throw new Error(errorEv.message);
        }
      }

      return { items, finalResponse, usage };
    };

    /**
     * Wrap a follow-up executeTurn call in retryWithBackoff with the same
     * maxRetries/baseDelayMs and onRetry as the main turn.
     */
    const runFollowUpTurnWithRetry = (
      thread: CodexThread,
      prompt: string,
      opts: { signal?: AbortSignal; outputSchema?: unknown },
    ): Promise<Turn> => {
      const inner = () => executeTurn(thread, prompt, opts, sessionLogWriter);
      if (maxRetries === 0) return inner();
      return retryWithBackoff(inner, {
        maxAttempts: maxRetries + 1,
        baseDelayMs,
        isTransientError: (err) => !abortController.signal.aborted && isTransientAgentError(err),
        sleepFn: this.sleepFn,
        onRetry: (attempt) => {
          transientRetryAttempts++;
          ctx.emit("step:retry", {
            step: step.name,
            attempt,
            maxRetries,
            delayMs: baseDelayMs * Math.pow(2, attempt - 1),
          });
        },
      });
    };

    /**
     * Accumulate turn usage onto a running total.
     * Returns the new accumulated usage or just the new turn's usage if no previous.
     */
    const accumulateUsage = (
      prev: CodexUsage | null,
      next: CodexUsage | null,
    ): CodexUsage | null => {
      if (!next) return prev;
      if (!prev) return next;
      return {
        input_tokens: prev.input_tokens + next.input_tokens,
        output_tokens: prev.output_tokens + next.output_tokens,
        cached_input_tokens: (prev.cached_input_tokens ?? 0) + (next.cached_input_tokens ?? 0),
      };
    };

    try {
      const codex = this.codexFactory();

      const startFreshThread = (): CodexThread => codex.startThread({
        workingDirectory: cwd,
        sandboxMode: "workspace-write",
        model: resolvedConfig.model,
        skipGitRepoCheck: true,
      });

      /**
       * Main work turn: handles resume→fresh-thread fallback.
       * This is the unit retried on transient errors (D2).
       */
      const runMainWorkTurn = async (): Promise<Turn> => {
        let thread: CodexThread;
        if (ctx.session.resumeSessionId) {
          try {
            thread = codex.resumeThread(ctx.session.resumeSessionId);
          } catch (resumeErr) {
            stderrWrite(
              `[specrunner] warn: codex session resume failed for '${step.name}' (thread: ${ctx.session.resumeSessionId}): ${(resumeErr as Error).message}. Falling back to new thread.`,
            );
            thread = startFreshThread();
          }
        } else {
          thread = startFreshThread();
        }

        try {
          const mainTurn = await executeTurn(
            thread,
            fullPrompt,
            { signal: abortController.signal, ...(outputSchema ? { outputSchema } : {}) },
            sessionLogWriter,
          );
          activeThread = thread;
          threadId = thread.id;
          return mainTurn;
        } catch (runErr) {
          // If resume was used and the turn failed, retry with a fresh thread (once).
          if (ctx.session.resumeSessionId && !resumeFallbackDone && !abortController.signal.aborted) {
            resumeFallbackDone = true;
            stderrWrite(
              `[specrunner] warn: codex thread failed for '${step.name}' after resume (thread: ${ctx.session.resumeSessionId}): ${(runErr as Error).message}. Falling back to new thread.`,
            );
            const freshThread = startFreshThread();
            const freshTurn = await executeTurn(
              freshThread,
              fullPrompt,
              { signal: abortController.signal, ...(outputSchema ? { outputSchema } : {}) },
              sessionLogWriter,
            );
            activeThread = freshThread;
            threadId = freshThread.id;
            return freshTurn;
          }
          throw runErr;
        }
      };

      if (maxRetries === 0) {
        turn = await runMainWorkTurn();
      } else {
        turn = await retryWithBackoff(runMainWorkTurn, {
          maxAttempts: maxRetries + 1,
          baseDelayMs,
          isTransientError: (err) => !abortController.signal.aborted && isTransientAgentError(err),
          sleepFn: this.sleepFn,
          onRetry: (attempt) => {
            transientRetryAttempts++;
            ctx.emit("step:retry", {
              step: step.name,
              attempt,
              maxRetries,
              delayMs: baseDelayMs * Math.pow(2, attempt - 1),
            });
          },
        });
      }

      // T-04: Parse finalResponse to extract typed toolResult
      let capturedToolResult: BaseReportResult | null = null;
      if (reportTool) {
        capturedToolResult = tryParseToolResult(turn.finalResponse, reportTool);
      }

      // T-05: follow-up retry loop when capturedToolResult is still null
      let followUpAttempts = 0;
      if (capturedToolResult === null && reportTool) {
        const retryPolicy = ctx.policy?.toolReportRetry ?? DEFAULT_TOOL_RETRY;
        for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
          const retryPrompt =
            "前の応答を出力スキーマに一致する JSON として取得できませんでした。" +
            "説明文や追加テキストを付けず、スキーマに一致する JSON のみで返してください。" +
            ` (attempt ${attempt}/${retryPolicy.maxAttempts})`;
          const retryTurn = await runFollowUpTurnWithRetry(
            activeThread,
            retryPrompt,
            { signal: abortController.signal, outputSchema },
          );
          followUpAttempts++;

          // Accumulate usage
          turn = { ...retryTurn, usage: accumulateUsage(turn.usage, retryTurn.usage) };

          capturedToolResult = tryParseToolResult(retryTurn.finalResponse, reportTool);
          if (capturedToolResult !== null) break;
        }
      }

      // T-06: Follow-up turns (postWorkPrompts loop): run on same thread — no outputSchema
      if (shouldRunFollowUp(ctx, "success")) {
        for (const followPrompt of ctx.policy.postWorkPrompts!) {
          const followTurn = await runFollowUpTurnWithRetry(
            activeThread,
            followPrompt,
            { signal: abortController.signal },
          );
          turn = { ...followTurn, usage: accumulateUsage(turn.usage, followTurn.usage) };
        }
      }

      // Log file changes (informational)
      const fileChanges = turn.items.filter((i): i is FileChangeItem => i.type === "file_change");
      if (fileChanges.length > 0) {
        const paths = fileChanges.flatMap((fc) => fc.changes.map((c) => c.path));
        stderrWrite(`[codex] file changes: ${paths.join(", ")}`);
      }

      // Map Codex usage → ModelUsage
      if (turn.usage) {
        const u = turn.usage;
        const usage: ModelUsage = {
          inputTokens: u.input_tokens,
          outputTokens: u.output_tokens,
          cacheReadInputTokens: u.cached_input_tokens ?? 0,
          cacheCreationInputTokens: 0,
        };
        modelUsage = { [resolvedConfig.model]: usage };
      }

      // D6: Output verification repair loop (mirrors ClaudeCodeRunner)
      const outputVerif = ctx.policy?.outputVerification;
      if (outputVerif && threadId) {
        for (let attempt = 1; attempt <= outputVerif.maxAttempts; attempt++) {
          let checkResult: import("../../core/port/output-contract.js").OutputCheckResult;
          try {
            checkResult = await outputVerif.detect();
          } catch {
            // best-effort: detection failure → skip remaining attempts
            break;
          }
          const followUpViolations = checkResult.violations.filter((v) => v.policy === "follow-up");
          if (followUpViolations.length === 0) break;

          const repairPrompt = outputVerif.buildPrompt(followUpViolations, attempt);
          try {
            const repairTurn = await runFollowUpTurnWithRetry(
              activeThread,
              repairPrompt,
              { signal: abortController.signal },
            );
            // Accumulate usage from repair turn
            const repairUsage = accumulateUsage(turn.usage, repairTurn.usage);
            if (repairUsage && turn.usage !== repairUsage) {
              turn = { ...turn, usage: repairUsage };
              // Update modelUsage
              if (repairTurn.usage) {
                const u = repairTurn.usage;
                const prev = modelUsage?.[resolvedConfig.model];
                if (prev) {
                  modelUsage = {
                    [resolvedConfig.model]: {
                      inputTokens: prev.inputTokens + u.input_tokens,
                      outputTokens: prev.outputTokens + u.output_tokens,
                      cacheReadInputTokens: (prev.cacheReadInputTokens ?? 0) + (u.cached_input_tokens ?? 0),
                      cacheCreationInputTokens: prev.cacheCreationInputTokens ?? 0,
                    },
                  };
                }
              }
            }
          } catch {
            // best-effort: repair turn failure → preserve work turn result
            stderrWrite(
              `[specrunner] warn: output verification repair turn ${attempt} failed for '${step.name}'. Continuing.\n`,
            );
          }
          followUpAttempts++;
        }
      }

      // Write session summary to session log (session ID, model, token usage)
      sessionLogWriter?.writeSummary({
        sessionId: threadId ?? undefined,
        model: resolvedConfig.model,
        modelUsage,
      });
      sessionLogWriter?.close();

      // Read result file from local fs (same as ClaudeCodeRunner)
      const resultFilePath = step.resultFilePath(state, stepCtx);
      let resultContent: string | null = null;
      if (resultFilePath !== null) {
        const absolutePath = path.isAbsolute(resultFilePath)
          ? resultFilePath
          : path.join(cwd, resultFilePath);
        try {
          resultContent = await fs.readFile(absolutePath, "utf-8");
        } catch {
          sessionLogWriter?.close(); // already closed above, but idempotent
          return {
            completionReason: "error",
            resultContent: null,
            toolResult: capturedToolResult,
            followUpAttempts,
            ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
            error: Object.assign(
              new Error(`result file not found: ${resultFilePath}`),
              { code: "RESULT_FILE_NOT_FOUND" },
            ),
          };
        }
      } else {
        resultContent = turn.finalResponse;
      }

      const baseResult: AgentRunResult = {
        completionReason: "success",
        resultContent: null,
        toolResult: capturedToolResult,
        followUpAttempts,
        modelUsage,
        sessionId: threadId ?? undefined,
        ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
      };
      return mergeFollowUpResult(baseResult, resultContent);
    } catch (err) {
      if (abortController.signal.aborted && timeoutId !== undefined) {
        clearTimeout(timeoutId);
        sessionLogWriter?.writeSummary({ sessionId: threadId ?? undefined, model: resolvedConfig.model, modelUsage });
        sessionLogWriter?.close();
        return {
          completionReason: "timeout",
          resultContent: null,
          toolResult: null,
          followUpAttempts: 0,
          ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
          error: Object.assign(
            new Error(`Step '${step.name}' timed out after ${resolvedConfig.timeoutMs}ms`),
            { code: "STEP_TIMEOUT" },
          ),
        };
      }
      const cause = err as Error;
      sessionLogWriter?.writeSummary({ sessionId: threadId ?? undefined, model: resolvedConfig.model, modelUsage });
      sessionLogWriter?.close();
      return {
        completionReason: "error",
        resultContent: null,
        toolResult: null,
        followUpAttempts: 0,
        ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
        error: Object.assign(
          new Error(cause.message),
          { code: "CODEX_SDK_ERROR", cause },
        ),
      };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }
}
