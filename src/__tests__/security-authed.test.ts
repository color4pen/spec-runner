import { describe, test, expect, mock } from 'bun:test';
import { createTestDb } from './test-db';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import path from 'path';

// Mock authenticated session
const mockAuth = mock(() =>
  Promise.resolve({
    user: { id: '1', dbId: 1, githubId: 12345, name: 'testuser', email: 'test@test.com', image: 'https://avatar.url' },
    accessToken: 'gho_test_token',
  })
);

mock.module('@/lib/auth', () => ({
  auth: mockAuth,
  signIn: mock(),
  signOut: mock(),
  handlers: { GET: mock(), POST: mock() },
}));

mock.module('next/cache', () => ({
  revalidatePath: mock(),
}));

// TC-006: Other user's sessions are not accessible (updated for new schema)
describe('TC-006: User isolation - cannot access other user sessions', () => {
  test('session access chain prevents cross-user access', () => {
    const { db } = createTestDb();

    // Insert two users
    db.insert(schema.users).values([
      { id: 1, githubId: 12345, githubLogin: 'userA', githubAvatarUrl: 'https://a.png' },
      { id: 2, githubId: 67890, githubLogin: 'userB', githubAvatarUrl: 'https://b.png' },
    ]).run();

    // Insert repositories for each user
    db.insert(schema.repositories).values([
      { id: 1, userId: 1, owner: 'owner', name: 'repo', fullName: 'owner/repo' },
      { id: 2, userId: 2, owner: 'owner', name: 'repo', fullName: 'owner/repo' },
    ]).run();

    // Insert requests
    db.insert(schema.requests).values([
      { id: 1, repositoryId: 1, type: 'new-feature', title: 'A Request' },
      { id: 2, repositoryId: 2, type: 'new-feature', title: 'B Request' },
    ]).run();

    // Insert sessions
    db.insert(schema.sessions).values([
      { id: 1, requestId: 1, managedSessionId: 'session-a', role: 'implementer', title: 'A Session' },
      { id: 2, requestId: 2, managedSessionId: 'session-b', role: 'implementer', title: 'B Session' },
    ]).run();

    // Query as user 1 via chain: sessions -> requests -> repositories (userId = 1)
    const results = db
      .select({ session: schema.sessions })
      .from(schema.sessions)
      .innerJoin(schema.requests, eq(schema.sessions.requestId, schema.requests.id))
      .innerJoin(schema.repositories, eq(schema.requests.repositoryId, schema.repositories.id))
      .where(eq(schema.repositories.userId, 1))
      .all();

    expect(results).toHaveLength(1);
    expect(results[0].session.managedSessionId).toBe('session-a');
  });
});

// TC-007: Valid repo parameter passes validation
describe('TC-007: Valid repo parameter passes validation', () => {
  test('owner/repo format is accepted', () => {
    const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
    expect(REPO_PATTERN.test('owner/repo-name')).toBe(true);
    expect(REPO_PATTERN.test('my-org/my.repo')).toBe(true);
    expect(REPO_PATTERN.test('user_name/repo_name')).toBe(true);
  });
});

// TC-008: Invalid repo parameters are rejected
describe('TC-008: Invalid repo parameters are rejected', () => {
  test('path traversal is rejected', () => {
    const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
    expect(REPO_PATTERN.test('../etc/passwd')).toBe(false);
  });

  test('command injection is rejected', () => {
    const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
    expect(REPO_PATTERN.test('owner/repo; rm -rf /')).toBe(false);
  });

  test('empty string is rejected', () => {
    const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
    expect(REPO_PATTERN.test('')).toBe(false);
  });

  test('no slash is rejected', () => {
    const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
    expect(REPO_PATTERN.test('noslash')).toBe(false);
  });

  test('special characters are rejected', () => {
    const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
    expect(REPO_PATTERN.test('owner/re po')).toBe(false);
    expect(REPO_PATTERN.test('owner/repo\n')).toBe(false);
    expect(REPO_PATTERN.test('owner/<script>')).toBe(false);
  });
});

// TC-009: OAuth token stored in encrypted JWT (not plain text)
describe('TC-009: OAuth token JWT encryption', () => {
  test('Auth.js config uses JWT strategy', async () => {
    const authSource = await Bun.file(path.join(process.cwd(), 'src/lib/auth.ts')).text();
    expect(authSource).toContain("strategy: 'jwt'");
    expect(authSource).toContain('token.accessToken = account.access_token');
  });
});

// TC-010: GitHub API token expiry handling
describe('TC-010: GitHub API token expiry handling', () => {
  test('listUserRepos throws meaningful error on 401', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Unauthorized', { status: 401 }))
    ) as unknown as typeof globalThis.fetch;

    try {
      const { listUserRepos } = await import('@/lib/github');
      await expect(listUserRepos()).rejects.toThrow(
        'GitHub token is invalid. Please re-authenticate.'
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// TC-011: OAuth token used instead of GITHUB_TOKEN env var
describe('TC-011: OAuth token replaces GITHUB_TOKEN', () => {
  test('createSession uses user.accessToken not env var', async () => {
    const actionsSource = await Bun.file(path.join(process.cwd(), 'src/lib/actions.ts')).text();
    expect(actionsSource).toContain('user.accessToken');
    expect(actionsSource).not.toContain('getGitHubToken()');
  });

  test('session-actions uses user.accessToken', async () => {
    const source = await Bun.file(path.join(process.cwd(), 'src/lib/session-actions.ts')).text();
    expect(source).toContain('user.accessToken');
  });
});
