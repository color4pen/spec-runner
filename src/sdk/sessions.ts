/**
 * Runtime-neutral session event utilities.
 *
 * This file contains ONLY type narrowing helpers and type re-exports.
 * No SDK function calls are made here at runtime.
 * All SDK-calling functions (createSession, retrieveSession, streamEvents, sendEvents)
 * have moved to src/adapter/anthropic/sdk/sessions.ts.
 *
 * @deprecated Deprecated core files (session.ts, completion.ts, step/spec-review.ts)
 * import narrowing helpers from this file for backward compat with their tests.
 * New code should import from src/adapter/anthropic/sdk/sessions.ts directly.
 */

// Type-only re-exports (no runtime SDK call)
export type {
  BetaManagedAgentsSession,
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
} from "@anthropic-ai/sdk/resources/beta/sessions/events";

import type {
  BetaManagedAgentsStreamSessionEvents,
  BetaManagedAgentsAgentCustomToolUseEvent,
  BetaManagedAgentsSessionStatusIdleEvent,
  BetaManagedAgentsSessionStatusTerminatedEvent,
} from "@anthropic-ai/sdk/resources/beta/sessions/events";

/**
 * Narrowing helper: check if event is a custom tool use event.
 * Runtime check: e.type === "agent.custom_tool_use"
 */
export function isCustomToolUseEvent(
  e: BetaManagedAgentsStreamSessionEvents,
): e is BetaManagedAgentsAgentCustomToolUseEvent {
  return e.type === "agent.custom_tool_use";
}

/**
 * Narrowing helper: check if event is a session status idle event.
 * Runtime check: e.type === "session.status_idle"
 */
export function isStatusIdleEvent(
  e: BetaManagedAgentsStreamSessionEvents,
): e is BetaManagedAgentsSessionStatusIdleEvent {
  return e.type === "session.status_idle";
}

/**
 * Narrowing helper: check if event is a session status terminated event.
 * Runtime check: e.type === "session.status_terminated"
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

// ---------------------------------------------------------------------------
// SDK-calling functions — @deprecated, moved to adapter/anthropic/sdk/sessions.ts
// Kept here only for backward compat with deprecated core files (session.ts,
// completion.ts, step/spec-review.ts) which are pending deletion.
// ---------------------------------------------------------------------------

import type Anthropic from "@anthropic-ai/sdk";
import type { Stream } from "@anthropic-ai/sdk/streaming";
import type { BetaManagedAgentsSession } from "@anthropic-ai/sdk/resources/beta/sessions/sessions";

/**
 * @deprecated Use adapter/anthropic/sdk/sessions.ts createSession instead.
 */
export async function createSession(
  client: Anthropic,
  params: Parameters<Anthropic["beta"]["sessions"]["create"]>[0],
): Promise<BetaManagedAgentsSession> {
  return client.beta.sessions.create(params);
}

/**
 * @deprecated Use adapter/anthropic/sdk/sessions.ts retrieveSession instead.
 */
export async function retrieveSession(
  client: Anthropic,
  sessionId: string,
): Promise<BetaManagedAgentsSession> {
  return client.beta.sessions.retrieve(sessionId);
}

/**
 * @deprecated Use adapter/anthropic/sdk/sessions.ts streamEvents instead.
 */
export async function streamEvents(
  client: Anthropic,
  sessionId: string,
): Promise<Stream<BetaManagedAgentsStreamSessionEvents>> {
  return client.beta.sessions.events.stream(sessionId);
}

/**
 * @deprecated Use adapter/anthropic/sdk/sessions.ts sendEvents instead.
 */
export async function sendEvents(
  client: Anthropic,
  sessionId: string,
  params: Parameters<Anthropic["beta"]["sessions"]["events"]["send"]>[1],
): Promise<void> {
  await client.beta.sessions.events.send(sessionId, params);
}
