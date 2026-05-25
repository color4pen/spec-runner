/**
 * Port interface for one-shot query execution.
 *
 * Design: OneShotQueryClient abstracts the one-shot query execution
 * so that core/ has no direct dependency on adapter/ or SDK.
 * Concrete implementation: ClaudeCodeOneShotQueryClient (adapter/claude-code/).
 */
import type { ModelUsage } from "./model-usage.js";

// ---------------------------------------------------------------------------
// OneShotQueryOptions
// ---------------------------------------------------------------------------

export interface OneShotQueryOptions {
  /** System prompt passed to the model (MUST). */
  systemPrompt: string;
  /** User message / initial prompt (MUST). */
  prompt: string;
  /** Allowed tools list. Default: ["Read", "Bash", "Grep", "Glob"]. */
  allowedTools?: string[];
  /** Maximum number of turns. Optional — feeds into config chain stepDefaults. */
  maxTurns?: number;
  /** Timeout in milliseconds. Optional — feeds into config chain stepDefaults. */
  timeoutMs?: number;
  /** Working directory. Default: process.cwd(). */
  cwd?: string;
  /**
   * Config resolution key (step name). Default: "one-shot".
   * Set to the command name (e.g. "request-review") to pick up step-level config overrides.
   */
  stepName?: string;
  /** Model identifier. Default: "claude-sonnet-4-5". Feeds into config chain stepDefaults. */
  model?: string;
}

// ---------------------------------------------------------------------------
// OneShotQueryResult
// ---------------------------------------------------------------------------

export interface OneShotQueryResult {
  /** Final assistant text response (raw — structured parse is caller's responsibility). */
  text: string;
  /** SDK session_id from the success result (managed runtime). undefined for local runtime. */
  sessionId?: string;
  /** Reserved for future use — currently always undefined. */
  turnCount?: number;
  /** Completion reason from SDKResultMessage.subtype (e.g. "success", "max_turns"). */
  stopReason?: string;
  /** Per-model token usage from the agent run. undefined if not available. */
  modelUsage?: Record<string, ModelUsage>;
}

// ---------------------------------------------------------------------------
// OneShotQueryClient
// ---------------------------------------------------------------------------

/**
 * Port interface for one-shot query execution.
 * Core layer depends on this; adapter layer implements it.
 */
export interface OneShotQueryClient {
  /**
   * Execute a one-shot query and return the result.
   * Throws SpecRunnerError on failure (e.g. QUERY_ONE_SHOT_FAILED, QUERY_ONE_SHOT_TIMEOUT).
   */
  run(opts: OneShotQueryOptions): Promise<OneShotQueryResult>;
}
