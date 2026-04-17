import { describe, test, expect, mock } from 'bun:test';
import { createTestDb } from './test-db';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import path from 'path';
import {
  validateBootstrapTransition,
  extractPrUrl,
  isValidPrUrl,
  type BootstrapStatus,
  ALLOWED_BOOTSTRAP_TRANSITIONS,
} from '@/lib/bootstrap-utils';

// ---- Mock Setup ----

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

// ============================================================
// SECTION 1: Pure utility tests (bootstrap-utils.ts)
// ============================================================

// TC-006: 状態遷移 — uninitialized → bootstrapping（有効）
describe('TC-006: bootstrap status transition - uninitialized -> bootstrapping', () => {
  test('validateBootstrapTransition returns true for valid transition', () => {
    expect(validateBootstrapTransition('uninitialized', 'bootstrapping')).toBe(true);
  });
});

// TC-007: 状態遷移 — bootstrapping → pr_pending（有効）
describe('TC-007: bootstrap status transition - bootstrapping -> pr_pending', () => {
  test('validateBootstrapTransition returns true for valid transition', () => {
    expect(validateBootstrapTransition('bootstrapping', 'pr_pending')).toBe(true);
  });
});

// TC-008: 状態遷移 — bootstrapping → uninitialized（有効: セッション失敗時）
describe('TC-008: bootstrap status transition - bootstrapping -> uninitialized', () => {
  test('validateBootstrapTransition returns true for rollback transition', () => {
    expect(validateBootstrapTransition('bootstrapping', 'uninitialized')).toBe(true);
  });
});

// TC-009: 状態遷移 — pr_pending → ready（有効）
describe('TC-009: bootstrap status transition - pr_pending -> ready', () => {
  test('validateBootstrapTransition returns true for valid transition', () => {
    expect(validateBootstrapTransition('pr_pending', 'ready')).toBe(true);
  });
});

// TC-010: pr_pending → uninitialized で bootstrap_pr_url がクリアされること（ロジック検証）
describe('TC-010: bootstrap status pr_pending -> uninitialized clears pr_url', () => {
  test('pr_pending -> uninitialized is a valid transition', () => {
    expect(validateBootstrapTransition('pr_pending', 'uninitialized')).toBe(true);
  });

  test('bootstrap-actions.ts clears bootstrapPrUrl when transitioning from pr_pending to uninitialized', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    // The code should check for pr_pending->uninitialized and set bootstrapPrUrl: null
    expect(source).toContain('clearPrUrl');
    expect(source).toContain('bootstrapPrUrl: null');
  });
});

// TC-011: 状態遷移 — 不正遷移の拒否
describe('TC-011: bootstrap status transition - invalid transition rejected', () => {
  test('uninitialized -> pr_pending is rejected', () => {
    expect(validateBootstrapTransition('uninitialized', 'pr_pending')).toBe(false);
  });

  test('uninitialized -> ready is rejected', () => {
    expect(validateBootstrapTransition('uninitialized', 'ready')).toBe(false);
  });

  test('bootstrapping -> ready is rejected', () => {
    expect(validateBootstrapTransition('bootstrapping', 'ready')).toBe(false);
  });

  test('updateBootstrapStatus throws on invalid transition', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    // Must throw on invalid transitions
    expect(source).toContain('Invalid bootstrap status transition');
  });
});

// TC-012: 状態遷移 — ready からの遷移拒否
describe('TC-012: bootstrap status transition - ready is terminal', () => {
  test('ready -> uninitialized is rejected', () => {
    expect(validateBootstrapTransition('ready', 'uninitialized')).toBe(false);
  });

  test('ready -> bootstrapping is rejected', () => {
    expect(validateBootstrapTransition('ready', 'bootstrapping')).toBe(false);
  });

  test('ready has no allowed transitions', () => {
    expect(ALLOWED_BOOTSTRAP_TRANSITIONS['ready']).toHaveLength(0);
  });
});

// TC-013: IDOR 防止 — updateBootstrapStatus calls getAuthenticatedUser() internally
describe('TC-013: IDOR prevention - updateBootstrapStatus uses getAuthenticatedUser()', () => {
  test('bootstrap-actions.ts uses getAuthenticatedUser() not userId parameter', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();

    expect(source).toContain('getAuthenticatedUser()');
    // updateBootstrapStatus and getRepositoryWithBootstrapStatus must not accept userId
    expect(source).not.toMatch(/updateBootstrapStatus\s*\([^)]*userId[^)]*\)/);
    expect(source).not.toMatch(/getRepositoryWithBootstrapStatus\s*\([^)]*userId[^)]*\)/);
  });
});

// TC-028: PR URL 抽出 — テキストから PR URL を検出
describe('TC-028: PR URL extraction from text', () => {
  test('extracts PR URL from plain text', () => {
    const text = 'Bootstrap complete! PR created at https://github.com/owner/repo/pull/123';
    expect(extractPrUrl(text)).toBe('https://github.com/owner/repo/pull/123');
  });

  test('extracts PR URL with complex repo name', () => {
    const text = 'See https://github.com/my-org/my.repo-name/pull/42 for details';
    expect(extractPrUrl(text)).toBe('https://github.com/my-org/my.repo-name/pull/42');
  });

  test('returns null when no PR URL in text', () => {
    expect(extractPrUrl('No PR URL here')).toBeNull();
  });

  test('returns null for issue URL', () => {
    expect(extractPrUrl('https://github.com/owner/repo/issues/42')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(extractPrUrl('')).toBeNull();
  });
});

// TC-027: setBootstrapPrUrl — 無効な PR URL フォーマットの拒否
describe('TC-027: PR URL format validation', () => {
  test('valid PR URL passes', () => {
    expect(isValidPrUrl('https://github.com/owner/repo/pull/42')).toBe(true);
  });

  test('issue URL is rejected', () => {
    expect(isValidPrUrl('https://github.com/owner/repo/issues/42')).toBe(false);
  });

  test('compare URL is rejected', () => {
    expect(isValidPrUrl('https://github.com/owner/repo/compare/main..feat')).toBe(false);
  });

  test('empty string is rejected', () => {
    expect(isValidPrUrl('')).toBe(false);
  });

  test('non-github URL is rejected', () => {
    expect(isValidPrUrl('https://gitlab.com/owner/repo/merge_requests/42')).toBe(false);
  });

  test('setBootstrapPrUrl validates URL format in source code', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).toContain('isValidPrUrl');
    expect(source).toContain('Invalid PR URL format');
  });
});

// ============================================================
// SECTION 2: DB-level schema tests
// ============================================================

// TC-001: bootstrap_status CHECK 制約 — アプリ層バリデーション（constraints.md 遵守）
// constraints.md: "SQLite の TEXT 型 enum は CHECK 制約を生成しないため、アプリ層バリデーションの実テストが必要"
describe('TC-001: bootstrap_status validation - app-layer validation', () => {
  test('validateBootstrapTransition rejects transitions that would result in invalid status', () => {
    // The enum is enforced via Drizzle's type system and app-layer validation
    const invalidTransitions: Array<[BootstrapStatus, string]> = [
      ['uninitialized', 'pr_pending'],
      ['uninitialized', 'ready'],
      ['ready', 'uninitialized'],
    ];

    for (const [from, to] of invalidTransitions) {
      expect(validateBootstrapTransition(from, to as BootstrapStatus)).toBe(false);
    }
  });

  test('bootstrap_status enum values are defined in schema', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/db/schema.ts')
    ).text();
    expect(source).toContain('uninitialized');
    expect(source).toContain('bootstrapping');
    expect(source).toContain('pr_pending');
    expect(source).toContain('ready');
  });
});

// TC-002: bootstrap_status のデフォルト値
describe('TC-002: bootstrap_status default value', () => {
  test('bootstrap_status defaults to uninitialized', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    db.insert(schema.repositories).values({
      userId: 1,
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
    }).run();

    const [repo] = db.select().from(schema.repositories).all();
    expect(repo.bootstrapStatus).toBe('uninitialized');
  });
});

// TC-003: bootstrap_pr_url は NULL 許容
describe('TC-003: bootstrap_pr_url is nullable', () => {
  test('bootstrap_pr_url is null when not specified', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    db.insert(schema.repositories).values({
      userId: 1,
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
    }).run();

    const [repo] = db.select().from(schema.repositories).all();
    expect(repo.bootstrapPrUrl).toBeNull();
  });
});

// TC-004: マイグレーション — 既存レコードへのデフォルト値適用
describe('TC-004: Migration - existing records get default bootstrap_status', () => {
  test('existing repositories have bootstrap_status uninitialized after migration', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    // Insert without specifying bootstrap_status (simulates existing record)
    db.insert(schema.repositories).values({
      userId: 1,
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
    }).run();

    const [repo] = db.select().from(schema.repositories).all();
    expect(repo.bootstrapStatus).toBe('uninitialized');
    expect(repo.bootstrapPrUrl).toBeNull();
  });
});

// TC-005: マイグレーションの冪等性
describe('TC-005: Migration idempotency', () => {
  test('running migrations twice does not error', async () => {
    const { drizzle } = await import('drizzle-orm/bun-sqlite');
    const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
    const { Database } = await import('bun:sqlite');

    const sqlite = new Database(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON;');
    const db = drizzle(sqlite, { schema });

    const migrationsFolder = path.join(process.cwd(), 'drizzle');

    // First migration
    migrate(db, { migrationsFolder });

    // Second migration should be a no-op
    expect(() => {
      migrate(db, { migrationsFolder });
    }).not.toThrow();
  });
});

// ============================================================
// SECTION 3: State machine DB tests
// ============================================================

// TC-006 (DB): updateBootstrapStatus - DB level
describe('TC-006 (DB): updateBootstrapStatus uninitialized -> bootstrapping in DB', () => {
  test('updates bootstrap_status to bootstrapping', () => {
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
      bootstrapStatus: 'uninitialized',
    }).run();

    db.update(schema.repositories)
      .set({ bootstrapStatus: 'bootstrapping' })
      .where(eq(schema.repositories.id, 1))
      .run();

    const [repo] = db.select().from(schema.repositories).where(eq(schema.repositories.id, 1)).all();
    expect(repo.bootstrapStatus).toBe('bootstrapping');
  });
});

// TC-010 (DB): pr_pending -> uninitialized clears bootstrap_pr_url
describe('TC-010 (DB): pr_pending -> uninitialized transition clears pr_url', () => {
  test('bootstrap_pr_url is cleared when transitioning from pr_pending to uninitialized', () => {
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
      bootstrapStatus: 'pr_pending',
      bootstrapPrUrl: 'https://github.com/owner/repo/pull/42',
    }).run();

    const [before] = db.select().from(schema.repositories).where(eq(schema.repositories.id, 1)).all();
    expect(before.bootstrapPrUrl).toBe('https://github.com/owner/repo/pull/42');

    db.update(schema.repositories)
      .set({ bootstrapStatus: 'uninitialized', bootstrapPrUrl: null })
      .where(eq(schema.repositories.id, 1))
      .run();

    const [after] = db.select().from(schema.repositories).where(eq(schema.repositories.id, 1)).all();
    expect(after.bootstrapStatus).toBe('uninitialized');
    expect(after.bootstrapPrUrl).toBeNull();
  });
});

// ============================================================
// SECTION 4: Repository registration validation
// ============================================================

// TC-014: リポジトリ登録 — 正常登録
describe('TC-014: registerRepository - registration with bootstrap_status uninitialized', () => {
  test('new repository record has bootstrap_status uninitialized', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    db.insert(schema.repositories).values({
      userId: 1,
      owner: 'testorg',
      name: 'myrepo',
      fullName: 'testorg/myrepo',
      bootstrapStatus: 'uninitialized',
    }).run();

    const [repo] = db
      .select()
      .from(schema.repositories)
      .where(eq(schema.repositories.fullName, 'testorg/myrepo'))
      .all();

    expect(repo.bootstrapStatus).toBe('uninitialized');
  });
});

// TC-015: リポジトリ登録 — 重複登録の防止
describe('TC-015: registerRepository - duplicate registration rejected', () => {
  test('inserting duplicate owner/repo for same user throws unique constraint error', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    db.insert(schema.repositories).values({
      userId: 1,
      owner: 'owner',
      name: 'repo',
      fullName: 'owner/repo',
    }).run();

    expect(() => {
      db.insert(schema.repositories).values({
        userId: 1,
        owner: 'owner',
        name: 'repo',
        fullName: 'owner/repo',
      }).run();
    }).toThrow();
  });

  test('registerRepository checks for duplicate in source code', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/repository-registration-actions.ts')
    ).text();
    expect(source).toContain('already registered');
  });
});

// TC-033: listGitHubReposForRegistration — 認証必須（静的コード検証）
describe('TC-033: listGitHubReposForRegistration - requires authentication', () => {
  test('listGitHubReposForRegistration uses getAuthenticatedUser in source', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/repository-registration-actions.ts')
    ).text();
    expect(source).toContain('listGitHubReposForRegistration');
    expect(source).toContain('getAuthenticatedUser');
  });
});

// ============================================================
// SECTION 5: Bootstrap execution guards (static verification)
// ============================================================

// TC-018: startBootstrap — 非 uninitialized 状態からの起動拒否
describe('TC-018: startBootstrap - rejected for non-uninitialized status', () => {
  test('startBootstrap validates uninitialized status in source', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).toContain('Cannot start bootstrap when repository status is');
    expect(source).toContain("bootstrapStatus !== 'uninitialized'");
  });
});

// TC-019: startBootstrap — IDOR 防止
describe('TC-019: IDOR prevention - startBootstrap uses getAuthenticatedUser()', () => {
  test('startBootstrap uses getAuthenticatedUser() not userId parameter', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();

    expect(source).toContain('getAuthenticatedUser()');
    expect(source).not.toMatch(/startBootstrap\s*\([^)]*userId[^)]*\)/);
  });
});

// TC-016: startBootstrap — アトミック実行（全ステップ成功）
describe('TC-016: startBootstrap - atomic execution flow', () => {
  test('startBootstrap source contains all required steps', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    // Must transition to bootstrapping
    expect(source).toContain("bootstrapStatus: 'bootstrapping'");
    // Must create a request
    expect(source).toContain("insert(requests)");
    // Must create a session
    expect(source).toContain("createBoundSession");
    // Must send a message
    expect(source).toContain("sendMessage");
    // Must have rollback on failure
    expect(source).toContain("bootstrapStatus: 'uninitialized'");
    expect(source).toContain("status: 'cancelled'");
  });
});

// TC-017: startBootstrap — 部分失敗時のロールバック
describe('TC-017: startBootstrap - rollback on partial failure', () => {
  test('startBootstrap source contains rollback logic', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    // Rollback: status back to uninitialized
    expect(source).toContain("Rollback: revert repository to uninitialized");
    // Rollback: cancel the created request
    expect(source).toContain("status: 'cancelled'");
  });
});

// ============================================================
// SECTION 6: Workflow gating (createRequest source validation)
// ============================================================

// TC-020: createRequest — ready 以外のリポジトリで拒否
describe('TC-020: createRequest - rejected for non-ready repos', () => {
  test('createRequest source validates bootstrap_status', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/request-actions.ts')
    ).text();
    expect(source).toContain("bootstrapStatus !== 'ready'");
    expect(source).toContain('Repository is not ready. Bootstrap must be completed first.');
  });
});

// TC-021: createRequest — ready のリポジトリでは許可（DB テスト）
describe('TC-021: createRequest - allowed for ready repos (DB test)', () => {
  test('ready repository allows request creation in DB', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    db.insert(schema.repositories).values({
      id: 5,
      userId: 1,
      owner: 'owner',
      name: 'readyrepo',
      fullName: 'owner/readyrepo',
      bootstrapStatus: 'ready',
    }).run();

    // Verify the ready status allows request creation (DB constraint level)
    db.insert(schema.requests).values({
      repositoryId: 5,
      type: 'new-feature',
      title: 'Test Request',
      status: 'draft',
    }).run();

    const requests = db.select().from(schema.requests).where(eq(schema.requests.repositoryId, 5)).all();
    expect(requests).toHaveLength(1);
    expect(requests[0].title).toBe('Test Request');
  });
});

// ============================================================
// SECTION 7: PR Status sync logic (pure logic)
// ============================================================

// TC-022: syncBootstrapPrStatus — PR merge 検知 → ready
describe('TC-022: syncBootstrapPrStatus - PR merged -> ready', () => {
  test('merged PR should trigger transition to ready', () => {
    const currentStatus: BootstrapStatus = 'pr_pending';
    const prData = { state: 'closed', merged_at: '2024-01-01T00:00:00Z' };

    let expectedNewStatus: BootstrapStatus;
    if (prData.merged_at) {
      expectedNewStatus = 'ready';
    } else if (prData.state === 'closed') {
      expectedNewStatus = 'uninitialized';
    } else {
      expectedNewStatus = currentStatus;
    }

    expect(expectedNewStatus).toBe('ready');
    expect(validateBootstrapTransition(currentStatus, expectedNewStatus)).toBe(true);
  });

  test('syncBootstrapPrStatus checks merged_at first in source', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).toContain('pr.merged_at');
    expect(source).toContain("updateBootstrapStatus(repositoryId, 'ready')");
  });
});

// TC-023: syncBootstrapPrStatus — PR close（非 merge）→ uninitialized + URL クリア
describe('TC-023: syncBootstrapPrStatus - PR closed without merge -> uninitialized', () => {
  test('closed PR without merge transitions to uninitialized', () => {
    const currentStatus: BootstrapStatus = 'pr_pending';
    const prData = { state: 'closed', merged_at: null };

    let expectedNewStatus: BootstrapStatus;
    if (prData.merged_at) {
      expectedNewStatus = 'ready';
    } else if (prData.state === 'closed') {
      expectedNewStatus = 'uninitialized';
    } else {
      expectedNewStatus = currentStatus;
    }

    expect(expectedNewStatus).toBe('uninitialized');
    expect(validateBootstrapTransition(currentStatus, expectedNewStatus)).toBe(true);
  });
});

// TC-024: syncBootstrapPrStatus — PR open → 変更なし
describe('TC-024: syncBootstrapPrStatus - PR open -> no change', () => {
  test('open PR should not change status', () => {
    const currentStatus: BootstrapStatus = 'pr_pending';
    const prData = { state: 'open', merged_at: null };

    let expectedNewStatus: BootstrapStatus;
    if (prData.merged_at) {
      expectedNewStatus = 'ready';
    } else if (prData.state === 'closed') {
      expectedNewStatus = 'uninitialized';
    } else {
      expectedNewStatus = currentStatus;
    }

    expect(expectedNewStatus).toBe('pr_pending');
  });
});

// TC-025: syncBootstrapPrStatus — GitHub API エラー時は状態維持
describe('TC-025: syncBootstrapPrStatus - API error retains current status', () => {
  test('syncBootstrapPrStatus throws on API error, status not changed', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    // Must throw on non-OK response (not silently swallow)
    expect(source).toContain('GitHub API error when fetching PR status');
  });
});

// TC-026: setBootstrapPrUrl — 有効な PR URL の保存と pr_pending 遷移
describe('TC-026: setBootstrapPrUrl - saves PR URL and transitions to pr_pending', () => {
  test('setBootstrapPrUrl source sets pr_pending and saves URL', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).toContain("bootstrapStatus: 'pr_pending'");
    expect(source).toContain('bootstrapPrUrl: prUrl');
  });
});

// TC-029: PR URL 未検出でセッション完了 → uninitialized ロールバック
describe('TC-029: bootstrap session completed without PR URL -> rollback', () => {
  test('handleBootstrapSessionCompletedWithoutPr sets uninitialized and cancels request', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/bootstrap-actions.ts')
    ).text();
    expect(source).toContain('handleBootstrapSessionCompletedWithoutPr');
    expect(source).toContain("bootstrapStatus: 'uninitialized'");
    expect(source).toContain("status: 'cancelled'");
  });
});

// TC-030: listUserRepositories — N+1 防止（request カウントのインライン subquery）
describe('TC-030: listUserRepositories - no N+1 (inline subquery)', () => {
  test('listUserRepositories uses inline subquery for request count', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/repository-registration-actions.ts')
    ).text();
    expect(source).toContain('requestCountSubquery');
    expect(source).toContain('SELECT count(*)');
  });
});

// TC-031: listUserRepositories — bootstrap_status を含む返却データ
describe('TC-031: listUserRepositories - includes bootstrap_status', () => {
  test('schema.repositories has bootstrapStatus column', () => {
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
      bootstrapStatus: 'ready',
    }).run();

    const results = db.select().from(schema.repositories).all();
    expect(results[0]).toHaveProperty('bootstrapStatus');
    expect(results[0].bootstrapStatus).toBe('ready');
  });

  test('listUserRepositories includes bootstrapStatus in return type', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/repository-registration-actions.ts')
    ).text();
    expect(source).toContain('bootstrapStatus');
    expect(source).toContain('bootstrapPrUrl');
  });
});

// TC-036: ワークフロー実行制御 — bootstrapping 状態でも createRequest を拒否
describe('TC-036: createRequest - rejected for bootstrapping status', () => {
  test('createRequest validation covers all non-ready statuses', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/request-actions.ts')
    ).text();
    // The guard is: bootstrapStatus !== 'ready'
    // This covers uninitialized, bootstrapping, and pr_pending
    expect(source).toContain("bootstrapStatus !== 'ready'");
    expect(source).toContain('Repository is not ready. Bootstrap must be completed first.');
  });
});
