/**
 * Moved from src/core/completion.ts.
 * All @anthropic-ai/sdk imports are isolated in src/adapter/anthropic/.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { BetaManagedAgentsSession } from "@anthropic-ai/sdk/resources/beta/sessions/sessions";
import { retrieveSession, listEvents } from "./sdk/sessions.js";
import { stderrWrite } from "../../logger/stdout.js";
import {
  sessionTerminatedError,
  pollTimeoutError,
  sessionReschedulingExhaustedError,
  sessionRequiresActionError,
  sessionRetriesExhaustedError,
} from "../../errors.js";

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
 * Determine if a session is in idle status (turn complete or stop_reason TBD).
 * Use getIdleStopReason() to distinguish end_turn from requires_action / retries_exhausted.
 */
export function isSessionIdle(session: BetaManagedAgentsSession): boolean {
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
  const MAX_RESCHEDULING_COUNT = 10;
  let reschedulingCount = 0;

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

    if (session.status === "rescheduling") {
      reschedulingCount++;
      stderrWrite(`Session rescheduling (${reschedulingCount}/${MAX_RESCHEDULING_COUNT}).`);
      if (reschedulingCount >= MAX_RESCHEDULING_COUNT) {
        throw sessionReschedulingExhaustedError(sessionId);
      }
      intervalMs = calculateBackoff(0, intervalMs);
      continue;
    }

    // Reset rescheduling count on any non-rescheduling status
    reschedulingCount = 0;

    if (isSessionIdle(session)) {
      // Verify stop_reason via events.list() to distinguish end_turn from error states
      const stopReason = await getIdleStopReason(client, sessionId);
      if (stopReason === "end_turn") {
        return session;
      }
      if (stopReason === "requires_action") {
        throw sessionRequiresActionError(sessionId);
      }
      if (stopReason === "retries_exhausted") {
        throw sessionRetriesExhaustedError(sessionId);
      }
      // Unknown stop_reason — log and treat as success (forward compat)
      stderrWrite(`Polling: idle with unknown stop_reason '${stopReason}'. Treating as complete.`);
      return session;
    }

    intervalMs = calculateBackoff(0, intervalMs);
  }
}

/**
 * After polling detects idle, inspect events.list() to find the stop_reason.
 * Returns the stop_reason type string, or "unknown" if not found.
 *
 * listEvents() is called with order: "desc" (most-recent-first), so the first
 * session.status_idle event encountered is the latest one — no need to scan all pages.
 */
async function getIdleStopReason(
  client: Anthropic,
  sessionId: string,
): Promise<string> {
  try {
    const events = await listEvents(client, sessionId);
    // First idle event is the most recent (order: "desc" in listEvents).
    for await (const event of events) {
      if (event.type === "session.status_idle") {
        return event.stop_reason.type;
      }
    }
    return "unknown";
  } catch {
    stderrWrite("Failed to fetch events for stop_reason check. Assuming end_turn.");
    return "end_turn";
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
