/**
 * SSE stream logic moved from src/core/session.ts.
 * All @anthropic-ai/sdk imports are isolated in src/adapter/anthropic/.
 */
import type Anthropic from "@anthropic-ai/sdk";
import {
  streamEvents,
  sendEvents,
  isCustomToolUseEvent,
  isStatusIdleEvent,
  isStatusTerminatedEvent,
  isStatusRescheduledEvent,
  isSessionErrorEvent,
  isSessionDeletedEvent,
  isEndTurnIdle,
  isRetryStatusRetrying,
} from "./sdk/sessions.js";
import { assertBreakAfterCompletion } from "./completion.js";
import { buildInitialMessage } from "../../prompts/design-system.js";
import { stderrWrite } from "../../logger/stdout.js";
import type { CustomToolContext, CustomToolHandler } from "../../core/tools/types.js";

export type TerminationReason =
  | "end_turn"
  | "terminated"
  | "sse_error"
  | "aborted"
  | "requires_action"
  | "retries_exhausted"
  | "session_error"
  | "session_deleted"
  | "unknown";

export interface SseStreamResult {
  sseDisconnected: boolean;
  idleEndTurnDetected: boolean;
  terminated: boolean;
  terminationReason: TerminationReason;
}

export interface SseStreamDeps {
  client: Anthropic;
  sessionId: string;
  requestContent: string;
  /** Canonical slug — passed to buildInitialMessage so the agent uses the
   * executor-provided value (single source of truth) rather than deriving its own. */
  slug: string;
  /** Branch name the agent should commit + push to. Defaults to `feat/{slug}`. */
  branch?: string;
  toolHandlers?: Map<string, CustomToolHandler>;
  onSseDisconnected?: () => void;
  abortController?: AbortController;
}

/**
 * Start the propose session over SSE.
 * Connects to SSE stream first, then sends initial message.
 * Handles custom_tool_use events and dispatches to toolHandlers.
 * Breaks on idle+end_turn or terminated.
 */
export async function runSseStream(deps: SseStreamDeps): Promise<SseStreamResult> {
  const { client, sessionId, requestContent, slug, branch } = deps;

  const ctx: CustomToolContext = { sessionId };

  let sseDisconnected = false;
  let idleEndTurnDetected = false;
  let terminated = false;

  let stream: Awaited<ReturnType<typeof streamEvents>>;
  try {
    stream = await streamEvents(client, sessionId);
  } catch (err) {
    sseDisconnected = true;
    stderrWrite("SSE disconnected; falling back to polling.");
    deps.onSseDisconnected?.();
    return { sseDisconnected, idleEndTurnDetected, terminated, terminationReason: "sse_error" };
  }

  const initialMessage = branch !== undefined
    ? buildInitialMessage(requestContent, slug, branch)
    : buildInitialMessage(requestContent, slug);
  await sendEvents(client, sessionId, {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text: initialMessage }],
      },
    ],
  });

  let terminationReason: TerminationReason = "unknown";
  try {
    for await (const event of stream) {
      if (deps.abortController?.signal.aborted) {
        terminationReason = "aborted";
        break;
      }

      if (isCustomToolUseEvent(event)) {
        const handler: CustomToolHandler | undefined = deps.toolHandlers?.get(event.name);
        let result: { ok: boolean; [key: string]: unknown };

        if (!handler) {
          result = { ok: false, error: `Unknown tool: ${event.name}` };
        } else {
          const handlerResult = await handler(event.input, ctx);
          result = handlerResult;
        }

        await sendEvents(client, sessionId, {
          events: [
            {
              type: "user.custom_tool_result",
              custom_tool_use_id: event.id,
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result),
                },
              ],
            },
          ],
        });
      } else if (isStatusIdleEvent(event)) {
        if (isEndTurnIdle(event)) {
          assertBreakAfterCompletion(event);
          idleEndTurnDetected = true;
          terminationReason = "end_turn";
          break;
        }
        // idle but not end_turn: requires_action or retries_exhausted
        // Both are error conditions for spec-runner
        const stopType = event.stop_reason.type;
        if (stopType === "requires_action") {
          stderrWrite("Session idle with requires_action (unexpected in spec-runner).");
          terminated = true;
          terminationReason = "requires_action";
          break;
        }
        if (stopType === "retries_exhausted") {
          stderrWrite("Session idle with retries_exhausted (unrecoverable).");
          terminated = true;
          terminationReason = "retries_exhausted";
          break;
        }
        // Unknown future stop_reason — log and continue
        stderrWrite(`Session idle with unknown stop_reason: ${stopType}. Continuing.`);
      } else if (isStatusTerminatedEvent(event)) {
        terminated = true;
        terminationReason = "terminated";
        break;
      } else if (isSessionErrorEvent(event)) {
        if (isRetryStatusRetrying(event.error)) {
          stderrWrite(`Session error (${event.error.type}), SDK retrying. Continuing.`);
          // SDK is auto-retrying; continue listening
        } else {
          stderrWrite(`Session error (${event.error.type}), retry_status: ${event.error.retry_status.type}. Stopping.`);
          terminated = true;
          terminationReason = "session_error";
          break;
        }
      } else if (isSessionDeletedEvent(event)) {
        stderrWrite("Session deleted (unrecoverable).");
        terminated = true;
        terminationReason = "session_deleted";
        break;
      } else if (isStatusRescheduledEvent(event)) {
        stderrWrite("Session rescheduled (error recovery in progress). Continuing.");
        // SDK is recovering; continue listening
      }
    }
  } catch (err) {
    sseDisconnected = true;
    terminationReason = "sse_error";
    stderrWrite("SSE disconnected; falling back to polling.");
    deps.onSseDisconnected?.();
  }

  return { sseDisconnected, idleEndTurnDetected, terminated, terminationReason };
}
