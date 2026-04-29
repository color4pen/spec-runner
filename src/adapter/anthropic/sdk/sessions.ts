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
