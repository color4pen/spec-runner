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
  type SDKMessage,
  type SDKResultMessage,
  type SDKResultSuccess,
} from "@anthropic-ai/claude-agent-sdk";
import { defaultSpawnFn, type SpawnFn } from "./git-exec.js";
import { isToolUse } from "./message-types.js";
import type { AgentRunner, AgentRunContext, AgentRunResult, ModelUsage } from "../../core/port/agent-runner.js";
import type { StepContext } from "../../core/types.js";
import { getStepExecutionConfig } from "../../config/step-config.js";
import { buildAdditionalInstructions } from "../shared/prompt-builder.js";
import { shouldRunFollowUp, mergeFollowUpResult } from "../shared/follow-up.js";
import { logVerbose } from "../../logger/stdout.js";

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
  emitFn: (event: string, payload: Record<string, unknown>) => void,
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

export interface ClaudeCodeRunnerDeps {
  cwd?: string;
  _spawnFn?: SpawnFn;
  _queryFn?: QueryFn;
}

/**
 * TC-022: implements AgentRunner interface
 * TC-024: does not import SessionClient or @anthropic-ai/sdk
 */
export class ClaudeCodeRunner implements AgentRunner {
  private readonly defaultCwd: string;
  private readonly spawnFn: SpawnFn;
  private readonly queryFn: QueryFn;

  constructor(deps: ClaudeCodeRunnerDeps = {}) {
    this.defaultCwd = deps.cwd ?? process.cwd();
    this.spawnFn = deps._spawnFn ?? defaultSpawnFn;
    this.queryFn = deps._queryFn ?? (sdkQuery as unknown as QueryFn);
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
        baseBranch: "main",
        content: ctx.requestContent,
        adr: ctx.requestAdr ?? false,
      },
      dynamicContext: ctx.dynamicContext,
    };

    // D3 (add-spec-review-baseline-check): call enrichContext before buildMessage.
    // Errors propagate — no catch here (StepExecutor handles error lifecycle).
    if (step.enrichContext) {
      const enriched = await step.enrichContext(stepCtx.dynamicContext!, cwd, ctx.slug);
      stepCtx = { ...stepCtx, dynamicContext: enriched };
    }

    const baseMessage = step.buildMessage(state, stepCtx);

    const additionalInstructions = buildAdditionalInstructions(ctx);
    const fullPrompt = additionalInstructions
      ? `${baseMessage}\n\n${additionalInstructions}`
      : baseMessage;

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
      ctx.resumeSessionId ? { resume: ctx.resumeSessionId } : {};

    const queryOptions: Record<string, unknown> = {
      cwd,
      allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
      permissionMode: "bypassPermissions",
      ...maxTurnsOption,
      model: resolvedConfig.model,
      abortController,
      ...resumeOption,
    };

    const runQuery = async (): Promise<{ lastResult: SDKResultMessage | null; aborted: boolean }> => {
      let lastResult: SDKResultMessage | null = null;
      let aborted = false;
      const messages = this.queryFn({ prompt: fullPrompt, options: queryOptions });
      for await (const message of messages as AsyncGenerator<SDKMessage, void>) {
        emitToolProgress(message, ctx.emit, step.name);
        if (message.type === "result") {
          lastResult = message as SDKResultMessage;
        }
      }
      return { lastResult, aborted };
    };

    logVerbose("session", "query started", { stepName: step.name, runtime: "local", model: resolvedConfig.model });

    try {
      let queryResult: { lastResult: SDKResultMessage | null; aborted: boolean };
      try {
        queryResult = await runQuery();
      } catch (innerErr) {
        // Check for timeout first — do not fallback on timeout.
        if (abortController.signal.aborted && timeoutId !== undefined) {
          throw innerErr;
        }
        // If we were attempting a session resume, try falling back to a new session.
        if (ctx.resumeSessionId) {
          process.stderr.write(
            `[specrunner] warn: session resume failed for '${step.name}' (session: ${ctx.resumeSessionId}): ${(innerErr as Error).message}. Falling back to new session.\n`,
          );
          delete queryOptions["resume"];
          queryResult = await runQuery();
        } else {
          throw innerErr;
        }
      }

      const { lastResult } = queryResult;

      if (lastResult && lastResult.subtype !== "success") {
        const errorResult = lastResult as SDKResultMessage & { errors?: string[] };
        return {
          completionReason: "error",
          resultContent: null,
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

      // Follow-up turns (if configured and work turn succeeded) — N-stage loop
      if (shouldRunFollowUp(ctx, "success") && extractedSessionId) {
        for (const followPrompt of ctx.followUpPrompts!) {
          const followUpOptions: Record<string, unknown> = {
            ...queryOptions,
            resume: extractedSessionId,
          };
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

      logVerbose("session", "query completed", { stepName: step.name, runtime: "local", sessionId: extractedSessionId });
    } catch (err) {
      if (abortController.signal.aborted && timeoutId !== undefined) {
        clearTimeout(timeoutId);
        logVerbose("session", "query timeout", { stepName: step.name, runtime: "local", timeoutMs: resolvedConfig.timeoutMs });
        return {
          completionReason: "timeout",
          resultContent: null,
          error: Object.assign(
            new Error(`Step '${step.name}' timed out after ${resolvedConfig.timeoutMs}ms`),
            { code: "STEP_TIMEOUT" },
          ),
        };
      }
      const cause = err as Error;
      logVerbose("session", "query error", { stepName: step.name, runtime: "local", error: cause.message });
      return {
        completionReason: "error",
        resultContent: null,
        error: Object.assign(
          new Error(`Claude Code SDK query failed: ${cause.message}`),
          { code: "CLAUDE_CODE_QUERY_FAILED", cause },
        ),
      };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
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
      modelUsage: extractedModelUsage,
      sessionId: extractedSessionId,
    };
    return mergeFollowUpResult(baseResult, resultContent);
  }
}

export function createClaudeCodeRunner(deps: ClaudeCodeRunnerDeps = {}): ClaudeCodeRunner {
  return new ClaudeCodeRunner(deps);
}
