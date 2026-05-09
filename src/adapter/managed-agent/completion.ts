/**
 * Moved from src/core/completion.ts.
 * All @anthropic-ai/sdk imports are isolated in src/adapter/anthropic/.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { BetaManagedAgentsSession } from "@anthropic-ai/sdk/resources/beta/sessions/sessions";
import { retrieveSession } from "./sdk/sessions.js";
import { stderrWrite } from "../../logger/stdout.js";
import { sessionTerminatedError, pollTimeoutError } from "../../errors.js";

export const INITIAL_INTERVAL_MS = 2000;
export const MAX_INTERVAL_MS = 30000;
export const BACKOFF_FACTOR = 1.5;
export const JITTER_FACTOR = 0.2;
export const DEFAULT_POLL_TIMEOUT_MS = 900_000;

export interface PollOptions {
  /** Injectable sleep function (for testing) */
  sleepFn?: (ms: number) => Promise<void>;
  /** Wall-clock timeout in milliseconds. Throws PollTimeoutError when exceeded.
   * Defaults to no timeout when omitted (null/undefined). */
  timeoutMs?: number;
}

/**
 * Determine if a session has completed its turn with end_turn.
 */
export function isProposeComplete(session: BetaManagedAgentsSession): boolean {
  return session.status === "idle";
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
 * Throws SESSION_TERMINATED if the session terminates.
 * Throws PollTimeoutError if opts.timeoutMs is set and the wall-clock deadline is exceeded.
 */
export async function pollUntilComplete(
  client: Anthropic,
  sessionId: string,
  abortSignal?: AbortSignal,
  opts?: PollOptions,
): Promise<BetaManagedAgentsSession> {
  const sleepFn =
    opts?.sleepFn ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const deadline = opts?.timeoutMs != null ? Date.now() + opts.timeoutMs : null;
  const startTime = Date.now();

  let intervalMs = INITIAL_INTERVAL_MS;

  while (true) {
    if (abortSignal?.aborted) {
      const session = await retrieveSession(client, sessionId);
      return session;
    }

    await sleepFn(intervalMs);

    if (deadline != null && Date.now() >= deadline) {
      throw pollTimeoutError(sessionId, Date.now() - startTime);
    }

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

    intervalMs = calculateBackoff(0, intervalMs);
  }
}

/**
 * Guard function to assert break-after-completion pattern.
 */
export function assertBreakAfterCompletion(event: { type: string }): void {
  if (event.type === "session.status_idle") {
    return;
  }
}
