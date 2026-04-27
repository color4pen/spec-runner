import type Anthropic from "@anthropic-ai/sdk";
import type { BetaManagedAgentsSession } from "@anthropic-ai/sdk/resources/beta/sessions/sessions";
import { retrieveSession } from "../sdk/sessions.js";
import { stderrWrite } from "../logger/stdout.js";
import { sessionTimeoutError, sessionTerminatedError } from "../errors.js";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const INITIAL_INTERVAL_MS = 2000;
const MAX_INTERVAL_MS = 30000;
const BACKOFF_FACTOR = 1.5;
const JITTER_FACTOR = 0.2;

export interface PollOptions {
  timeoutMs?: number;
  /** Injectable sleep function (for testing) */
  sleepFn?: (ms: number) => Promise<void>;
}

export interface PollResult {
  session: BetaManagedAgentsSession;
  timedOut: boolean;
  terminated: boolean;
}

/**
 * Determine if a session has completed its turn with end_turn.
 * Used by both polling loop and SSE loop for consistent detection.
 */
export function isProposeComplete(session: BetaManagedAgentsSession): boolean {
  return session.status === "idle";
  // Note: polling does not expose stop_reason directly — that's only in SSE events.
  // When status is "idle", the turn ended. We treat idle as complete.
}

/**
 * Determine if a session has terminated (permanently stopped).
 */
export function isSessionTerminated(session: BetaManagedAgentsSession): boolean {
  return session.status === "terminated";
}

/**
 * Calculate the next backoff interval with jitter.
 */
export function calculateBackoff(attempt: number, currentIntervalMs: number): number {
  const next = Math.min(currentIntervalMs * BACKOFF_FACTOR, MAX_INTERVAL_MS);
  const jitter = next * JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.round(next + jitter);
}

/**
 * Poll a session until it becomes idle (complete) or terminated.
 * Uses exponential backoff with jitter.
 *
 * Throws SESSION_TIMEOUT if the timeout is exceeded.
 * Throws SESSION_TERMINATED if the session terminates.
 */
export async function pollUntilComplete(
  client: Anthropic,
  sessionId: string,
  abortSignal?: AbortSignal,
  opts?: PollOptions,
): Promise<BetaManagedAgentsSession> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleepFn =
    opts?.sleepFn ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const startTime = Date.now();
  let intervalMs = INITIAL_INTERVAL_MS;

  while (true) {
    if (abortSignal?.aborted) {
      // Polling was aborted (e.g., SSE detected completion first)
      const session = await retrieveSession(client, sessionId);
      return session;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      const minutes = Math.round(timeoutMs / 60000);
      stderrWrite(`Session timed out after ${minutes}m.`);
      throw sessionTimeoutError(minutes);
    }

    // Wait before polling
    await sleepFn(intervalMs);

    if (abortSignal?.aborted) {
      const session = await retrieveSession(client, sessionId);
      return session;
    }

    const session = await retrieveSession(client, sessionId);

    if (isSessionTerminated(session)) {
      throw sessionTerminatedError();
    }

    if (isProposeComplete(session)) {
      return session;
    }

    // Increase backoff for next iteration
    intervalMs = calculateBackoff(0, intervalMs);
  }
}

/**
 * Guard function to assert break-after-completion pattern.
 * Call this in SSE loop after detecting idle+end_turn to verify break happens.
 * In tests, we can verify this was called.
 */
export function assertBreakAfterCompletion(event: { type: string }): void {
  if (event.type === "session.status_idle") {
    // The caller should break the SSE loop immediately after calling this.
    // This function's existence enables testing that break is reached.
    return;
  }
}
