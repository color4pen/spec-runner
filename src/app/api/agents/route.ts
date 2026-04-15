import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/anthropic';
import { storeAgent, listAgents } from '@/lib/store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, systemPrompt } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const client = getAnthropicClient();

    const agent = await client.beta.agents.create({
      name,
      model: 'claude-sonnet-4-6',
      system: systemPrompt || undefined,
      tools: [{ type: 'agent_toolset_20260401' }],
    });

    const stored = storeAgent(agent);

    return NextResponse.json(stored, { status: 201 });
  } catch (error) {
    console.error('Failed to create agent:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const agents = listAgents();
    return NextResponse.json(agents);
  } catch (error) {
    console.error('Failed to list agents:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
