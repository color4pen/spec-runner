import { describe, test, expect, mock } from 'bun:test';

// Mock next-auth's auth() to return null (unauthenticated)
const mockAuth = mock(() => Promise.resolve(null));

// Mock the auth module before importing anything that uses it
mock.module('@/lib/auth', () => ({
  auth: mockAuth,
  signIn: mock(),
  signOut: mock(),
  handlers: { GET: mock(), POST: mock() },
}));

// Mock next/cache
mock.module('next/cache', () => ({
  revalidatePath: mock(),
}));

// Mock next/navigation
mock.module('next/navigation', () => ({
  redirect: mock((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

// Mock Anthropic client
mock.module('@/lib/anthropic', () => ({
  getAnthropicClient: mock(() => ({
    beta: {
      agents: { list: mock(), create: mock() },
      environments: { list: mock(), create: mock() },
      sessions: {
        list: mock(),
        create: mock(),
        archive: mock(),
        delete: mock(),
        retrieve: mock(),
        events: {
          send: mock(),
          list: mock(),
          stream: mock(),
        },
      },
    },
  })),
}));

// TC-001: Unauthenticated access to protected pages redirects to login
describe('TC-001: Protected page access redirects when unauthenticated', () => {
  test('(protected)/layout.tsx redirects to /login when no session', async () => {
    // The protected layout checks auth and redirects
    // We test the auth-helpers utility which is the core guard
    const { getAuthenticatedUser } = await import('@/lib/auth-helpers');
    await expect(getAuthenticatedUser()).rejects.toThrow('Authentication required');
  });
});

// TC-002: Unauthenticated SSE endpoint returns 401
describe('TC-002: SSE endpoint returns 401 for unauthenticated requests', () => {
  test('GET /api/sessions/[id]/stream returns 401', async () => {
    const { GET } = await import(
      '@/app/api/sessions/[id]/stream/route'
    );
    const request = new Request('http://localhost:3000/api/sessions/test-id/stream');
    const response = await GET(
      request as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ id: 'test-id' }) }
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Authentication required');
  });
});

// TC-003: Unauthenticated Server Actions are rejected
describe('TC-003: Server Actions reject unauthenticated requests', () => {
  test('createSession rejects without auth', async () => {
    const { createSession } = await import('@/lib/actions');
    await expect(
      createSession({
        agentId: 'agent-1',
        environmentId: 'env-1',
      })
    ).rejects.toThrow('Authentication required');
  });

  test('sendMessage rejects without auth', async () => {
    const { sendMessage } = await import('@/lib/actions');
    await expect(sendMessage('session-1', 'hello')).rejects.toThrow(
      'Authentication required'
    );
  });

  test('listAgents rejects without auth', async () => {
    const { listAgents } = await import('@/lib/actions');
    await expect(listAgents()).rejects.toThrow('Authentication required');
  });

  test('listEnvironments rejects without auth', async () => {
    const { listEnvironments } = await import('@/lib/actions');
    await expect(listEnvironments()).rejects.toThrow('Authentication required');
  });

  test('listSessions rejects without auth', async () => {
    const { listSessions } = await import('@/lib/actions');
    await expect(listSessions()).rejects.toThrow('Authentication required');
  });

  test('archiveSession rejects without auth', async () => {
    const { archiveSession } = await import('@/lib/actions');
    await expect(archiveSession('session-1')).rejects.toThrow(
      'Authentication required'
    );
  });

  test('deleteSession rejects without auth', async () => {
    const { deleteSession } = await import('@/lib/actions');
    await expect(deleteSession('session-1')).rejects.toThrow(
      'Authentication required'
    );
  });
});

// TC-004: Unauthenticated createBoundSession is rejected
describe('TC-004: createBoundSession rejects unauthenticated requests', () => {
  test('createBoundSession rejects without auth', async () => {
    const { createBoundSession } = await import('@/lib/session-actions');
    await expect(
      createBoundSession({
        agentId: 'agent-1',
        environmentId: 'env-1',
        repo: 'owner/repo',
      })
    ).rejects.toThrow('Authentication required');
  });
});

// TC-005: Unauthenticated sendMessage is rejected
describe('TC-005: sendMessage rejects unauthenticated requests', () => {
  test('sendMessage rejects without auth', async () => {
    const { sendMessage } = await import('@/lib/actions');
    await expect(sendMessage('session-1', 'test')).rejects.toThrow(
      'Authentication required'
    );
  });
});
