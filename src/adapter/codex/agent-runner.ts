/**
 * CodexAgentRunner: AgentRunner adapter for OpenAI Codex SDK (local runtime).
 *
 * Implements AgentRunner port using @openai/codex-sdk Codex class.
 * Mirrors ClaudeCodeRunner in structure; uses sandboxMode instead of allowedTools.
 *
 * D1 (design.md): prompt construction mirrors ClaudeCodeRunner.
 * D2 (design.md): sandboxMode "workspace-write" for all steps.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Codex } from "@openai/codex-sdk";
import { buildAdditionalInstructions } from "../shared/prompt-builder.js";
import type { AgentRunner, AgentRunContext, AgentRunResult, ModelUsage } from "../../core/port/agent-runner.js";
import type { StepContext } from "../../core/types.js";
import { getStepExecutionConfig } from "../../config/step-config.js";

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

// Injectable for testing
export interface CodexThread {
  /** Unique identifier for this thread (used for session continuity). */
  id: string;
  run(prompt: string, opts?: { signal?: AbortSignal }): Promise<Turn>;
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
}

export class CodexAgentRunner implements AgentRunner {
  private readonly codexFactory: () => CodexInstance;

  constructor(deps: CodexAgentRunnerDeps = {}) {
    this.codexFactory = deps._codexFactory ?? (() => new Codex() as unknown as CodexInstance);
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
        baseBranch: "main",
        content: ctx.requestContent,
        enabled: [],
      },
      dynamicContext: ctx.dynamicContext,
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
    });

    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (resolvedConfig.timeoutMs !== null && resolvedConfig.timeoutMs > 0) {
      timeoutId = setTimeout(() => abortController.abort(), resolvedConfig.timeoutMs);
    }

    let turn: Turn;
    let threadId: string;
    try {
      const codex = this.codexFactory();

      const startFreshThread = (): CodexThread => codex.startThread({
        workingDirectory: cwd,
        sandboxMode: "workspace-write",
        model: resolvedConfig.model,
        skipGitRepoCheck: true,
      });

      let thread: CodexThread;
      if (ctx.resumeSessionId) {
        try {
          thread = codex.resumeThread(ctx.resumeSessionId);
        } catch (resumeErr) {
          process.stderr.write(
            `[specrunner] warn: codex session resume failed for '${step.name}' (thread: ${ctx.resumeSessionId}): ${(resumeErr as Error).message}. Falling back to new thread.\n`,
          );
          thread = startFreshThread();
        }
      } else {
        thread = startFreshThread();
      }

      try {
        turn = await thread.run(fullPrompt, { signal: abortController.signal });
        threadId = thread.id;
      } catch (runErr) {
        // If resume was used and thread.run() failed, retry with a fresh thread.
        if (ctx.resumeSessionId && !abortController.signal.aborted) {
          process.stderr.write(
            `[specrunner] warn: codex thread.run() failed for '${step.name}' after resume (thread: ${ctx.resumeSessionId}): ${(runErr as Error).message}. Falling back to new thread.\n`,
          );
          const freshThread = startFreshThread();
          turn = await freshThread.run(fullPrompt, { signal: abortController.signal });
          threadId = freshThread.id;
        } else {
          throw runErr;
        }
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
          new Error(cause.message),
          { code: "CODEX_SDK_ERROR", cause },
        ),
      };
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }

    // Log file changes (informational)
    const fileChanges = turn.items.filter((i): i is FileChangeItem => i.type === "file_change");
    if (fileChanges.length > 0) {
      const paths = fileChanges.flatMap((fc) => fc.changes.map((c) => c.path));
      process.stderr.write(`[codex] file changes: ${paths.join(", ")}\n`);
    }

    // Read result file from local fs (same as ClaudeCodeRunner — D1)
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
    } else {
      resultContent = turn.finalResponse;
    }

    // Map Codex usage → ModelUsage
    // cached_input_tokens → cacheReadInputTokens; cacheCreationInputTokens has no Codex equivalent → 0
    let modelUsage: Record<string, ModelUsage> | undefined;
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

    return {
      completionReason: "success",
      resultContent,
      modelUsage,
      sessionId: threadId!,
    };
  }
}
