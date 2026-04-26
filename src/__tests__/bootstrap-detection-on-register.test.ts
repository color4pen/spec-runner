/**
 * Tests for bootstrap detection on registerRepository
 * Covers: TC-001 to TC-009 (must priority)
 *
 * Strategy:
 * - TC-001 to TC-007: mock globalThis.fetch to control detectBootstrapStatus behavior
 *   (getFileContent/getDirectoryContents in github-api.ts use fetch internally).
 *   The GitHub repo access verification fetch is also mocked per-test.
 * - TC-008, TC-009: verify DB record bootstrap_status via createTestDb
 *
 * constraints.md: "テストは DB 制約に依存せず、アプリ層のバリデーション関数を直接検証する"
 * constraints.md: "テストケースは end-to-end の呼び出しフローをカバーし、関数定義と呼び出し元の接続を検証する"
 * constraints.md: "ソースコード静的解析テスト（toContain）は指示系（directive）チェックに限定し、
 *   ビジネスロジックはモックを使った振る舞いテストで検証する"
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { createTestDb } from './test-db';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import path from 'path';

// ============================================================
// Module-level mocks (hoisted)
// ============================================================

mock.module('@/lib/auth', () => ({
  auth: mock(() =>
    Promise.resolve({
      user: {
        id: '1',
        dbId: 1,
        githubId: 12345,
        name: 'testuser',
        email: 'test@test.com',
        image: null,
      },
      accessToken: 'gho_test_token',
    })
  ),
  signIn: mock(),
  signOut: mock(),
  handlers: { GET: mock(), POST: mock() },
}));

mock.module('next/cache', () => ({
  revalidatePath: mock(),
}));

// ============================================================
// DB mock: use an in-memory DB per test
// ============================================================

let currentTestDb: ReturnType<typeof createTestDb>['db'] | null = null;

mock.module('@/lib/db', () => ({
  getDb: () => {
    if (!currentTestDb) {
      const { db } = createTestDb();
      currentTestDb = db;
    }
    return currentTestDb;
  },
}));

beforeEach(() => {
  currentTestDb = null;
});

// ============================================================
// Helpers
// ============================================================

/**
 * Seed a user in the current test DB.
 * Must be called after currentTestDb is reset so getDb() returns the seeded DB.
 */
function seedUser(): ReturnType<typeof createTestDb>['db'] {
  const { db } = createTestDb();
  currentTestDb = db;
  db.insert(schema.users).values({
    id: 1,
    githubId: 12345,
    githubLogin: 'testuser',
    githubAvatarUrl: 'https://avatar.png',
  }).run();
  return db;
}

/**
 * Build a fetch mock that returns different responses based on the URL.
 *
 * - URL contains `/repos/owner/repo` and NOT `/contents/` → returns GitHub repo metadata
 * - URL contains `/contents/openspec/project.md` → returns `projectMdResponse`
 * - URL contains `/contents/requests/active/` → returns `activeDirResponse`
 */
function makeFetchMock(options: {
  projectMdResponse: { ok: boolean; status: number; body?: unknown };
  activeDirResponse: { ok: boolean; status: number; body?: unknown };
  defaultBranch?: string;
}) {
  const { projectMdResponse, activeDirResponse, defaultBranch = 'main' } = options;

  return mock((url: string) => {
    const urlStr = String(url);

    // Repo metadata call (access verification)
    if (!urlStr.includes('/contents/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ default_branch: defaultBranch }),
      } as Partial<Response>);
    }

    // openspec/project.md
    if (urlStr.includes('openspec%2Fproject.md') || urlStr.includes('openspec/project.md')) {
      const base64Content = Buffer.from('# OpenSpec Project', 'utf-8').toString('base64');
      return Promise.resolve({
        ok: projectMdResponse.ok,
        status: projectMdResponse.status,
        json: () =>
          Promise.resolve(
            projectMdResponse.ok
              ? { content: base64Content, encoding: 'base64' }
              : {}
          ),
      } as Partial<Response>);
    }

    // requests/active/ directory
    if (urlStr.includes('requests%2Factive') || urlStr.includes('requests/active')) {
      return Promise.resolve({
        ok: activeDirResponse.ok,
        status: activeDirResponse.status,
        json: () =>
          Promise.resolve(
            activeDirResponse.ok
              ? (activeDirResponse.body ?? [{ name: 'req.md', path: 'requests/active/req.md', type: 'file', size: 50 }])
              : {}
          ),
      } as Partial<Response>);
    }

    // Fallback: unknown URL
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    } as Partial<Response>);
  }) as unknown as typeof fetch;
}

// ============================================================
// TC-001: 両ファイルが存在する場合に ready を返す
// ============================================================

describe('TC-001: detectBootstrapStatus — both files exist → ready', () => {
  test('registerRepository inserts bootstrap_status: ready when both files exist', async () => {
    const db = seedUser();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = makeFetchMock({
        projectMdResponse: { ok: true, status: 200 },
        activeDirResponse: { ok: true, status: 200 },
      });

      const { registerRepository } = await import('@/lib/repository-registration-actions');
      const result = await registerRepository('owner', 'repo');

      expect(result.bootstrapStatus).toBe('ready');

      const [record] = db.select().from(schema.repositories).where(eq(schema.repositories.fullName, 'owner/repo')).all();
      expect(record.bootstrapStatus).toBe('ready');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================
// TC-002: openspec/project.md が存在しない場合に uninitialized を返す
// ============================================================

describe('TC-002: detectBootstrapStatus — project.md absent → uninitialized', () => {
  test('registerRepository inserts bootstrap_status: uninitialized when project.md returns 404', async () => {
    seedUser();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = makeFetchMock({
        projectMdResponse: { ok: false, status: 404 },
        activeDirResponse: { ok: true, status: 200 },
      });

      const { registerRepository } = await import('@/lib/repository-registration-actions');
      const result = await registerRepository('owner', 'repo2');

      expect(result.bootstrapStatus).toBe('uninitialized');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================
// TC-003: requests/active/ が存在しない場合に uninitialized を返す
// ============================================================

describe('TC-003: detectBootstrapStatus — requests/active/ empty → uninitialized', () => {
  test('registerRepository inserts bootstrap_status: uninitialized when activeDir is empty', async () => {
    seedUser();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = makeFetchMock({
        projectMdResponse: { ok: true, status: 200 },
        activeDirResponse: { ok: false, status: 404 },
      });

      const { registerRepository } = await import('@/lib/repository-registration-actions');
      const result = await registerRepository('owner', 'repo3');

      expect(result.bootstrapStatus).toBe('uninitialized');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================
// TC-004: 両ファイルとも存在しない場合に uninitialized を返す
// ============================================================

describe('TC-004: detectBootstrapStatus — both absent → uninitialized', () => {
  test('registerRepository inserts bootstrap_status: uninitialized when both return 404', async () => {
    seedUser();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = makeFetchMock({
        projectMdResponse: { ok: false, status: 404 },
        activeDirResponse: { ok: false, status: 404 },
      });

      const { registerRepository } = await import('@/lib/repository-registration-actions');
      const result = await registerRepository('owner', 'repo4');

      expect(result.bootstrapStatus).toBe('uninitialized');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================
// TC-005: getFileContent がエラーをスローした場合に uninitialized を返す
// ============================================================

describe('TC-005: detectBootstrapStatus — getFileContent throws → uninitialized (no re-throw)', () => {
  test('registerRepository does not re-throw; returns uninitialized on network error for project.md', async () => {
    seedUser();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = mock((url: string) => {
        const urlStr = String(url);
        if (!urlStr.includes('/contents/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ default_branch: 'main' }),
          } as Partial<Response>);
        }
        // Both contents calls throw (simulates network failure caught by Promise.all)
        return Promise.reject(new Error('Network error'));
      }) as unknown as typeof fetch;

      const { registerRepository } = await import('@/lib/repository-registration-actions');
      // Must not throw
      const result = await registerRepository('owner', 'repo5');

      expect(result.bootstrapStatus).toBe('uninitialized');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================
// TC-006: getDirectoryContents がエラーをスローした場合に uninitialized を返す
// ============================================================

describe('TC-006: detectBootstrapStatus — getDirectoryContents throws → uninitialized (no re-throw)', () => {
  test('registerRepository does not re-throw; returns uninitialized when rate limit error from activeDir', async () => {
    seedUser();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = mock((url: string) => {
        const urlStr = String(url);
        if (!urlStr.includes('/contents/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ default_branch: 'main' }),
          } as Partial<Response>);
        }
        // Return 500 for all contents calls → getDirectoryContents throws (non-404 error)
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({}),
        } as Partial<Response>);
      }) as unknown as typeof fetch;

      const { registerRepository } = await import('@/lib/repository-registration-actions');
      // Must not throw — safe fallback to uninitialized
      const result = await registerRepository('owner', 'repo6');

      expect(result.bootstrapStatus).toBe('uninitialized');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================
// TC-007: 両 API 呼び出しが並列で実行される
// ============================================================

describe('TC-007: detectBootstrapStatus — both API calls are invoked', () => {
  test('getFileContent and getDirectoryContents both called (Promise.all structure)', async () => {
    seedUser();
    const originalFetch = globalThis.fetch;

    const calledUrls: string[] = [];

    try {
      globalThis.fetch = mock((url: string) => {
        const urlStr = String(url);
        calledUrls.push(urlStr);

        if (!urlStr.includes('/contents/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ default_branch: 'main' }),
          } as Partial<Response>);
        }

        if (urlStr.includes('openspec%2Fproject.md') || urlStr.includes('openspec/project.md')) {
          const base64 = Buffer.from('content', 'utf-8').toString('base64');
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ content: base64, encoding: 'base64' }),
          } as Partial<Response>);
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([{ name: 'req.md', path: 'requests/active/req.md', type: 'file', size: 50 }]),
        } as Partial<Response>);
      }) as unknown as typeof fetch;

      const { registerRepository } = await import('@/lib/repository-registration-actions');
      await registerRepository('owner', 'repo7');

      // Verify that both contents paths were fetched
      const contentUrls = calledUrls.filter((u) => u.includes('/contents/'));
      expect(contentUrls.length).toBe(2);

      const hasProjectMd = contentUrls.some(
        (u) => u.includes('openspec%2Fproject.md') || u.includes('openspec/project.md')
      );
      const hasActiveDir = contentUrls.some(
        (u) => u.includes('requests%2Factive') || u.includes('requests/active')
      );
      expect(hasProjectMd).toBe(true);
      expect(hasActiveDir).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================
// TC-008: bootstrap 済みリポジトリが ready で INSERT される
// ============================================================

describe('TC-008: registerRepository — bootstrapped repo inserted with ready', () => {
  test('DB record has bootstrap_status: ready when both indicators exist', async () => {
    const db = seedUser();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = makeFetchMock({
        projectMdResponse: { ok: true, status: 200 },
        activeDirResponse: { ok: true, status: 200 },
      });

      const { registerRepository } = await import('@/lib/repository-registration-actions');
      await registerRepository('owner', 'repo8');

      const [record] = db
        .select()
        .from(schema.repositories)
        .where(eq(schema.repositories.fullName, 'owner/repo8'))
        .all();

      expect(record).toBeDefined();
      expect(record.bootstrapStatus).toBe('ready');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================
// TC-009: 未セットアップリポジトリが uninitialized で INSERT される
// ============================================================

describe('TC-009: registerRepository — unsetup repo inserted with uninitialized', () => {
  test('DB record has bootstrap_status: uninitialized when indicators absent', async () => {
    const db = seedUser();
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = makeFetchMock({
        projectMdResponse: { ok: false, status: 404 },
        activeDirResponse: { ok: false, status: 404 },
      });

      const { registerRepository } = await import('@/lib/repository-registration-actions');
      await registerRepository('owner', 'repo9');

      const [record] = db
        .select()
        .from(schema.repositories)
        .where(eq(schema.repositories.fullName, 'owner/repo9'))
        .all();

      expect(record).toBeDefined();
      expect(record.bootstrapStatus).toBe('uninitialized');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================
// Static source analysis: verify import and Promise.all structure
// (constraints.md: static analysis tests limited to directive checks only)
// ============================================================

describe('Static: repository-registration-actions.ts imports github-api', () => {
  test('imports getFileContent and getDirectoryContents from ./github-api', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/repository-registration-actions.ts')
    ).text();
    expect(source).toContain("from './github-api'");
    expect(source).toContain('getFileContent');
    expect(source).toContain('getDirectoryContents');
  });

  test('uses Promise.all for parallel API calls', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/repository-registration-actions.ts')
    ).text();
    expect(source).toContain('Promise.all');
  });

  test('detectBootstrapStatus is defined with try-catch for safe fallback', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/repository-registration-actions.ts')
    ).text();
    expect(source).toContain('detectBootstrapStatus');
    expect(source).toContain('try {');
    expect(source).toContain("return 'uninitialized'");
  });
});
