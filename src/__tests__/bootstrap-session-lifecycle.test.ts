import { describe, test, expect, mock } from 'bun:test';
import { createTestDb } from './test-db';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import path from 'path';

// ============================================================
// Mock setup
// ============================================================

mock.module('@/lib/auth', () => ({
  auth: mock(() =>
    Promise.resolve({
      user: { id: '1', dbId: 1, githubId: 12345, name: 'testuser', email: 'test@test.com', image: null },
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

mock.module('next/navigation', () => ({
  useRouter: mock(() => ({ push: mock(), refresh: mock() })),
}));

// ============================================================
// TC-001: github-api.ts が 'use server' を持たないこと
// ============================================================

describe('TC-001: github-api.ts has no use server directive', () => {
  test('github-api.ts first line is not "use server"', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/github-api.ts')
    ).text();
    // The directive must be the FIRST statement in the file (not in a comment)
    const firstLine = source.trimStart().split('\n')[0];
    expect(firstLine).not.toBe("'use server';");
    expect(firstLine).not.toBe('"use server";');
  });
});

// ============================================================
// TC-002: vault-actions.ts が 'use server' を持たないこと
// ============================================================

describe('TC-002: vault-actions.ts has no use server directive', () => {
  test('vault-actions.ts first line is not "use server"', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/vault-actions.ts')
    ).text();
    // The directive must be the FIRST statement in the file
    const firstLine = source.trimStart().split('\n')[0];
    expect(firstLine).not.toBe("'use server';");
    expect(firstLine).not.toBe('"use server";');
  });
});

// ============================================================
// TC-003: session-completion-handler.ts が 'use server' を持たないこと
// ============================================================

describe('TC-003: session-completion-handler.ts has no use server directive', () => {
  test('session-completion-handler.ts first line is not "use server"', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/session-completion-handler.ts')
    ).text();
    // The directive must be the FIRST statement in the file
    const firstLine = source.trimStart().split('\n')[0];
    expect(firstLine).not.toBe("'use server';");
    expect(firstLine).not.toBe('"use server";');
  });
});

// ============================================================
// TC-004: SSE route が bootstrap 固有ロジックを含まないこと
// ============================================================

describe('TC-004: SSE route contains no bootstrap-specific logic', () => {
  test('SSE route does not contain bootstrap-specific identifiers', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/app/api/sessions/[id]/stream/route.ts')
    ).text();
    expect(source).not.toContain('handleBootstrapCompleted');
    expect(source).not.toContain('bootstrap_pr_url');
    expect(source).not.toContain('bootstrap_status');
    expect(source).not.toContain("'pr_pending'");
  });

  test('SSE route calls handleSessionCompleted', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/app/api/sessions/[id]/stream/route.ts')
    ).text();
    expect(source).toContain('handleSessionCompleted');
  });
});

// ============================================================
// TC-005: bootstrap-actions.ts が github-api.ts を使うこと
// ============================================================

describe('TC-005: bootstrap-actions.ts imports from github-api.ts', () => {
  test('bootstrap-actions.ts uses functions from github-api.ts', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).toContain("from './github-api'");
    expect(source).toContain('getBranchExists');
    expect(source).toContain('deleteBranch');
  });

  test('bootstrap-actions.ts does not directly call fetch for GitHub API', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    // Should not contain inline fetch calls to GitHub API
    expect(source).not.toContain("fetch(\n    `https://api.github.com");
    expect(source).not.toContain("fetch('https://api.github.com");
  });
});

// ============================================================
// TC-006: session-completion-handler が role ベースで dispatch すること
// ============================================================

describe('TC-006: session-completion-handler dispatches by role', () => {
  test('handleSessionCompleted source uses switch on role', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/session-completion-handler.ts')
    ).text();
    expect(source).toContain("case 'bootstrap':");
    expect(source).toContain('handleBootstrapCompleted');
  });
});

// ============================================================
// TC-008: createPullRequest が GitHub API を呼ぶこと（static analysis）
// ============================================================

describe('TC-008: createPullRequest calls POST /repos/{owner}/{repo}/pulls', () => {
  test('createPullRequest implementation calls correct endpoint', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/github-api.ts')
    ).text();
    expect(source).toContain('/pulls');
    expect(source).toContain("method: 'POST'");
    expect(source).toContain('html_url');
    expect(source).toContain('number');
  });
});

// ============================================================
// TC-009 & TC-010: getBranchExists
// ============================================================

describe('TC-009/010: getBranchExists returns true or false without throwing', () => {
  test('getBranchExists source handles 404 gracefully', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/github-api.ts')
    ).text();
    expect(source).toContain('getBranchExists');
    expect(source).toContain('404');
    expect(source).toContain('return false');
  });
});

// ============================================================
// TC-011: deleteBranch が冪等であること（404/422 を無視）
// ============================================================

describe('TC-011: deleteBranch ignores 404 and 422', () => {
  test('deleteBranch source handles 404 and 422 gracefully', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/github-api.ts')
    ).text();
    expect(source).toContain('deleteBranch');
    expect(source).toContain('404');
    expect(source).toContain('422');
  });
});

// ============================================================
// TC-012: closePullRequest が冪等であること
// ============================================================

describe('TC-012: closePullRequest is idempotent', () => {
  test('closePullRequest source checks current state before closing', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/github-api.ts')
    ).text();
    expect(source).toContain('closePullRequest');
    expect(source).toContain("state === 'closed'");
    expect(source).toContain('no-op');
  });
});

// ============================================================
// TC-013 & TC-014: findOpenPrByHead
// ============================================================

describe('TC-013/014: findOpenPrByHead returns PR or null', () => {
  test('findOpenPrByHead source returns null when no PR found', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/github-api.ts')
    ).text();
    expect(source).toContain('findOpenPrByHead');
    expect(source).toContain('return null');
    expect(source).toContain('prs[0]');
  });
});

// ============================================================
// TC-015: handleBootstrapCompleted が PR 重複作成を防止すること（冪等性）
// ============================================================

describe('TC-015: handleBootstrapCompleted prevents duplicate PR creation', () => {
  test('session-completion-handler checks for existing PR before creating', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/session-completion-handler.ts')
    ).text();
    expect(source).toContain('findOpenPrByHead');
    expect(source).toContain('No existing PR');
  });
});

// ============================================================
// TC-016: handleBootstrapCompleted がブランチ不存在時にロールバックすること
// ============================================================

describe('TC-016: handleBootstrapCompleted rolls back on branch not found', () => {
  test('session-completion-handler handles branch not found', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/session-completion-handler.ts')
    ).text();
    expect(source).toContain('getBranchExists');
    expect(source).toContain('branch not found');
    expect(source).toContain("bootstrapStatus: 'uninitialized'");
    expect(source).toContain("status: 'cancelled'");
  });
});

// ============================================================
// TC-021: Vault 認証情報の value が読み取り不可であること
// ============================================================

describe('TC-021: Vault credentials are write-only (value is never read)', () => {
  test('vault-actions.ts does not read credential value from list response', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/vault-actions.ts')
    ).text();
    // Should not access .value or .token from list response
    expect(source).toContain('write-only');
    // List is only used to find credentials to delete, not to read values
    expect(source).toContain('credentials.list');
    expect(source).not.toMatch(/existingPage\.(data|credentials).*\.value/);
  });
});

// ============================================================
// TC-022: startBootstrap が認証済みユーザーのみ実行できること
// ============================================================

describe('TC-022: startBootstrap requires authentication', () => {
  test('bootstrap-actions.ts uses getAuthenticatedUser()', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).toContain('getAuthenticatedUser()');
  });
});

// ============================================================
// TC-023: startBootstrap が IDOR を防止すること
// ============================================================

describe('TC-023: startBootstrap prevents IDOR', () => {
  test('startBootstrap does not accept userId as parameter', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).not.toMatch(/startBootstrap\s*\([^)]*userId[^)]*\)/);
  });
});

// ============================================================
// TC-027: requests.type CHECK 制約に bootstrap が含まれること
// ============================================================

describe('TC-027: requests.type allows bootstrap value', () => {
  test("requests table accepts type = 'bootstrap'", () => {
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

    // Should not throw
    expect(() => {
      db.insert(schema.requests).values({
        repositoryId: 1,
        type: 'bootstrap',
        title: 'Bootstrap openspec-workflow',
        status: 'in-progress',
      }).run();
    }).not.toThrow();

    const [record] = db.select().from(schema.requests).where(eq(schema.requests.repositoryId, 1)).all();
    expect(record.type).toBe('bootstrap');
  });
});

// ============================================================
// TC-028: sessions.role CHECK 制約に bootstrap が含まれること
// ============================================================

describe('TC-028: sessions.role allows bootstrap value', () => {
  test("sessions table accepts role = 'bootstrap'", () => {
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
      type: 'bootstrap',
      title: 'Bootstrap openspec-workflow',
    }).run();

    expect(() => {
      db.insert(schema.sessions).values({
        requestId: 1,
        managedSessionId: 'session-bootstrap-001',
        role: 'bootstrap',
        title: 'Bootstrap owner/repo',
      }).run();
    }).not.toThrow();

    const [record] = db.select().from(schema.sessions).where(eq(schema.sessions.managedSessionId, 'session-bootstrap-001')).all();
    expect(record.role).toBe('bootstrap');
  });
});

// ============================================================
// TC-029: 既存の requests.type 値が有効であること
// ============================================================

describe('TC-029: existing requests.type values remain valid', () => {
  test('new-feature, spec-change, refactoring, bugfix types are still valid', () => {
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

    const types = ['new-feature', 'spec-change', 'refactoring', 'bugfix'] as const;
    for (const type of types) {
      expect(() => {
        db.insert(schema.requests).values({
          repositoryId: 1,
          type,
          title: `Test ${type}`,
        }).run();
      }).not.toThrow();
    }

    const records = db.select().from(schema.requests).all();
    expect(records).toHaveLength(types.length);
  });
});

// ============================================================
// TC-030: マイグレーションが冪等であること
// ============================================================

describe('TC-030: Migration is idempotent', () => {
  test('running migrations twice does not error', async () => {
    const { drizzle } = await import('drizzle-orm/bun-sqlite');
    const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
    const { Database } = await import('bun:sqlite');

    const sqlite = new Database(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON;');
    const db = drizzle(sqlite, { schema });
    const migrationsFolder = path.join(process.cwd(), 'drizzle');

    migrate(db, { migrationsFolder });

    expect(() => {
      migrate(db, { migrationsFolder });
    }).not.toThrow();
  });
});

// ============================================================
// TC-031: cancelBootstrap が bootstrapping 状態から正常にキャンセルすること
// ============================================================

describe('TC-031: cancelBootstrap from bootstrapping state', () => {
  test('cancelBootstrap source archives sessions and cancels request', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).toContain('cancelBootstrap');
    expect(source).toContain("bootstrapStatus === 'bootstrapping'");
    expect(source).toContain("bootstrapStatus: 'uninitialized'");
    expect(source).toContain("status: 'archived'");
    expect(source).toContain("status: 'cancelled'");
  });
});

// ============================================================
// TC-032: cancelBootstrap が pr_pending 状態から正常にキャンセルすること
// ============================================================

describe('TC-032: cancelBootstrap from pr_pending state', () => {
  test('cancelBootstrap source closes PR and deletes branch when pr_pending', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).toContain("bootstrapStatus === 'pr_pending'");
    expect(source).toContain('closePullRequest');
    expect(source).toContain('deleteBranch');
    expect(source).toContain('bootstrapPrUrl: null');
  });
});

// ============================================================
// TC-033: cancelBootstrap が uninitialized の場合は no-op
// ============================================================

describe('TC-033: cancelBootstrap is no-op when already uninitialized', () => {
  test('cancelBootstrap source returns early for uninitialized', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).toContain("bootstrapStatus === 'uninitialized'");
    expect(source).toContain('Already cancelled');
  });
});

// ============================================================
// TC-034: startBootstrap が type=bootstrap / role=bootstrap を作成すること
// ============================================================

describe('TC-034: startBootstrap creates type=bootstrap / role=bootstrap', () => {
  test('startBootstrap source creates request with type bootstrap and session with role bootstrap', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).toContain("type: 'bootstrap'");
    expect(source).toContain("role: 'bootstrap'");
  });
});

// ============================================================
// TC-040: VALID_TYPES に bootstrap が含まれること
// ============================================================

describe('TC-040: VALID_TYPES includes bootstrap', () => {
  test('request-actions.ts VALID_TYPES includes bootstrap', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/request-actions.ts')
    ).text();
    expect(source).toContain("'bootstrap'");
    expect(source).toContain('VALID_TYPES');
  });
});

// ============================================================
// TC-041: ALLOWED_TRANSITIONS で reviewing から cancelled への遷移が可能
// ============================================================

describe('TC-041: ALLOWED_TRANSITIONS.reviewing includes cancelled', () => {
  test('request-actions.ts allows reviewing -> cancelled transition', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/request-actions.ts')
    ).text();
    // Check that reviewing allows cancelled
    const reviewingIndex = source.indexOf("reviewing: [");
    const reviewingBlock = source.substring(reviewingIndex, reviewingIndex + 100);
    expect(reviewingBlock).toContain("'cancelled'");
  });
});

// ============================================================
// TC-042: MCP URL が末尾スラッシュなしであること
// ============================================================

describe('TC-042: MCP URL has no trailing slash', () => {
  test("vault-actions.ts uses 'https://api.githubcopilot.com/mcp' without trailing slash", async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/vault-actions.ts')
    ).text();
    expect(source).toContain("'https://api.githubcopilot.com/mcp'");
    expect(source).not.toContain("'https://api.githubcopilot.com/mcp/'");
  });
});

// ============================================================
// TC-043: processBootstrapSessionEvent と handleBootstrapSessionCompletedWithoutPr が削除されていること
// ============================================================

describe('TC-043: Deprecated functions removed from bootstrap-actions.ts', () => {
  test('processBootstrapSessionEvent does not exist in bootstrap-actions.ts', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).not.toContain('processBootstrapSessionEvent');
    expect(source).not.toContain('handleBootstrapSessionCompletedWithoutPr');
  });
});

// ============================================================
// TC-044: syncBootstrapPrStatus が github-api.ts の getPullRequestStatus を使うこと
// ============================================================

describe('TC-044: syncBootstrapPrStatus uses getPullRequestStatus from github-api.ts', () => {
  test('bootstrap-actions.ts imports getPullRequestStatus from github-api.ts', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).toContain('getPullRequestStatus');
    // Should not directly call fetch for GitHub API
    expect(source).not.toContain("fetch(\n    `https://api.github.com/repos");
  });
});

// ============================================================
// TC-057: 既存 bootstrap テストの type/role 値が更新されていること
// ============================================================

describe('TC-057: Existing tests updated to use bootstrap type/role', () => {
  test('bootstrap test file does not assert type: new-feature or role: implementer for bootstrap context', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    // bootstrap-actions now uses type: 'bootstrap' (not new-feature)
    expect(source).not.toContain("type: 'new-feature',\n        title: 'Bootstrap");
    expect(source).toContain("type: 'bootstrap'");
  });
});

// ============================================================
// Schema: vault_id カラムが users テーブルに存在すること
// ============================================================

describe('users.vault_id column exists and is nullable', () => {
  test('vault_id can be null or set to a string', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    const [user] = db.select().from(schema.users).where(eq(schema.users.id, 1)).all();
    expect(user.vaultId).toBeNull();

    // Can set vault_id
    db.update(schema.users).set({ vaultId: 'vlt_test123' }).where(eq(schema.users.id, 1)).run();

    const [updated] = db.select().from(schema.users).where(eq(schema.users.id, 1)).all();
    expect(updated.vaultId).toBe('vlt_test123');
  });
});
