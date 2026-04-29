/**
 * Runtime-neutral session event utilities.
 *
 * This file contains ONLY type narrowing helpers and type re-exports.
 * No SDK function calls are made here at runtime.
 * All SDK-calling functions (createSession, retrieveSession, streamEvents, sendEvents)
 * have moved to src/adapter/anthropic/sdk/sessions.ts.
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
