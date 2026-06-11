/**
 * ClaudeCodeRunner: AgentRunner adapter for Claude Code SDK (local runtime).
 *
 * Implements AgentRunner port using @anthropic-ai/claude-agent-sdk query().
 * No SessionClient or @anthropic-ai/sdk import — fully isolated from managed adapter.
 *
 * Design D8 (design.md): composition root injects ClaudeCodeRunner when runtime === "local".
 * Design D2: resultContent fetched from local fs via fs.readFile.
 * Design D5: commit+push is handled by StepExecutor.commitAndPush() (not in adapter).
 * Design D9: runtime-specific git instructions injected as additionalInstructions.
 *
 * tool-driven-step-completion:
 * - report_result MCP tool registered via createSdkMcpServer when ctx.policy.reportTool is set
 * - follow-up retry when agent doesn't call report_result (up to policy.maxAttempts)
 * - tool detection applies only to main work turn, not postWorkPrompts turns
 *
 * TC-022: ClaudeCodeRunner implements AgentRunner interface
 * TC-023: query() receives ctx.cwd
 * TC-024: no SessionClient / @anthropic-ai/sdk import
 * TC-025: resultContent from fs.readFile (not GitHub API)
 * TC-026: additionalInstructions contains branch checkout instruction
 * TC-027: no register_branch import
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  query as sdkQuery,
  createSdkMcpServer,
  type SDKMessage,
  type SDKResultMessage,
  type SDKResultSuccess,
} from "@anthropic-ai/claude-agent-sdk";
import { defaultSpawnFn, type SpawnFn } from "./git-exec.js";
import { isToolUse } from "./message-types.js";
import type { AgentRunner, AgentRunContext, AgentRunResult, ModelUsage } from "../../core/port/agent-runner.js";
import type { DomainEvent } from "../../kernel/event-types.js";
import type { StepContext } from "../../core/port/step-context.js";
import { getStepExecutionConfig } from "../../config/step-config.js";
import { resolveTransientRetryConfig } from "../../config/schema.js";
import { buildAdditionalInstructions } from "../shared/prompt-builder.js";
import { shouldRunFollowUp, mergeFollowUpResult } from "../shared/follow-up.js";
import { logVerbose, stderrWrite } from "../../logger/stdout.js";
import { logPipelineDiag } from "../../logger/diagnostic.js";
import { SessionLogWriter } from "./session-log-writer.js";
import { stripSecrets } from "../../util/env-filter.js";
import type { BaseReportResult, ReportToolSpec } from "../../core/port/report-result.js";
import { DEFAULT_TOOL_RETRY } from "../../core/port/report-result.js";
import { retryWithBackoff } from "../../util/retry.js";
import { isTransientAgentError } from "./transient-error.js";

export type { SpawnFn } from "./git-exec.js";

/**
 * Best-effort extraction of a human-readable target string from a tool's input.
 * Returns undefined when no meaningful target can be inferred.
 */
function extractTarget(toolName: string, input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;
  switch (toolName) {
    case "Edit":
    case "Write":
    case "Read": {
      const fp = input["file_path"];
      return typeof fp === "string" ? fp : undefined;
    }
    case "Bash": {
      const cmd = input["command"];
      if (typeof cmd !== "string") return undefined;
      return cmd.length > 40 ? cmd.slice(0, 40) + "…" : cmd;
    }
    case "Grep": {
      const p = input["path"];
      if (typeof p === "string") return p;
      const pat = input["pattern"];
      return typeof pat === "string" ? pat : undefined;
    }
    case "Glob": {
      const pat = input["pattern"];
      return typeof pat === "string" ? pat : undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Emit a step:progress event when a tool_use content block starts in the stream.
 * Called for every message in both main and follow-up stream loops.
 * No-op when the message is not a tool_use event.
 */
function emitToolProgress(
  msg: SDKMessage,
  emitFn: (event: DomainEvent, payload: Record<string, unknown>) => void,
  stepName: string,
): void {
  if (!isToolUse(msg)) return;
  const cb = (msg as { type: string; event: { content_block: { name: string; input?: Record<string, unknown> } } }).event.content_block;
  const tool = cb.name;
  const target = extractTarget(tool, cb.input);
  const payload: Record<string, unknown> = { step: stepName, tool };
  if (target !== undefined) payload["target"] = target;
  emitFn("step:progress", payload);
}

export type QueryFn = (params: {
  prompt: string | AsyncIterable<unknown>;
  options?: Record<string, unknown>;
}) => AsyncGenerator<unknown, void>;

/** Default QueryFn backed by the Claude Agent SDK. Exported for injection into composition-root (local.ts). */
export const defaultQueryFn: QueryFn = sdkQuery as unknown as QueryFn;

export type CreateMcpServerFn = typeof createSdkMcpServer;

export interface ClaudeCodeRunnerDeps {
  cwd?: string;
  _spawnFn?: SpawnFn;
  _queryFn?: QueryFn;
  /** Injectable for testing: replaces createSdkMcpServer to capture tool handlers. */
  _createMcpServerFn?: CreateMcpServerFn;
  /** Injectable for testing: replaces setTimeout-based sleep in transient retry backoff. */
  _sleepFn?: (ms: number) => Promise<void>;
}

/**
 * TC-022: implements AgentRunner interface
 * TC-024: does not import SessionClient or @anthropic-ai/sdk
 */
export class ClaudeCodeRunner implements AgentRunner {
  private readonly defaultCwd: string;
  private readonly spawnFn: SpawnFn;
  private readonly queryFn: QueryFn;
  private readonly createMcpServerFn: CreateMcpServerFn;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(deps: ClaudeCodeRunnerDeps = {}) {
    this.defaultCwd = deps.cwd ?? process.cwd();
    this.spawnFn = deps._spawnFn ?? defaultSpawnFn;
    this.queryFn = deps._queryFn ?? (sdkQuery as unknown as QueryFn);
    this.createMcpServerFn = deps._createMcpServerFn ?? createSdkMcpServer;
    this.sleepFn = deps._sleepFn ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  }

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const cwd = ctx.cwd || this.defaultCwd;
    const step = ctx.step;
    const state = ctx.state;

    // TC-007: deps is StepContext — no client/githubClient needed
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

    // D3 (add-spec-review-baseline-check): call enrichContext before buildMessage.
    // Errors propagate — no catch here (StepExecutor handles error lifecycle).
    if (step.enrichContext) {
      const enriched = await step.enrichContext(stepCtx.dynamicContext!, cwd, ctx.slug);
      stepCtx = { ...stepCtx, dynamicContext: enriched };
    }

    const baseMessage = step.buildMessage(state, stepCtx);

    const additionalInstructions = buildAdditionalInstructions(ctx);
    const resumeSection = ctx.session.resumePrompt
      ? `\n\n<resume-context>\n${ctx.session.resumePrompt}\n</resume-context>`
      : "";
    const fullPrompt = additionalInstructions
      ? `${baseMessage}${resumeSection}\n\n${additionalInstructions}`
      : `${baseMessage}${resumeSection}`;

    // Resolve execution config: step-level > config defaults > step hardcoded > SDK default
    // D2/D3 (design.md): getStepExecutionConfig() resolves model, maxTurns, timeoutMs
    const dynamicMaxTurns = step.getMaxTurns?.(state);
    const resolvedConfig = getStepExecutionConfig(ctx.config, step.name, {
      model: step.agent.model,
      maxTurns: dynamicMaxTurns ?? step.maxTurns,
    }, ctx.requestType);

    // TC-006/TC-007: maxTurns: null → omit maxTurns from options (unlimited)
    // TC-012: step.maxTurns ?? 30 fallback is replaced by getStepExecutionConfig resolution chain
    const maxTurnsOption: Record<string, unknown> =
      resolvedConfig.maxTurns !== null ? { maxTurns: resolvedConfig.maxTurns } : {};

    // TC-023: invoke SDK query() with cwd, allowedTools, permissionMode, maxTurns
    let extractedModelUsage: Record<string, ModelUsage> | undefined;
    let extractedSessionId: string | undefined;

    // Set up wall-clock timeout via AbortController
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
      timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
    }

    // Build query options, adding resume if a previous session ID is available.
    const resumeOption: Record<string, unknown> =
      ctx.session.resumeSessionId ? { resume: ctx.session.resumeSessionId } : {};

    // Set up report_result MCP tool if reportTool is configured.
    // The tool result is captured via closure and accessed after the query loop.
    let capturedToolResult: BaseReportResult | null = null;
    let reportMcpServer: ReturnType<CreateMcpServerFn> | null = null;

    const reportTool: ReportToolSpec | undefined = ctx.policy?.reportTool;
    if (reportTool) {
      const toolSpec = reportTool;
      reportMcpServer = this.createMcpServerFn({
        name: "specrunner_report",
        tools: [
          {
            name: toolSpec.name,
            description: toolSpec.description,
            inputSchema: toolSpec.zodSchema,
            handler: async (args: unknown) => {
              const parseResult = toolSpec.parseInput(args);
              if (parseResult.ok) {
                capturedToolResult = parseResult.value;
              }
              return { content: [{ type: "text" as const, text: "ok" }] };
            },
          },
        ],
      });
    }

    const queryOptions: Record<string, unknown> = {
      cwd,
      allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
      disallowedTools: ["Agent", "Task"],
      permissionMode: "bypassPermissions",
      ...maxTurnsOption,
      model: resolvedConfig.model,
      abortController,
      env: stripSecrets(process.env as Record<string, string | undefined>),
      ...resumeOption,
      ...(reportMcpServer ? { mcpServers: { specrunner_report: reportMcpServer } } : {}),
    };

    const agentRedirectCounter = { count: 0 };

    // Open session log writer if sessionLogPath is configured (debug level)
    const sessionLogWriter = ctx.session.logPath ? new SessionLogWriter(ctx.session.logPath) : null;

    const runQuery = async (): Promise<{ lastResult: SDKResultMessage | null }> => {
      let lastResult: SDKResultMessage | null = null;
      logPipelineDiag("query:start", `step=${step.name}`);
      const messages = this.queryFn({ prompt: fullPrompt, options: queryOptions });
      for await (const message of messages as AsyncGenerator<SDKMessage, void>) {
        emitToolProgress(message, ctx.emit, step.name);
        // Write message to session log if enabled
        if (sessionLogWriter) {
          const msgAny = message as Record<string, unknown>;
          sessionLogWriter.write({
            type: msgAny["type"],
            subtype: msgAny["subtype"],
            event: msgAny["event"],
            content: msgAny["content"],
          });
        }
        if (isToolUse(message)) {
          const toolName = message.event.content_block.name;
          if (toolName === "Agent" || toolName === "Task") {
            agentRedirectCounter.count++;
            if (agentRedirectCounter.count > 3) {
              abortController.abort();
              break;
            }
          }
        }
        if (message.type === "result") {
          lastResult = message as SDKResultMessage;
        }
      }
      logPipelineDiag("query:complete", `step=${step.name}`);
      return { lastResult };
    };

    logVerbose("session", "query started", { stepName: step.name, runtime: "local", model: resolvedConfig.model });

    // Resolve transient retry config (T-04).
    const { maxRetries, baseDelayMs } = resolveTransientRetryConfig(ctx.config);
    // Tracks the number of transient retries actually taken in this run().
    let transientRetryAttempts = 0;
    // Tracks whether the resume→new-session fallback has already been attempted.
    let resumeFallbackDone = false;

    /**
     * If the query returned an error result whose text is a known transient
     * pattern, convert it to a throw so that retryWithBackoff can catch and
     * retry it.  Non-transient error results are returned unchanged.
     */
    const maybeThrowTransientResult = (
      r: { lastResult: SDKResultMessage | null },
    ): { lastResult: SDKResultMessage | null } => {
      const lr = r.lastResult;
      if (lr && lr.subtype !== "success") {
        const errors = (lr as SDKResultMessage & { errors?: string[] }).errors ?? [];
        const joinedText = errors.join(" ").trim();
        if (joinedText && isTransientAgentError(new Error(joinedText))) {
          throw Object.assign(
            new Error(`Claude Code SDK query failed: ${joinedText}`),
            { code: "CLAUDE_CODE_QUERY_FAILED_TRANSIENT" },
          );
        }
      }
      return r;
    };

    /**
     * Inner function wrapping the main work query turn plus the existing
     * resume→new-session fallback.  This is the unit retried on transient errors.
     */
    const runMainWorkTurn = async (): Promise<{ lastResult: SDKResultMessage | null }> => {
      try {
        return maybeThrowTransientResult(await runQuery());
      } catch (innerErr) {
        // Do not apply resume fallback when the abort controller has fired —
        // that path is handled by the outer catch as a timeout.
        if (abortController.signal.aborted) {
          throw innerErr;
        }
        // Transient error result throws should propagate directly to
        // retryWithBackoff — the resume fallback is for SDK-level throws only.
        const isTransientResult =
          (innerErr as { code?: string })?.code === "CLAUDE_CODE_QUERY_FAILED_TRANSIENT";
        // On the first failure, if we were attempting a session resume, fall
        // back to a fresh session.  Subsequent retries skip this branch since
        // the resume option has already been removed and `resumeFallbackDone`
        // is set to prevent the warning from repeating.
        if (!isTransientResult && ctx.session.resumeSessionId && !resumeFallbackDone) {
          resumeFallbackDone = true;
          stderrWrite(
            `[specrunner] warn: session resume failed for '${step.name}' (session: ${ctx.session.resumeSessionId}): ${(innerErr as Error).message}. Falling back to new session.`,
          );
          delete queryOptions["resume"];
          return maybeThrowTransientResult(await runQuery());
        }
        throw innerErr;
      }
    };

    try {
      let queryResult: { lastResult: SDKResultMessage | null };

      if (maxRetries === 0) {
        // Feature disabled — call runMainWorkTurn directly (no wrapper, no events).
        queryResult = await runMainWorkTurn();
      } else {
        // Feature enabled — wrap with retryWithBackoff.
        queryResult = await retryWithBackoff(runMainWorkTurn, {
          maxAttempts: maxRetries + 1,
          baseDelayMs,
          isTransientError: (err) =>
            !abortController.signal.aborted && isTransientAgentError(err),
          sleepFn: this.sleepFn,
          onRetry: (attempt) => {
            const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
            transientRetryAttempts = attempt;
            ctx.emit("step:retry", {
              step: step.name,
              attempt,
              maxRetries,
              delayMs,
            });
          },
        });
      }

      // If agent redirect limit exceeded, return error without proceeding.
      if (agentRedirectCounter.count > 3) {
        sessionLogWriter?.close();
        return {
          completionReason: "error",
          resultContent: null,
          toolResult: null,
          followUpAttempts: 0,
          ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
          error: Object.assign(
            new Error(`Step '${step.name}': Agent/Task tool redirect limit exceeded (max 3)`),
            { code: "AGENT_REDIRECT_LIMIT_EXCEEDED" },
          ),
        };
      }

      const { lastResult } = queryResult;

      if (lastResult && lastResult.subtype !== "success") {
        const errorResult = lastResult as SDKResultMessage & { errors?: string[] };
        sessionLogWriter?.close();
        return {
          completionReason: "error",
          resultContent: null,
          toolResult: null,
          followUpAttempts: 0,
          ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
          error: Object.assign(
            new Error(`Claude Code SDK query failed: ${errorResult.subtype}`),
            { code: "CLAUDE_CODE_QUERY_FAILED" },
          ),
        };
      }

      // Extract modelUsage from the success result for recording in step state
      if (lastResult && lastResult.subtype === "success") {
        const successResult = lastResult as SDKResultSuccess;
        const rawUsage = successResult.modelUsage;
        if (rawUsage && typeof rawUsage === "object" && Object.keys(rawUsage).length > 0) {
          const mappedUsage: Record<string, ModelUsage> = {};
          for (const [model, usage] of Object.entries(rawUsage)) {
            mappedUsage[model] = {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              cacheReadInputTokens: usage.cacheReadInputTokens,
              cacheCreationInputTokens: usage.cacheCreationInputTokens,
            };
          }
          extractedModelUsage = mappedUsage;
        }
        extractedSessionId = successResult.session_id;
      }

      // --- report_result follow-up retry (main work turn only) ---
      // If reportTool is configured and the agent didn't call it, retry up to maxAttempts.
      let followUpAttempts = 0;
      if (reportTool && capturedToolResult === null && extractedSessionId) {
        const retryPolicy = ctx.policy?.toolReportRetry ?? DEFAULT_TOOL_RETRY;
        for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
          const retryPrompt = retryPolicy.buildPrompt({ attempt, reason: "no-tool-call" });
          const retryOptions: Record<string, unknown> = {
            ...queryOptions,
            resume: extractedSessionId,
          };
          // Remove MCP server from retry options to avoid re-registering
          // (the closure is still active so tool calls will be captured)
          const retryMessages = this.queryFn({ prompt: retryPrompt, options: retryOptions });
          for await (const message of retryMessages as AsyncGenerator<SDKMessage, void>) {
            if (message.type === "result") {
              void (message as SDKResultMessage);
            }
          }
          followUpAttempts++;

          if (capturedToolResult !== null) break;

          // If this was the last attempt and tool still not called, we're done
          if (attempt === retryPolicy.maxAttempts) break;
        }
      }

      // postWorkPrompts turns (after main work and report_result detection)
      // tool calls in postWorkPrompts turns are intentionally NOT detected
      if (shouldRunFollowUp(ctx, "success") && extractedSessionId) {
        for (const followPrompt of ctx.policy.postWorkPrompts!) {
          const followUpOptions: Record<string, unknown> = {
            ...queryOptions,
            resume: extractedSessionId,
          };
          // Remove MCP server from postWork prompts — tool detection is main-work-turn only
          delete followUpOptions["mcpServers"];
          const followMessages = this.queryFn({ prompt: followPrompt, options: followUpOptions });
          let followLastResult: SDKResultMessage | null = null;
          for await (const message of followMessages as AsyncGenerator<SDKMessage, void>) {
            emitToolProgress(message, ctx.emit, step.name);
            if (message.type === "result") {
              followLastResult = message as SDKResultMessage;
            }
          }

          if (followLastResult && followLastResult.subtype !== "success") {
            const followErrorResult = followLastResult as SDKResultMessage & { errors?: string[] };
            return {
              completionReason: "error",
              resultContent: null,
              toolResult: capturedToolResult,
              followUpAttempts,
              ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
              error: Object.assign(
                new Error(`Claude Code SDK follow-up query failed: ${followErrorResult.subtype}`),
                { code: "CLAUDE_CODE_QUERY_FAILED" },
              ),
            };
          }

          if (followLastResult && followLastResult.subtype === "success") {
            const followSuccessResult = followLastResult as SDKResultSuccess;
            const rawUsage = followSuccessResult.modelUsage;
            if (rawUsage && typeof rawUsage === "object" && Object.keys(rawUsage).length > 0) {
              // resume は別 query invocation のため follow query の modelUsage は
              // その invocation 単体の usage (履歴 re-read を input に含む)。session 累積ではない。
              // 真の総コスト = 作業 query + 全 follow query の加算 (= per-model sum)。
              const summed: Record<string, ModelUsage> = { ...(extractedModelUsage ?? {}) };
              for (const [model, usage] of Object.entries(rawUsage)) {
                const prev = summed[model];
                summed[model] = {
                  inputTokens: (prev?.inputTokens ?? 0) + usage.inputTokens,
                  outputTokens: (prev?.outputTokens ?? 0) + usage.outputTokens,
                  cacheReadInputTokens: (prev?.cacheReadInputTokens ?? 0) + usage.cacheReadInputTokens,
                  cacheCreationInputTokens: (prev?.cacheCreationInputTokens ?? 0) + usage.cacheCreationInputTokens,
                };
              }
              extractedModelUsage = summed;
            }
            // Keep extractedSessionId from turn 1 (same session, sessionId should not change)
          }
        }
      }

      // Output verification follow-up loop (D3: step-completion-verification).
      // Runs after postWorkPrompts, only when outputVerification is configured.
      // session未確立時 (extractedSessionId === undefined) は skip。
      const outputVerif = ctx.policy?.outputVerification;
      if (outputVerif && extractedSessionId) {
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
          const repairOptions: Record<string, unknown> = {
            ...queryOptions,
            resume: extractedSessionId,
          };
          delete repairOptions["mcpServers"];
          try {
            const repairMessages = this.queryFn({ prompt: repairPrompt, options: repairOptions });
            for await (const message of repairMessages as AsyncGenerator<SDKMessage, void>) {
              emitToolProgress(message, ctx.emit, step.name);
              if (message.type === "result" && (message as SDKResultMessage).subtype === "success") {
                const su = (message as SDKResultSuccess);
                const rawUsage = su.modelUsage;
                if (rawUsage && typeof rawUsage === "object" && Object.keys(rawUsage).length > 0) {
                  const summed: Record<string, ModelUsage> = { ...(extractedModelUsage ?? {}) };
                  for (const [model, usage] of Object.entries(rawUsage)) {
                    const prev = summed[model];
                    summed[model] = {
                      inputTokens: (prev?.inputTokens ?? 0) + usage.inputTokens,
                      outputTokens: (prev?.outputTokens ?? 0) + usage.outputTokens,
                      cacheReadInputTokens: (prev?.cacheReadInputTokens ?? 0) + usage.cacheReadInputTokens,
                      cacheCreationInputTokens: (prev?.cacheCreationInputTokens ?? 0) + usage.cacheCreationInputTokens,
                    };
                  }
                  extractedModelUsage = summed;
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

      logVerbose("session", "query completed", { stepName: step.name, runtime: "local", sessionId: extractedSessionId });

      // Write session summary to session log (session ID, model, token usage)
      if (sessionLogWriter) {
        sessionLogWriter.writeSummary({
          sessionId: extractedSessionId,
          model: resolvedConfig.model,
          modelUsage: extractedModelUsage,
        });
        sessionLogWriter.close();
      }

      // TC-025: read result file from local fs (not GitHub API)
      const resultFilePath = step.resultFilePath(state, stepCtx);

      let resultContent: string | null = null;
      if (resultFilePath !== null) {
        const absolutePath = path.isAbsolute(resultFilePath)
          ? resultFilePath
          : path.join(cwd, resultFilePath);
        try {
          resultContent = await fs.readFile(absolutePath, "utf-8");
        } catch {
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
      }

      const baseResult: AgentRunResult = {
        completionReason: "success",
        resultContent: null,
        toolResult: capturedToolResult,
        followUpAttempts,
        ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
        modelUsage: extractedModelUsage,
        sessionId: extractedSessionId,
      };
      return mergeFollowUpResult(baseResult, resultContent);
    } catch (err) {
      if (abortController.signal.aborted && timeoutId !== undefined) {
        clearTimeout(timeoutId);
        logVerbose("session", "query timeout", { stepName: step.name, runtime: "local", timeoutMs: resolvedConfig.timeoutMs });
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
      logVerbose("session", "query error", { stepName: step.name, runtime: "local", error: cause.message });
      sessionLogWriter?.close();
      return {
        completionReason: "error",
        resultContent: null,
        toolResult: null,
        followUpAttempts: 0,
        ...(maxRetries > 0 ? { transientRetryAttempts } : {}),
        error: Object.assign(
          new Error(`Claude Code SDK query failed: ${cause.message}`),
          { code: "CLAUDE_CODE_QUERY_FAILED", cause },
        ),
      };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }
}

export function createClaudeCodeRunner(deps: ClaudeCodeRunnerDeps = {}): ClaudeCodeRunner {
  return new ClaudeCodeRunner(deps);
}
