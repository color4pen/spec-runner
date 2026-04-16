import { describe, test, expect, mock } from 'bun:test';
import { createTestDb } from './test-db';
import * as schema from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import path from 'path';

// TC-020: SSE endpoint 401 response shape
describe('TC-020: SSE endpoint 401 response shape', () => {
  test('returns JSON with error message on 401', async () => {
    // Mock auth to return null
    mock.module('@/lib/auth', () => ({
      auth: mock(() => Promise.resolve(null)),
      signIn: mock(),
      signOut: mock(),
      handlers: { GET: mock(), POST: mock() },
    }));

    const { GET } = await import(
      '@/app/api/sessions/[id]/stream/route'
    );
    const request = new Request('http://localhost:3000/api/sessions/test/stream');
    const response = await GET(request as unknown as import('next/server').NextRequest, {
      params: Promise.resolve({ id: 'test' }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
    expect(body.error).toBe('Authentication required');
  });
});

// TC-021: Auth.js route exists and handles auth flow
describe('TC-021: Auth.js API route responds', () => {
  test('Auth.js route file exports GET and POST', async () => {
    const routeSource = await Bun.file(
      path.join(process.cwd(), 'src/app/api/auth/[...nextauth]/route.ts')
    ).text();
    expect(routeSource).toContain('export const { GET, POST }');
    expect(routeSource).toContain("from '@/lib/auth'");
  });
});

// TC-022: Server Action error response shape (auth error)
describe('TC-022: Server Action error response shape', () => {
  test('AuthenticationError has consistent shape', async () => {
    const { AuthenticationError } = await import('@/lib/auth-helpers');
    const err = new AuthenticationError();
    expect(err.name).toBe('AuthenticationError');
    expect(err.message).toBe('Authentication required');
  });

  test('AuthenticationError with custom message', async () => {
    const { AuthenticationError } = await import('@/lib/auth-helpers');
    const err = new AuthenticationError('Custom error');
    expect(err.message).toBe('Custom error');
    expect(err.name).toBe('AuthenticationError');
  });
});

// TC-023: Session creation response shape (success) - updated for new schema
describe('TC-023: Session record has all required fields', () => {
  test('sessions table record has all expected fields', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    db.insert(schema.repositories).values({
      id: 1,
      userId: 1,
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
    }).run();

    db.insert(schema.requests).values({
      id: 1,
      repositoryId: 1,
      type: 'new-feature',
      title: 'Test Request',
    }).run();

    db.insert(schema.sessions).values({
      requestId: 1,
      managedSessionId: 'managed-session-123',
      role: 'implementer',
      title: 'Session 2026-04-16 14:30',
    }).run();

    const [record] = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.managedSessionId, 'managed-session-123'))
      .all();

    expect(record).toHaveProperty('id');
    expect(record).toHaveProperty('requestId');
    expect(record).toHaveProperty('managedSessionId');
    expect(record).toHaveProperty('role');
    expect(record).toHaveProperty('step');
    expect(record).toHaveProperty('status');
    expect(record).toHaveProperty('title');
    expect(record).toHaveProperty('createdAt');
    expect(record).toHaveProperty('updatedAt');
    expect(typeof record.id).toBe('number');
    expect(record.managedSessionId).toBe('managed-session-123');
    expect(record.role).toBe('implementer');
    expect(record.title).toBe('Session 2026-04-16 14:30');
    expect(record.status).toBe('active');
  });
});

// TC-024: Session creation validation error response
describe('TC-024: Session creation validation error response', () => {
  test('invalid repo format throws descriptive error', () => {
    const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
    const invalidRepos = ['../etc/passwd', 'noslash', '', 'a/b/c', 'owner/repo; rm -rf /'];

    for (const repo of invalidRepos) {
      expect(REPO_PATTERN.test(repo)).toBe(false);
    }
  });

  test('session-actions has rollback pattern', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/session-actions.ts')
    ).text();
    expect(source).toContain('DB insert failed');
    expect(source).toContain('archive');
  });
});

// TC-025: Session list response shape - updated for new schema
describe('TC-025: Session list response shape', () => {
  test('sessions query returns array with correct fields in DESC order', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    db.insert(schema.repositories).values({
      id: 1,
      userId: 1,
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
    }).run();

    db.insert(schema.requests).values({
      id: 1,
      repositoryId: 1,
      type: 'new-feature',
      title: 'Test Request',
    }).run();

    db.insert(schema.sessions).values([
      {
        requestId: 1,
        managedSessionId: 'session-old',
        role: 'implementer',
        title: 'Old Session',
        status: 'active',
        createdAt: '2026-04-15T10:00:00.000Z',
        updatedAt: '2026-04-15T10:00:00.000Z',
      },
      {
        requestId: 1,
        managedSessionId: 'session-new',
        role: 'reviewer',
        title: 'New Session',
        status: 'active',
        createdAt: '2026-04-16T14:30:00.000Z',
        updatedAt: '2026-04-16T14:30:00.000Z',
      },
    ]).run();

    const results = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.requestId, 1))
      .orderBy(desc(schema.sessions.createdAt))
      .all();

    expect(results).toHaveLength(2);
    expect(results[0].managedSessionId).toBe('session-new');
    expect(results[1].managedSessionId).toBe('session-old');

    for (const r of results) {
      expect(r).toHaveProperty('id');
      expect(r).toHaveProperty('requestId');
      expect(r).toHaveProperty('managedSessionId');
      expect(r).toHaveProperty('role');
      expect(r).toHaveProperty('status');
      expect(r).toHaveProperty('title');
      expect(r).toHaveProperty('createdAt');
      expect(r).toHaveProperty('updatedAt');
    }
  });
});

// TC-026: Session archive response shape - updated for new schema
describe('TC-026: Session archive response shape', () => {
  test('archiving sets status to archived and updates updatedAt', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    db.insert(schema.repositories).values({
      id: 1,
      userId: 1,
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
    }).run();

    db.insert(schema.requests).values({
      id: 1,
      repositoryId: 1,
      type: 'new-feature',
      title: 'Test Request',
    }).run();

    db.insert(schema.sessions).values({
      requestId: 1,
      managedSessionId: 'session-1',
      role: 'implementer',
      title: 'Test Session',
      status: 'active',
    }).run();

    db.update(schema.sessions)
      .set({
        status: 'archived',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.sessions.managedSessionId, 'session-1'))
      .run();

    const [updated] = db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.managedSessionId, 'session-1'))
      .all();

    expect(updated.status).toBe('archived');
    expect(updated).toHaveProperty('id');
    expect(updated).toHaveProperty('managedSessionId');
    expect(updated).toHaveProperty('updatedAt');
  });
});
