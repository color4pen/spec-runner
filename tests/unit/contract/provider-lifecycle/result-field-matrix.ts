/**
 * AgentRunResult capability matrix.
 *
 * For each field of AgentRunResult, declares whether claude-code and codex
 * populate it ("supported") or leave it undefined ("absent").
 *
 * The canonical classification source is src/core/port/agent-runner.ts JSDoc
 * comments. The field matrix ratchet (contract-ratchet.test.ts) checks that
 * the field names here match the AgentRunResult interface exactly.
 *
 * No provider adapter or provider SDK imports.
 */

export type CapabilityStatus = "supported" | "absent";

export interface FieldCapability {
  providers: {
    "claude-code": CapabilityStatus;
    codex: CapabilityStatus;
  };
  /**
   * Human-readable rationale. Required (≥40 chars) for every "absent" entry.
   * Corresponds to the port doc comment explaining why the provider omits the field.
   */
  reason: string;
}

/**
 * Capability matrix for all 15 fields of AgentRunResult.
 *
 * Classification sources (from src/core/port/agent-runner.ts):
 *   completionReason   — both: always present.
 *   resultContent      — both: always present. When resultFilePath is null: claude-code → null,
 *                        codex → turn.finalResponse (the agent's final text, possibly "").
 *   toolResult         — both: always present (null when tool not called).
 *   followUpAttempts   — both: always present (0 when no retries needed).
 *   transientRetryAttempts — both: present when maxRetries > 0, absent when disabled.
 *   sessionId          — both: populated when SDK exposes a session identifier.
 *   agentBranch        — both: managed runtime only; local adapters leave undefined.
 *   error              — both: present when completionReason !== "success".
 *   modelUsage         — both: populated by local runtime runners.
 *   completionReportDiagnostics — claude-code: absent (MCP tool call, no text extraction);
 *                                  codex: supported (finalResponse JSON extraction can fail).
 *   addedTurns         — claude-code: supported; codex: absent (SDK does not track per-type turns).
 *   contextMetrics     — claude-code: supported; codex: absent (SDK does not expose context window).
 *   invocationMetrics  — claude-code: supported; codex: absent (SDK does not report per-invocation metrics).
 *   touchedFiles       — claude-code: supported; codex: absent (SDK does not report file touches).
 *   sessionRollovers   — claude-code: supported; codex: absent (no rollover support in Codex SDK).
 */
export const RESULT_FIELD_MATRIX: Record<string, FieldCapability> = {
  completionReason: {
    providers: { "claude-code": "supported", codex: "supported" },
    reason:
      "Both providers always set completionReason to success, error, or timeout.",
  },
  resultContent: {
    providers: { "claude-code": "supported", codex: "supported" },
    reason:
      "Both providers read the result file from the local filesystem when resultFilePath is set. When it is null they differ: ClaudeCodeRunner leaves resultContent null, while CodexAgentRunner falls back to turn.finalResponse (the agent's final text, which may be the empty string). Pinned by main-work.success-minimal (provider-specific). Source: src/adapter/codex/agent-runner.ts `resultContent = turn.finalResponse` else-branch.",
  },
  toolResult: {
    providers: { "claude-code": "supported", codex: "supported" },
    reason:
      "Both providers populate toolResult when the agent reports (null when not reported).",
  },
  followUpAttempts: {
    providers: { "claude-code": "supported", codex: "supported" },
    reason:
      "Both providers track follow-up retry attempts; 0 when none were needed.",
  },
  transientRetryAttempts: {
    providers: { "claude-code": "supported", codex: "supported" },
    reason:
      "Both providers populate transientRetryAttempts when transientRetry.maxRetries > 0; absent when feature is disabled (maxRetries = 0).",
  },
  sessionId: {
    providers: { "claude-code": "supported", codex: "supported" },
    reason:
      "Claude captures session_id from SDK result; Codex uses the thread ID. Both set sessionId when available.",
  },
  agentBranch: {
    providers: { "claude-code": "absent", codex: "absent" },
    reason:
      "Neither ClaudeCodeRunner nor CodexAgentRunner sets agentBranch; the field is populated only by ManagedAgentRunner via the register_branch tool. Since the parity contract suite exercises only local adapters, agentBranch is always undefined in all contract test results. Source: grep 'agentBranch' src/adapter/claude-code/agent-runner.ts src/adapter/codex/agent-runner.ts returns no results.",
  },
  error: {
    providers: { "claude-code": "supported", codex: "supported" },
    reason:
      "Both providers populate error when completionReason is error or timeout; undefined on success.",
  },
  modelUsage: {
    providers: { "claude-code": "supported", codex: "supported" },
    reason:
      "Claude accumulates per-model token counts from SDK result messages; Codex maps turn usage to the resolved model key.",
  },
  completionReportDiagnostics: {
    providers: { "claude-code": "absent", codex: "supported" },
    reason:
      "Claude receives the completion report via MCP tool call with schema validation; there is no text-extraction step that can fail, so completionReportDiagnostics is always undefined for claude-code. Codex extracts JSON from finalResponse text, which can fail; each failure is recorded as a CompletionReportDiagnostic entry. Source: src/core/port/agent-runner.ts AgentRunResult.completionReportDiagnostics doc comment.",
  },
  addedTurns: {
    providers: { "claude-code": "supported", codex: "absent" },
    reason:
      "ClaudeCodeRunner tracks per-type added-turn counters (reportRetry / postWork / outputRepair) and always populates addedTurns. CodexAgentRunner does not maintain per-type counters; the SDK does not expose turn-type breakdowns, so addedTurns is always undefined for codex. Source: src/core/port/agent-runner.ts AgentRunResult.addedTurns doc comment.",
  },
  contextMetrics: {
    providers: { "claude-code": "supported", codex: "absent" },
    reason:
      "ClaudeCodeRunner observes context window size and compaction events from SDK messages and populates contextMetrics. The Codex SDK does not expose a per-request context window size, compaction events, or exhaustion errors with a standard context-limit message; contextMetrics is never set by CodexAgentRunner. Source: src/core/port/agent-runner.ts AgentRunResult.contextMetrics doc comment.",
  },
  invocationMetrics: {
    providers: { "claude-code": "supported", codex: "absent" },
    reason:
      "ClaudeCodeRunner extracts num_turns / duration_ms / duration_api_ms / total_cost_usd from the SDK result message and populates invocationMetrics. The Codex SDK does not expose equivalent per-invocation summary metrics; invocationMetrics is always undefined for codex. Source: src/core/port/agent-runner.ts AgentRunResult.invocationMetrics doc comment.",
  },
  touchedFiles: {
    providers: { "claude-code": "supported", codex: "absent" },
    reason:
      "ClaudeCodeRunner accumulates assistant messages and extracts worktree-relative file paths touched by Edit/Write tool calls; touchedFiles is always a string[] (possibly empty) for claude-code. The Codex SDK does not report file-touch information in a form compatible with the touchedFiles contract; touchedFiles is always undefined for codex. Source: src/core/port/agent-runner.ts AgentRunResult.touchedFiles doc comment.",
  },
  sessionRollovers: {
    providers: { "claude-code": "supported", codex: "absent" },
    reason:
      "ClaudeCodeRunner implements a fresh-session rollover when context is exhausted and rollover budget is available (implementer step only); sessionRollovers records each discarded session. The Codex SDK does not expose a standard context-exhaustion signal and has no rollover mechanism; sessionRollovers is always undefined for codex. Source: src/core/port/agent-runner.ts AgentRunResult.sessionRollovers doc comment.",
  },
};
