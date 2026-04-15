import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient, getGitHubToken } from '@/lib/anthropic';
import { storeSession, listSessions } from '@/lib/store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, environmentId, repositoryUrl, mountPath } = body;

    if (!agentId || !environmentId) {
      return NextResponse.json(
        { error: 'agentId and environmentId are required' },
        { status: 400 }
      );
    }

    const client = getAnthropicClient();

    const resources: Parameters<typeof client.beta.sessions.create>[0]['resources'] = [];

    if (repositoryUrl) {
      const githubToken = getGitHubToken();
      resources.push({
        type: 'github_repository',
        url: repositoryUrl,
        authorization_token: githubToken,
        mount_path: mountPath || undefined,
      });
    }

    const session = await client.beta.sessions.create({
      agent: agentId,
      environment_id: environmentId,
      resources: resources.length > 0 ? resources : undefined,
    });

    const stored = storeSession(session, repositoryUrl);

    return NextResponse.json(stored, { status: 201 });
  } catch (error) {
    console.error('Failed to create session:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const sessions = listSessions();
    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Failed to list sessions:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
