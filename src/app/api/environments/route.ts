import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/anthropic';
import { storeEnvironment, listEnvironments } from '@/lib/store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const client = getAnthropicClient();

    const environment = await client.beta.environments.create({
      name,
      config: {
        type: 'cloud',
        networking: {
          type: 'limited',
          allow_package_managers: true,
          allowed_hosts: ['github.com', 'api.github.com'],
        },
        packages: {
          npm: ['@anthropic-ai/claude-code'],
        },
      },
    });

    const stored = storeEnvironment(environment);

    return NextResponse.json(stored, { status: 201 });
  } catch (error) {
    console.error('Failed to create environment:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const environments = listEnvironments();
    return NextResponse.json(environments);
  } catch (error) {
    console.error('Failed to list environments:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
