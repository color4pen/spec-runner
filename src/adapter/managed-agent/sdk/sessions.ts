/**
 * SDK wrapper functions for Anthropic Managed Agent sessions.
 *
 * This file is the ONLY place that calls @anthropic-ai/sdk session APIs.
 * All SDK-calling code lives here; core/ never imports from this file directly.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { Stream } from "@anthropic-ai/sdk/streaming";

// Re-export SDK types for adapter-layer consumers
export type {
  BetaManagedAgentsSession,
  BetaManagedAgentsSessionUsage,
  SessionCreateParams,
} from "@anthropic-ai/sdk/resources/beta/sessions/sessions";

export type {
  BetaManagedAgentsSessionEvent,
  BetaManagedAgentsStreamSessionEvents,
  BetaManagedAgentsAgentCustomToolUseEvent,
  BetaManagedAgentsSessionStatusIdleEvent,
  BetaManagedAgentsSessionStatusTerminatedEvent,
  BetaManagedAgentsSessionEndTurn,
  BetaManagedAgentsSessionRequiresAction,
  EventSendParams,
  BetaManagedAgentsSessionStatusRescheduledEvent,
  BetaManagedAgentsSessionErrorEvent,
  BetaManagedAgentsSessionDeletedEvent,
} from "@anthropic-ai/sdk/resources/beta/sessions/events";

import type {
  BetaManagedAgentsStreamSessionEvents,
  BetaManagedAgentsAgentCustomToolUseEvent,
  BetaManagedAgentsSessionStatusIdleEvent,
  BetaManagedAgentsSessionStatusTerminatedEvent,
  BetaManagedAgentsSessionStatusRescheduledEvent,
  BetaManagedAgentsSessionErrorEvent,
  BetaManagedAgentsSessionDeletedEvent,
} from "@anthropic-ai/sdk/resources/beta/sessions/events";

import type { BetaManagedAgentsSession } from "@anthropic-ai/sdk/resources/beta/sessions/sessions";

/**
 * Create a new session.
 */
export async function createSession(
  client: Anthropic,
  params: Parameters<Anthropic["beta"]["sessions"]["create"]>[0],
): Promise<BetaManagedAgentsSession> {
  return client.beta.sessions.create(params);
}

/**
 * Retrieve an existing session.
 */
export async function retrieveSession(
  client: Anthropic,
  sessionId: string,
): Promise<BetaManagedAgentsSession> {
  return client.beta.sessions.retrieve(sessionId);
}

/**
 * Stream session events (SSE).
 */
export async function streamEvents(
  client: Anthropic,
  sessionId: string,
): Promise<Stream<BetaManagedAgentsStreamSessionEvents>> {
  return client.beta.sessions.events.stream(sessionId);
}

/**
 * Send events to a session.
 */
export async function sendEvents(
  client: Anthropic,
  sessionId: string,
  params: Parameters<Anthropic["beta"]["sessions"]["events"]["send"]>[1],
): Promise<void> {
  await client.beta.sessions.events.send(sessionId, params);
}

/**
 * Delete a session.
 */
export async function deleteSession(
  client: Anthropic,
  sessionId: string,
): Promise<void> {
  await client.beta.sessions.delete(sessionId);
}

/**
 * Narrowing helper: check if event is a custom tool use event.
 */
export function isCustomToolUseEvent(
  e: BetaManagedAgentsStreamSessionEvents,
): e is BetaManagedAgentsAgentCustomToolUseEvent {
  return e.type === "agent.custom_tool_use";
}

/**
 * Narrowing helper: check if event is a session status idle event.
 */
export function isStatusIdleEvent(
  e: BetaManagedAgentsStreamSessionEvents,
): e is BetaManagedAgentsSessionStatusIdleEvent {
  return e.type === "session.status_idle";
}

/**
 * Narrowing helper: check if event is a session status terminated event.
 */
export function isStatusTerminatedEvent(
  e: BetaManagedAgentsStreamSessionEvents,
): e is BetaManagedAgentsSessionStatusTerminatedEvent {
  return e.type === "session.status_terminated";
}

/**
 * Check if an idle event's stop_reason is end_turn.
 */
export function isEndTurnIdle(event: BetaManagedAgentsSessionStatusIdleEvent): boolean {
  return event.stop_reason.type === "end_turn";
}

/**
 * Narrowing helper: check if event is a session status rescheduled event.
 */
export function isStatusRescheduledEvent(
  e: BetaManagedAgentsStreamSessionEvents,
): e is BetaManagedAgentsSessionStatusRescheduledEvent {
  return e.type === "session.status_rescheduled";
}

/**
 * Narrowing helper: check if event is a session error event.
 */
export function isSessionErrorEvent(
  e: BetaManagedAgentsStreamSessionEvents,
): e is BetaManagedAgentsSessionErrorEvent {
  return e.type === "session.error";
}

/**
 * Narrowing helper: check if event is a session deleted event.
 */
export function isSessionDeletedEvent(
  e: BetaManagedAgentsStreamSessionEvents,
): e is BetaManagedAgentsSessionDeletedEvent {
  return e.type === "session.deleted";
}

/**
 * Check if a session error's retry_status indicates the server is retrying.
 * When true, the client should wait and continue listening.
 *
 * `error` is typed as `BetaManagedAgentsSessionErrorEvent["error"]`, a union of
 * `BetaManagedAgentsUnknownError | BetaManagedAgentsBillingError | ...`.
 * All variants share a `retry_status` discriminated union:
 * `RetryStatusRetrying | RetryStatusExhausted | RetryStatusTerminal`.
 * This function narrows to the `{ type: "retrying" }` case.
 */
export function isRetryStatusRetrying(
  error: BetaManagedAgentsSessionErrorEvent["error"],
): boolean {
  return error.retry_status.type === "retrying";
}

/**
 * List session events (paginated), ordered most-recent-first.
 * Used by polling to inspect the latest idle stop_reason.
 *
 * Passing `order: "desc"` ensures the first yielded event is the newest,
 * so `getIdleStopReason` can return immediately on the first idle event
 * without scanning all pages.
 */
export async function listEvents(
  client: Anthropic,
  sessionId: string,
) {
  return client.beta.sessions.events.list(sessionId, { order: "desc" });
}
