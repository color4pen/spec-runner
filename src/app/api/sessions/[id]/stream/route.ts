import { NextRequest } from 'next/server';
import { getAnthropicClient } from '@/lib/anthropic';
import { auth } from '@/lib/auth';
import { verifySessionAccessByManagedId } from '@/lib/session-actions';
import { handleSessionCompleted } from '@/lib/session-completion-handler';
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
  const client = getAnthropicClient();

  try {
    const stream = await client.beta.sessions.events.stream(id);
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream as AsyncIterable<BetaManagedAgentsSessionEvent>) {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));

            // Detect session completion: session.status_idle + end_turn stop_reason
            if (event.type === 'session.status_idle') {
              if (event.stop_reason.type === 'end_turn') {
                // Dispatch completion to role-based handler (bootstrap-specific logic
                // is encapsulated in session-completion-handler, not here)
                handleSessionCompleted(sessionDbId, accessToken).catch(
                  (completionError: unknown) => {
                    console.error(
                      'Session completion handler error:',
                      completionError
                    );
                  }
                );
                break;
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
