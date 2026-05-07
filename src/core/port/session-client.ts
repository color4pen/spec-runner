import type { CustomToolHandler } from "../tools/types.js";

/**
 * Port interface for interacting with an Anthropic Managed Agent session.
 * Adapter (src/adapter/anthropic/) implements this; core never imports the adapter.
 */
export interface SessionClient {
  /**
   * Create a new managed agent session.
   * Returns the session ID.
   */
  createSession(params: {
    agentId: string;
    environmentId: string;
    repoUrl: string;
    githubToken: string;
    /**
     * Branch to check out when mounting the repository. When omitted the SDK
     * defaults to the repository's default branch (main). Polling-style steps
     * (spec-review / implementer / build-fixer / code-review / code-fixer /
     * spec-fixer) MUST pass `state.branch` so they can see the change folder
     * pushed by propose; otherwise their workspace is mounted at main and the
     * pipeline halts (e.g. "change folder doesn't exist yet").
     */
    branch?: string;
  }): Promise<{ sessionId: string }>;

  /**
   * Send an initial user message to the session.
   */
  sendUserMessage(sessionId: string, text: string): Promise<void>;

  /**
   * Poll a session until it becomes idle (complete) or terminated.
   * Uses exponential backoff with jitter.
   *
   * Wall-clock timeout has been removed (design D1). Termination relies on
   * the Anthropic SDK's end_turn / terminated signals or manual cancel.
   *
   * Returns status: idle = success, terminated = agent stopped.
   */
  pollUntilComplete(
    sessionId: string,
    opts?: {
      sleepFn?: (ms: number) => Promise<void>;
      abortSignal?: AbortSignal;
    },
  ): Promise<{
    status: "idle" | "terminated";
    error?: { code: string; message: string; hint: string };
  }>;

  /**
   * Connect via SSE, process events, and drive the session until it ends.
   * Used by propose-style steps that need custom tool handling.
   *
   * Returns termination reason.
   * Note: onBranchRegistered / onSlugRegistered removed (D4: register_branch tool deleted).
   */
  streamEvents(
    sessionId: string,
    opts: {
      requestContent: string;
      /** Canonical slug (single source of truth). Injected into the propose
       * agent's initial message so the agent uses the executor-provided value
       * verbatim rather than deriving its own. */
      slug: string;
      /** Branch name the agent should commit + push to. Defaults to `feat/{slug}`
       * when omitted. The agent must NOT pick its own branch name. */
      branch?: string;
      toolHandlers?: Map<string, CustomToolHandler>;
      onSseDisconnected?: () => void;
      abortController?: AbortController;
    },
  ): Promise<{
    sseDisconnected: boolean;
    idleEndTurnDetected: boolean;
    terminated: boolean;
    terminationReason: "end_turn" | "terminated" | "sse_error" | "aborted" | "unknown";
  }>;
}
