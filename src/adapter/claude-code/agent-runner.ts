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
} from "@anthropic-ai/claude-agent-sdk";
import { gitExec, defaultSpawnFn, type SpawnFn } from "./git-exec.js";
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../core/port/agent-runner.js";
import type { StepContext } from "../../core/types.js";

export type { SpawnFn } from "./git-exec.js";

export type QueryFn = (params: {
  prompt: string;
  options?: Record<string, unknown>;
}) => AsyncGenerator<SDKMessage, void>;

function buildAdditionalInstructions(ctx: AgentRunContext): string {
  const { branch, slug, step } = ctx;
  const lines: string[] = [];

  if (branch) {
    lines.push(
      `RUNTIME INSTRUCTIONS (local Claude Code mode):`,
      `- You are running locally in the repository worktree at: ${ctx.cwd}`,
      `- Work on branch: ${branch}`,
      `- If the branch does not exist yet, create it: git checkout -b ${branch}`,
      `- After completing the task, commit all changes and push: git push origin ${branch}`,
      `- Slug for this request: ${slug}`,
    );
  }

  if (step.agent.role === "propose") {
    lines.push(
      `- For the propose step: create the branch ${branch}, make the initial commit with the openspec change folder, and push.`,
      `- Do NOT call register_branch — the branch name is already known (${branch}).`,
    );
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
    const stepCtx: StepContext = {
      config: ctx.config,
      slug: ctx.slug,
      cwd,
      request: {
        type: "feature",
        title: "",
        slug: ctx.slug,
        content: ctx.requestContent,
        enabled: [],
      },
      repo: { owner: "", name: "" },
    };
    const baseMessage = step.buildMessage(state, stepCtx);

    const additionalInstructions = buildAdditionalInstructions(ctx);
    const fullPrompt = additionalInstructions
      ? `${baseMessage}\n\n${additionalInstructions}`
      : baseMessage;

    let preRunHeadSha: string | null = null;
    if (step.requiresCommit && ctx.branch) {
      preRunHeadSha = await gitExec(this.spawnFn, cwd, ["rev-parse", ctx.branch]);
    }

    // TC-023: invoke SDK query() with cwd, allowedTools, permissionMode, maxTurns
    try {
      const messages = this.queryFn({
        prompt: fullPrompt,
        options: {
          cwd,
          allowedTools: ["Read", "Edit", "Write", "Bash", "Grep", "Glob"],
          permissionMode: "bypassPermissions",
          maxTurns: step.maxTurns ?? 30,
          model: step.agent.model,
        },
      });

      let lastResult: SDKResultMessage | null = null;
      for await (const message of messages) {
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
    };
  }
}

export function createClaudeCodeRunner(deps: ClaudeCodeRunnerDeps = {}): ClaudeCodeRunner {
  return new ClaudeCodeRunner(deps);
}
