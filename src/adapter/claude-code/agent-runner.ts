/**
 * ClaudeCodeRunner: AgentRunner adapter for Claude Code SDK (local runtime).
 *
 * Implements AgentRunner port using @anthropic-ai/claude-agent-sdk query().
 * No SessionClient or @anthropic-ai/sdk import — fully isolated from managed adapter.
 *
 * Design D8 (design.md): composition root injects ClaudeCodeRunner when runtime === "local".
 * Design D2: resultContent fetched from local fs via fs.readFile.
 * Design D5: verifyBranch / requiresCommit via git subprocess (not GitHub API).
 * Design D9: runtime-specific git instructions injected as additionalInstructions.
 *
 * TC-022: ClaudeCodeRunner implements AgentRunner interface
 * TC-023: query() receives ctx.cwd
 * TC-024: no SessionClient / @anthropic-ai/sdk import
 * TC-025: resultContent from fs.readFile (not GitHub API)
 * TC-026: additionalInstructions contains branch checkout instruction
 * TC-027: no register_branch import
 * TC-028: requiresCommit guard — branch not advanced → error
 * TC-029: branch does not exist → error (git only, no GitHub API)
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  query as sdkQuery,
  type SDKMessage,
  type SDKResultMessage,
  type SDKResultSuccess,
} from "@anthropic-ai/claude-agent-sdk";
import { gitExec, defaultSpawnFn, type SpawnFn } from "./git-exec.js";
import type { AgentRunner, AgentRunContext, AgentRunResult, ModelUsage } from "../../core/port/agent-runner.js";
import type { StepContext } from "../../core/types.js";
import { getStepExecutionConfig } from "../../config/step-config.js";

export type { SpawnFn } from "./git-exec.js";

export type QueryFn = (params: {
  prompt: string | AsyncIterable<unknown>;
  options?: Record<string, unknown>;
}) => AsyncGenerator<unknown, void>;

function buildAdditionalInstructions(ctx: AgentRunContext): string {
  const { branch, slug } = ctx;
  const lines: string[] = [];

  if (branch) {
    lines.push(
      `RUNTIME INSTRUCTIONS (local Claude Code mode):`,
      `- You are running locally in the repository worktree at: ${ctx.cwd}`,
      `- Work on branch: ${branch} (already created by the CLI — do not create it again)`,
      `- After completing the task, commit all changes and push: git push origin ${branch}`,
      `- Slug for this request: ${slug}`,
    );
  }

  if (ctx.projectContext) {
    lines.push("");
    lines.push("<project-context>");
    lines.push(ctx.projectContext);
    lines.push("</project-context>");
  }

  return lines.join("\n");
}

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

    let preRunHeadSha: string | null = null;
    if (step.requiresCommit && ctx.branch) {
      preRunHeadSha = await gitExec(this.spawnFn, cwd, ["rev-parse", ctx.branch]);
    }

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

    try {
      const messages = this.queryFn({
        prompt: fullPrompt,
        options: {
          cwd,
          allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
          permissionMode: "bypassPermissions",
          ...maxTurnsOption,
          model: resolvedConfig.model,
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
      }
    } catch (err) {
      const cause = err as Error;
      return {
        completionReason: "error",
        resultContent: null,
        error: Object.assign(
          new Error(`Claude Code SDK query failed: ${cause.message}`),
          { code: "CLAUDE_CODE_QUERY_FAILED", cause },
        ),
      };
    }

    // TC-028: requiresCommit guard — verify branch advanced (D5)
    if (step.requiresCommit && ctx.branch) {
      const branchExists = await gitExec(this.spawnFn, cwd, ["branch", "--list", ctx.branch]);
      if (!branchExists) {
        return {
          completionReason: "error",
          resultContent: null,
          error: Object.assign(
            new Error(`Branch '${ctx.branch}' does not exist after agent run.`),
            { code: "BRANCH_NOT_FOUND" },
          ),
        };
      }

      const postRunHeadSha = await gitExec(this.spawnFn, cwd, ["rev-parse", ctx.branch]);
      if (postRunHeadSha !== null && preRunHeadSha !== null && postRunHeadSha === preRunHeadSha) {
        return {
          completionReason: "error",
          resultContent: null,
          error: Object.assign(
            new Error(
              `branch HEAD did not advance: '${ctx.branch}' HEAD was unchanged before and after the agent run.`,
            ),
            { code: "NO_COMMIT_DETECTED" },
          ),
        };
      }
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
    };
  }
}

export function createClaudeCodeRunner(deps: ClaudeCodeRunnerDeps = {}): ClaudeCodeRunner {
  return new ClaudeCodeRunner(deps);
}
