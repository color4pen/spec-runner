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
import type { AgentRunner, AgentRunContext, AgentRunResult, ModelUsage } from "../../core/port/agent-runner.js";
import type { StepContext } from "../../core/types.js";
import { getStepExecutionConfig } from "../../config/step-config.js";
import { buildAdditionalInstructions } from "../shared/prompt-builder.js";

export type { SpawnFn } from "./git-exec.js";

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
        enabled: [],
      },
      repo: { owner: "", name: "" },
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
    });

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

    try {
      const messages = this.queryFn({
        prompt: fullPrompt,
        options: {
          cwd,
          allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
          permissionMode: "bypassPermissions",
          ...maxTurnsOption,
          model: resolvedConfig.model,
          abortController,
        },
      });

      let lastResult: SDKResultMessage | null = null;
      for await (const message of messages as AsyncGenerator<SDKMessage, void>) {
        if (message.type === "result") {
          lastResult = message as SDKResultMessage;
        }
      }

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
    } catch (err) {
      if (abortController.signal.aborted && timeoutId !== undefined) {
        clearTimeout(timeoutId);
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

    return {
      completionReason: "success",
      resultContent,
      modelUsage: extractedModelUsage,
      sessionId: extractedSessionId,
    };
  }
}

export function createClaudeCodeRunner(deps: ClaudeCodeRunnerDeps = {}): ClaudeCodeRunner {
  return new ClaudeCodeRunner(deps);
}
