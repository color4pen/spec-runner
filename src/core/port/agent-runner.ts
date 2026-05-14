/**
 * Port interface for executing an agent step.
 *
 * Design D1 (design.md): Single run() method — the adapter performs
 * the complete agent lifecycle internally and returns a resolved result.
 * StepExecutor only calls runner.run(ctx) and processes the returned result.
 *
 * Adapters:
 *  - ManagedAgentRunner (src/adapter/managed-agent/agent-runner.ts)
 *  - ClaudeCodeRunner   (src/adapter/claude-code/agent-runner.ts)
 */
import type { AgentStep } from "../step/types.js";
import type { JobState } from "../../state/schema.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { DynamicContext } from "../../git/dynamic-context.js";

import type { ModelUsage } from "./model-usage.js";
export type { ModelUsage } from "./model-usage.js";

/**
 * Context passed to AgentRunner.run() for each agent step execution.
 * All fields are runtime-neutral — no SDK-specific types are included.
 *
 * TC-002: fields are step, state, branch, slug, cwd, requestContent, config, emit, projectContext only.
 */
export interface AgentRunContext {
  /** The step declaration (agent definition, buildMessage, resultFilePath, etc.) */
  step: AgentStep;
  /** Current job state (branch, session, history, etc.) */
  state: JobState;
  /** CLI-canonical branch name (e.g. "feat/<slug>"). This is the source of truth.
   * Adapters use ctx.branch — not state.branch — as the canonical branch. */
  branch: string;
  /** Canonical slug for this request */
  slug: string;
  /** Working directory (worktree path) */
  cwd: string;
  /** Content of the request file (request.md / pipeline-context.md) */
  requestContent: string;
  /** Full pipeline config including runtime-specific settings */
  config: SpecRunnerConfig;
  /** Emit a domain event payload back to StepExecutor.
   * Called by adapter for intermediate state updates (e.g. step progress). */
  emit: (event: string, payload: Record<string, unknown>) => void;
  /** Dynamic repository context collected at pipeline start. Optional for backward compat. */
  dynamicContext?: DynamicContext;
  /** Project-level context from specrunner/project.md. undefined when file does not exist. */
  projectContext?: string;
  /**
   * 前回の fixer session ID。存在する場合 adapter は既存 session を継続する。未指定時は新規 session を作成する。
   * fixer ステップ（spec-fixer / build-fixer / code-fixer）専用。
   * StepExecutor が state.steps から前回の sessionId を取得して設定する。
   */
  resumeSessionId?: string;
}

/**
 * Result returned by AgentRunner.run() after executing an agent step.
 *
 * TC-003: resultContent is fetched by the adapter via adapter-specific means.
 */
export interface AgentRunResult {
  /** Outcome of the agent execution */
  completionReason: "success" | "error" | "timeout";
  /**
   * Content of the result file read by the adapter.
   * - managed: fetched from GitHub via GitHubClient.getRawFile()
   * - local:   fetched from local fs via fs.readFile()
   * null when resultFilePath is null or file could not be read.
   */
  resultContent: string | null;
  /** Session ID from the agent runtime (undefined when not available) */
  sessionId?: string;
  /** Agent-reported branch (managed: from register_branch tool; local: from git) */
  agentBranch?: string;
  /** Error details when completionReason !== "success" */
  error?: Error & { code?: string; hint?: string };
  /**
   * Per-model token usage from the agent run.
   * Keys are model names (e.g. "claude-opus-4-6").
   * Only populated by ClaudeCodeRunner (SDK provides this); ManagedAgentRunner leaves it undefined.
   */
  modelUsage?: Record<string, ModelUsage>;
}

/**
 * AgentRunner port: executes the full lifecycle of an agent step.
 *
 * Implementations must handle:
 * - Session creation / communication
 * - Polling or streaming until completion
 * - Branch and path verification
 * - Result file fetching
 * - register_branch tool injection (managed only)
 *
 * TC-001: exactly one method — run().
 */
export interface AgentRunner {
  run(context: AgentRunContext): Promise<AgentRunResult>;
}
