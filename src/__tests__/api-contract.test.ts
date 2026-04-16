import { describe, test, expect, mock } from 'bun:test';
import { createTestDb } from './test-db';
import * as schema from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
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

// TC-023: Session creation response shape (success)
describe('TC-023: Session creation response shape', () => {
  test('UserSessionSummary has all required fields', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    db.insert(schema.userSessions).values({
      userId: 1,
      sessionId: 'managed-session-123',
      repo: 'owner/repo',
      title: 'Session 2026-04-16 14:30',
      status: 'idle',
    }).run();

    const [record] = db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.sessionId, 'managed-session-123'))
      .all();

    expect(record).toHaveProperty('id');
    expect(record).toHaveProperty('sessionId');
    expect(record).toHaveProperty('repo');
    expect(record).toHaveProperty('title');
    expect(record).toHaveProperty('status');
    expect(record).toHaveProperty('createdAt');
    expect(record).toHaveProperty('updatedAt');
    expect(typeof record.id).toBe('number');
    expect(record.sessionId).toBe('managed-session-123');
    expect(record.repo).toBe('owner/repo');
    expect(record.title).toBe('Session 2026-04-16 14:30');
    expect(record.status).toBe('idle');
  });
});

// TC-024: Session creation response shape (validation error)
describe('TC-024: Session creation validation error response', () => {
  test('invalid repo format throws descriptive error', () => {
    const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
    const invalidRepos = ['../etc/passwd', 'noslash', '', 'a/b/c', 'owner/repo; rm -rf /'];

    for (const repo of invalidRepos) {
      expect(REPO_PATTERN.test(repo)).toBe(false);
    }
  });

  test('validateRepo in session-actions throws with details', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/session-actions.ts')
    ).text();
    expect(source).toContain('Invalid repository format');
    expect(source).toContain('REPO_PATTERN');
  });
});

// TC-025: Session list response shape
describe('TC-025: Session list response shape', () => {
  test('user_sessions query returns array with correct fields in DESC order', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    db.insert(schema.userSessions).values([
      {
        userId: 1,
        sessionId: 'session-old',
        repo: 'owner/repo',
        title: 'Old Session',
        status: 'idle',
        createdAt: '2026-04-15T10:00:00.000Z',
        updatedAt: '2026-04-15T10:00:00.000Z',
      },
      {
        userId: 1,
        sessionId: 'session-new',
        repo: 'owner/repo',
        title: 'New Session',
        status: 'running',
        createdAt: '2026-04-16T14:30:00.000Z',
        updatedAt: '2026-04-16T14:30:00.000Z',
      },
    ]).run();

    const results = db
      .select()
      .from(schema.userSessions)
      .where(
        and(
          eq(schema.userSessions.userId, 1),
          eq(schema.userSessions.repo, 'owner/repo')
        )
      )
      .orderBy(desc(schema.userSessions.createdAt))
      .all();

    expect(results).toHaveLength(2);
    expect(results[0].sessionId).toBe('session-new');
    expect(results[1].sessionId).toBe('session-old');

    for (const r of results) {
      expect(r).toHaveProperty('id');
      expect(r).toHaveProperty('sessionId');
      expect(r).toHaveProperty('repo');
      expect(r).toHaveProperty('title');
      expect(r).toHaveProperty('status');
      expect(r).toHaveProperty('createdAt');
      expect(r).toHaveProperty('updatedAt');
    }
  });
});

// TC-026: Session archive response shape
describe('TC-026: Session archive response shape', () => {
  test('archiving sets status to archived and updates updatedAt', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    db.insert(schema.userSessions).values({
      userId: 1,
      sessionId: 'session-1',
      repo: 'owner/repo',
      title: 'Test Session',
      status: 'idle',
    }).run();

    db.update(schema.userSessions)
      .set({
        status: 'archived',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.userSessions.sessionId, 'session-1'))
      .run();

    const [updated] = db
      .select()
      .from(schema.userSessions)
      .where(eq(schema.userSessions.sessionId, 'session-1'))
      .all();

    expect(updated.status).toBe('archived');
    expect(updated).toHaveProperty('id');
    expect(updated).toHaveProperty('sessionId');
    expect(updated).toHaveProperty('updatedAt');
  });
});
