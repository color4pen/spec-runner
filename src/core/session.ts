import type Anthropic from "@anthropic-ai/sdk";
import {
  streamEvents,
  sendEvents,
  isCustomToolUseEvent,
  isStatusIdleEvent,
  isStatusTerminatedEvent,
  isEndTurnIdle,
} from "../sdk/sessions.js";
import { getHandler } from "./tools/registry.js";
import { assertBreakAfterCompletion } from "./completion.js";
import { buildInitialMessage } from "../prompts/propose-system.js";
import { stderrWrite } from "../logger/stdout.js";
import type { CustomToolContext } from "./tools/types.js";

export interface SessionDeps {
  client: Anthropic;
  sessionId: string;
  agentId: string;
  environmentId: string;
  requestContent: string;
  onBranchRegistered?: (branch: string) => void;
  onSseDisconnected?: () => void;
  abortController?: AbortController;
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
 * Connects to SSE stream first, then sends initial message.
 * Handles custom_tool_use events and dispatches to registry handlers.
 * Breaks on idle+end_turn or terminated.
 *
 * Returns result indicating whether SSE disconnected (fallback needed).
 */
export async function startProposeSession(deps: SessionDeps): Promise<SessionResult> {
  const { client, sessionId, requestContent } = deps;

  const ctx: CustomToolContext = { sessionId };

  let sseDisconnected = false;
  let idleEndTurnDetected = false;
  let terminated = false;

  // 1. Connect to SSE stream BEFORE sending initial message
  let stream: Awaited<ReturnType<typeof streamEvents>>;
  try {
    stream = await streamEvents(client, sessionId);
  } catch (err) {
    sseDisconnected = true;
    stderrWrite("SSE disconnected; falling back to polling.");
    deps.onSseDisconnected?.();
    return { sseDisconnected, idleEndTurnDetected, terminated, terminationReason: "sse_error" };
  }

  // 2. Send initial message
  const initialMessage = buildInitialMessage(requestContent);
  await sendEvents(client, sessionId, {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text: initialMessage }],
      },
    ],
  });

  // 3. Process SSE events
  let terminationReason: TerminationReason = "unknown";
  try {
    for await (const event of stream) {
      // Check abort signal
      if (deps.abortController?.signal.aborted) {
        terminationReason = "aborted";
        break;
      }

      if (isCustomToolUseEvent(event)) {
        // Dispatch to registry handler
        const handler = getHandler(event.name);
        let result: { ok: boolean; [key: string]: unknown };

        if (!handler) {
          result = { ok: false, error: `Unknown tool: ${event.name}` };
        } else {
          const handlerResult = await handler(event.input, ctx);
          result = handlerResult;

          // If this is register_branch, notify callback
          if (event.name === "register_branch" && result.ok && typeof result["branch"] === "string") {
            deps.onBranchRegistered?.(result["branch"] as string);
          }
        }

        // Send tool result back
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
          // CRITICAL: must break here (feedback_sse_break_after_completion)
          assertBreakAfterCompletion(event);
          idleEndTurnDetected = true;
          terminationReason = "end_turn";
          break;
        }
        // requires_action — continue waiting for more tool results
      } else if (isStatusTerminatedEvent(event)) {
        terminated = true;
        terminationReason = "terminated";
        break;
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
