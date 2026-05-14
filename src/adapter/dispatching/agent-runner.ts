/**
 * DispatchingAgentRunner: routes step execution to ClaudeCodeRunner or CodexAgentRunner
 * based on model-to-provider resolution.
 *
 * D4 (design.md): ClaudeCodeRunner is eager; CodexAgentRunner is lazy (first OpenAI step).
 * RuntimeStrategy.createAgentRunner() signature is unchanged — this class is a drop-in.
 */
import type { AgentRunner, AgentRunContext, AgentRunResult } from "../../core/port/agent-runner.js";
import type { ClaudeCodeRunner } from "../claude-code/agent-runner.js";
import { CodexAgentRunner } from "../codex/agent-runner.js";
import { getStepExecutionConfig } from "../../config/step-config.js";
import { mergeModelRegistry, resolveProvider } from "../../config/model-registry.js";

export class DispatchingAgentRunner implements AgentRunner {
  private readonly claudeRunner: ClaudeCodeRunner;
  private codexRunner: CodexAgentRunner | null = null;

  constructor(claudeRunner: ClaudeCodeRunner) {
    this.claudeRunner = claudeRunner;
  }

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const dynamicMaxTurns = ctx.step.getMaxTurns?.(ctx.state);
    const resolvedConfig = getStepExecutionConfig(ctx.config, ctx.step.name, {
      model: ctx.step.agent.model,
      maxTurns: dynamicMaxTurns ?? ctx.step.maxTurns,
    });

    const merged = mergeModelRegistry(ctx.config);
    const provider = resolveProvider(resolvedConfig.model, merged);

    if (provider === "openai") {
      if (!this.codexRunner) {
        const apiKey = process.env["OPENAI_API_KEY"];
        if (!apiKey) {
          throw Object.assign(
            new Error("OPENAI_API_KEY environment variable is required for OpenAI model steps"),
            { code: "MISSING_OPENAI_API_KEY" },
          );
        }
        this.codexRunner = new CodexAgentRunner({ apiKey });
      }
      return this.codexRunner.run(ctx);
    }

    // Default: anthropic
    return this.claudeRunner.run(ctx);
  }
}
