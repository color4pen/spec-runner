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
import type { DomainEvent } from "../event/types.js";
import type { BaseReportResult, ReportToolSpec, FollowUpPolicy } from "./report-result.js";

import type { ModelUsage } from "./model-usage.js";
export type { ModelUsage } from "./model-usage.js";

/**
 * Input group: all content injected into the agent prompt.
 */
export interface AgentRunInput {
  /** Content of the request file (request.md / pipeline-context.md) */
  requestContent: string;
  /**
   * Whether this request declared adr: true in its Meta section.
   * Propagated from ParsedRequest.adr so adapters can construct a valid StepContext.
   * Defaults to false when not provided (backward compat).
   */
  requestAdr?: boolean;
  /** Dynamic repository context collected at pipeline start. Optional for backward compat. */
  dynamicContext?: DynamicContext;
  /** Project-level context from specrunner/project.md. undefined when file does not exist. */
  projectContext?: string;
}

/**
 * Session group: session continuity and logging settings.
 */
export interface AgentRunSession {
  /**
   * 前回の fixer session ID。存在する場合 adapter は既存 session を継続する。未指定時は新規 session を作成する。
   * fixer ステップ（spec-fixer / build-fixer / code-fixer）専用。
   */
  resumeSessionId?: string;
  /**
   * resume 時にユーザーが --prompt / --prompt-file で注入した追加コンテキスト。
   * 最初の agent ステップのみに適用される（one-shot）。
   */
  resumePrompt?: string;
  /**
   * Absolute path for the agent session log file.
   * Set by StepExecutor when log level is debug (-vv).
   * When set, ClaudeCodeRunner writes SDK messages as JSONL to this path.
   */
  logPath?: string;
}

/**
 * Policy group: execution policy including follow-up prompts and report_result tool config.
 */
export interface AgentRunPolicy {
  /**
   * 作業 turn 後に同一 session へ投げる follow プロンプト列 (旧 followUpPrompts)。
   * 指定時: adapter が作業 turn 完了後に同一 session で各 prompt を順番に投げる。
   * 未指定 / 空配列: adapter は作業 turn のみで返す (既存挙動)。
   */
  postWorkPrompts?: string[];
  /**
   * report_result tool specification for this step.
   * When set, the adapter registers the tool and detects its invocation.
   * When absent, the adapter does not register the tool (legacy behavior).
   */
  reportTool?: ReportToolSpec;
  /**
   * Retry policy for when the agent fails to call report_result.
   * When absent and reportTool is set, DEFAULT_TOOL_RETRY is used.
   */
  toolReportRetry?: FollowUpPolicy;
}

/**
 * Context passed to AgentRunner.run() for each agent step execution.
 * All fields are runtime-neutral — no SDK-specific types are included.
 *
 * TC-002: fields are step, state, branch, slug, cwd, input, session, policy, config, emit, requestType only.
 *
 * Refactored (tool-driven-step-completion):
 * - input:   requestContent / requestAdr / dynamicContext / projectContext
 * - session: resumeSessionId / resumePrompt / logPath (was sessionLogPath)
 * - policy:  postWorkPrompts (was followUpPrompts) / reportTool / toolReportRetry
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
  /** Full pipeline config including runtime-specific settings */
  config: SpecRunnerConfig;
  /**
   * Request type (e.g. "bug-fix", "spec-change", "new-feature").
   * Used by adapters to select the appropriate model via byRequestType in step config resolution.
   */
  requestType?: string;
  /** Input group: prompt content. */
  input: AgentRunInput;
  /** Session group: session continuity and logging. */
  session: AgentRunSession;
  /** Policy group: follow-up prompts and report_result tool config. */
  policy: AgentRunPolicy;
  /** Emit a domain event payload back to StepExecutor.
   * Called by adapter for intermediate state updates (e.g. step progress). */
  emit: (event: DomainEvent, payload: Record<string, unknown>) => void;
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
  /**
   * Result reported by the agent via report_result tool call.
   * null = tool was not called (or adapter does not support tool detection).
   * Required field — adapters must always set this.
   */
  toolResult: BaseReportResult | null;
  /**
   * Number of follow-up retry attempts made to get the agent to call report_result.
   * 0 = the agent called the tool on the first turn.
   * Required field — adapters must always set this.
   */
  followUpAttempts: number;
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
