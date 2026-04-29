/**
 * @deprecated Session logic is moving to src/adapter/anthropic/sse-stream.ts.
 * This file is kept for backward-compatibility with tests that import startProposeSession.
 *
 * Uses the SessionClient port interface — no direct SDK calls.
 */
import type { SessionClient } from "./port/session-client.js";
import type { CustomToolHandler } from "./tools/types.js";

export interface SessionDeps {
  client: SessionClient;
  sessionId: string;
  agentId: string;
  environmentId: string;
  requestContent: string;
  onBranchRegistered?: (branch: string) => void;
  onSseDisconnected?: () => void;
  abortController?: AbortController;
  /**
   * Optional: per-step tool handlers map (D4 co-location).
   * When provided, takes precedence over the global registry for tool dispatch.
   * Falls back to global registry (getHandler) for backward compatibility.
   */
  toolHandlers?: Map<string, CustomToolHandler>;
}

export type TerminationReason =
  | "end_turn"       // SSE detected idle + end_turn
  | "terminated"     // session.status_terminated received
  | "sse_error"      // SSE stream threw an error (fallback to polling)
  | "aborted"        // AbortController aborted (e.g., polling completed first)
  | "unknown";       // SSE loop exited without a clear reason

export interface SessionResult {
  sseDisconnected: boolean;
  idleEndTurnDetected: boolean;
  terminated: boolean;
  /** Explicit reason for how the SSE phase ended. Replaces ambiguous boolean combinations. */
  terminationReason: TerminationReason;
}

/**
 * Start the propose session over SSE.
 * Delegates to SessionClient.streamEvents which wraps all SSE logic.
 *
 * Returns result indicating whether SSE disconnected (fallback needed).
 *
 * @deprecated Use AnthropicSessionClient.streamEvents (via StepExecutor) instead.
 */
export async function startProposeSession(deps: SessionDeps): Promise<SessionResult> {
  const { client, sessionId, requestContent, toolHandlers, onBranchRegistered, onSseDisconnected, abortController } = deps;

  const result = await client.streamEvents(sessionId, {
    requestContent,
    toolHandlers,
    onBranchRegistered,
    onSseDisconnected,
    abortController,
  });

  return {
    sseDisconnected: result.sseDisconnected,
    idleEndTurnDetected: result.idleEndTurnDetected,
    terminated: result.terminated,
    terminationReason: result.terminationReason,
  };
}
