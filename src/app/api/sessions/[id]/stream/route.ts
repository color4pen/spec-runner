import { NextRequest } from 'next/server';
import { getAnthropicClient } from '@/lib/anthropic';
import { auth } from '@/lib/auth';
import { verifySessionAccessByManagedId } from '@/lib/session-actions';
import { handleSessionCompleted } from '@/lib/session-completion-handler';
import { handleCustomToolUse } from '@/lib/custom-tool-handler';
import type { BetaManagedAgentsSessionEvent } from '@anthropic-ai/sdk/resources/beta/sessions/events';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authentication check
  const session = await auth();
  if (!session?.user || !session.accessToken) {
    return new Response(
      JSON.stringify({ error: 'Authentication required' }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const accessToken = session.accessToken;
  const { id } = await params;

  // Verify session ownership to prevent IDOR
  let sessionRecord: Awaited<ReturnType<typeof verifySessionAccessByManagedId>>;
  try {
    sessionRecord = await verifySessionAccessByManagedId(id);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Session not found' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const sessionDbId = sessionRecord.id;
  const sessionRequestId = sessionRecord.requestId;
  const client = getAnthropicClient();

  try {
    const stream = await client.beta.sessions.events.stream(id);
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream as AsyncIterable<BetaManagedAgentsSessionEvent>) {
            // Forward all events to the client SSE stream (including requires_action)
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));

            // Detect session completion or Custom Tool action
            if (event.type === 'session.status_idle') {
              if (event.stop_reason.type === 'end_turn') {
                // Session completed — dispatch to role-based completion handler and break
                handleSessionCompleted(sessionDbId, accessToken).catch(
                  (completionError: unknown) => {
                    console.error(
                      'Session completion handler error:',
                      completionError
                    );
                  }
                );
                break;
              } else if (event.stop_reason.type === 'requires_action') {
                // Custom Tool call — dispatch handler, do NOT break the loop.
                // The session will resume to 'running' after user.custom_tool_result is sent.
                const eventIds = event.stop_reason.event_ids;
                if (eventIds.length > 0) {
                  // The first event ID in event_ids is the custom_tool_use event ID
                  const customToolUseId = eventIds[0];

                  // We need to look up the custom tool use event to get name + input.
                  // The event_ids reference previously streamed agent.custom_tool_use events.
                  // However the stream provides events in order, so we identify the tool
                  // from the event_ids by fetching past events if needed.
                  // For the initial implementation: we read the event from the stream's
                  // already-received events list by looking at the recent stream buffer.
                  // Since the agent.custom_tool_use event comes BEFORE status_idle,
                  // we fetch it from the events API.
                  fetchAndHandleCustomTool(
                    sessionDbId,
                    id, // managedSessionId
                    sessionRequestId,
                    customToolUseId,
                    client
                  ).catch((err: unknown) => {
                    console.error('Custom tool handling error:', err);
                  });
                }
                // Do NOT break — continue listening for future events
              }
            }
          }
        } catch (error) {
          console.error('Stream error:', error);
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', message: errorMessage })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Failed to create stream:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Fetch the agent.custom_tool_use event from the events API and dispatch it
 * to the custom tool handler.
 *
 * The event_ids in requires_action refer to previously emitted agent.custom_tool_use
 * events. We retrieve the event data to get name + input, then dispatch.
 */
async function fetchAndHandleCustomTool(
  sessionDbId: number,
  managedSessionId: string,
  sessionRequestId: number,
  customToolUseId: string,
  client: ReturnType<typeof import('@/lib/anthropic').getAnthropicClient>
): Promise<void> {
  // List recent session events to find the custom_tool_use event by ID
  const eventsPage = await client.beta.sessions.events.list(managedSessionId, {
    limit: 50,
  });

  const toolUseEvent = eventsPage.data.find(
    (e) => e.id === customToolUseId && e.type === 'agent.custom_tool_use'
  );

  if (!toolUseEvent || toolUseEvent.type !== 'agent.custom_tool_use') {
    // Cannot find the event — send error result to prevent session hanging
    await client.beta.sessions.events.send(managedSessionId, {
      events: [
        {
          type: 'user.custom_tool_result',
          custom_tool_use_id: customToolUseId,
          content: [
            {
              type: 'text',
              text: `Custom tool event not found for ID: ${customToolUseId}`,
            },
          ],
        },
      ],
    });
    return;
  }

  await handleCustomToolUse(sessionDbId, managedSessionId, sessionRequestId, {
    customToolUseId: toolUseEvent.id,
    name: toolUseEvent.name,
    input: toolUseEvent.input as Record<string, unknown>,
  });
}
