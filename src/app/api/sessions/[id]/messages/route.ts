import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/anthropic';
import { getSession } from '@/lib/store';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const session = getSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const client = getAnthropicClient();

    const result = await client.beta.sessions.events.send(id, {
      events: [
        {
          type: 'user.message',
          content: [{ type: 'text', text: message }],
        },
      ],
    });

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error('Failed to send message:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
