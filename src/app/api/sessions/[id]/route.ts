import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/anthropic';
import { deleteSession, getSession, updateSessionStatus } from '@/lib/store';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = getSession(id);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Optionally fetch fresh status from API
    try {
      const client = getAnthropicClient();
      const apiSession = await client.beta.sessions.retrieve(id);
      updateSessionStatus(id, apiSession.status);
      session.status = apiSession.status;
    } catch {
      // If API call fails, return cached data
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error('Failed to get session:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const client = getAnthropicClient();

    // Delete from API
    await client.beta.sessions.delete(id);

    // Delete from local store
    deleteSession(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete session:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
