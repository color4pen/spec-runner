import { NextRequest } from 'next/server';
import { getAnthropicClient } from '@/lib/anthropic';
import { getSession, updateSessionStatus } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = getSession(id);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const client = getAnthropicClient();

  try {
    const stream = await client.beta.sessions.events.stream(id);

    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            // Update session status on status events
            if (event.type === 'session.status_idle') {
              updateSessionStatus(id, 'idle');
            } else if (event.type === 'session.status_running') {
              updateSessionStatus(id, 'running');
            } else if (event.type === 'session.status_terminated') {
              updateSessionStatus(id, 'terminated');
            }

            // Format as SSE
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(data));
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
