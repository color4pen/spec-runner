/**
 * Tests for Request Create + Propose session feature
 * Covers: TC-001 to TC-030, TC-039 (must priority)
 *
 * Strategy:
 * - Pure utility functions (propose-utils.ts): direct call tests
 * - DB schema tests: createTestDb() with bun:sqlite (no better-sqlite3)
 * - Server Action tests: static source analysis (constraints.md pattern)
 *   or mock-based integration tests with @/lib/db mocked
 */

import { describe, test, expect, mock } from 'bun:test';
import { createTestDb } from './test-db';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import path from 'path';
import {
  generateSlug,
  generateBranchName,
  buildProposeMessage,
  parseEnabledJson,
  VALID_ENABLED_OPTIONS,
  type EnabledOption,
} from '@/lib/propose-utils';

// ---- Global mocks ----

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
// SECTION 1: DB Schema tests (TC-001, TC-002, TC-003)
// ============================================================

describe('TC-001: enabled column exists in requests table', () => {
  test('requests table has enabled TEXT nullable column', () => {
    const { sqlite } = createTestDb();
    const info = sqlite.query("PRAGMA table_info('requests')").all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    const enabledCol = info.find((col) => col.name === 'enabled');
    expect(enabledCol).toBeDefined();
    expect(enabledCol?.type.toUpperCase()).toBe('TEXT'); // SQLite returns uppercase
    expect(enabledCol?.notnull).toBe(0); // nullable
  });
});

describe('TC-002: existing request records with enabled=null can be retrieved', () => {
  test('SELECT on records without enabled column value returns null', () => {
    const { db, sqlite } = createTestDb();
    // Setup fixtures
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r' }).run();

    // Insert request without enabled (simulates legacy record)
    sqlite.prepare(
      'INSERT INTO requests (id, repository_id, type, status, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime("now"), datetime("now"))'
    ).run(10, 1, 'new-feature', 'draft', 'Old Request');

    const rows = db.select().from(schema.requests).where(eq(schema.requests.id, 10)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBeNull();
  });
});

describe('TC-003: sessions.role accepts "propose" value', () => {
  test('INSERT with role=propose succeeds via Drizzle', () => {
    const { db } = createTestDb();
    // Setup fixtures
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r' }).run();
    db.insert(schema.requests).values({
      id: 20,
      repositoryId: 1,
      type: 'new-feature',
      title: 'Test',
      status: 'in-progress',
    }).run();

    // Insert session with propose role
    db.insert(schema.sessions).values({
      id: 30,
      requestId: 20,
      managedSessionId: 'test-session-propose',
      role: 'propose',
      status: 'active',
      title: 'Propose session',
    }).run();

    const rows = db.select().from(schema.sessions).where(eq(schema.sessions.id, 30)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('propose');
  });
});

// ============================================================
// SECTION 2: enabled JSON storage in DB (TC-005, TC-006)
// Via direct DB insert + Drizzle ORM (no Server Action, no better-sqlite3)
// ============================================================

describe('TC-005: enabled JSON string stored in DB', () => {
  test('enabled JSON array is stored and retrieved correctly', () => {
    const { db } = createTestDb();
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r', bootstrapStatus: 'ready' }).run();

    const enabledJson = JSON.stringify(['test-case-generator', 'adr']);
    db.insert(schema.requests).values({
      id: 1,
      repositoryId: 1,
      type: 'new-feature',
      title: 'Feature with enabled',
      status: 'draft',
      enabled: enabledJson,
    }).run();

    const rows = db.select().from(schema.requests).where(eq(schema.requests.id, 1)).all();
    expect(rows[0].enabled).toBe('["test-case-generator","adr"]');
    // Verify it round-trips correctly
    expect(JSON.parse(rows[0].enabled!)).toEqual(['test-case-generator', 'adr']);
  });
});

describe('TC-006: enabled null is allowed in DB', () => {
  test('enabled=null is stored when not specified', () => {
    const { db } = createTestDb();
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r', bootstrapStatus: 'ready' }).run();

    db.insert(schema.requests).values({
      id: 2,
      repositoryId: 1,
      type: 'new-feature',
      title: 'Feature without enabled',
      status: 'draft',
    }).run();

    const rows = db.select().from(schema.requests).where(eq(schema.requests.id, 2)).all();
    expect(rows[0].enabled).toBeNull();
  });
});

// ============================================================
// SECTION 3: createRequest() validation tests (TC-007) — static analysis
// ============================================================

describe('TC-007: createRequest() validates enabled options', () => {
  test('createRequest source validates enabled options against VALID_ENABLED_OPTIONS', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/request-actions.ts')
    ).text();

    expect(source).toContain('VALID_ENABLED_OPTIONS');
    expect(source).toContain('Invalid enabled options');
  });

  test('createRequest validates enabled before DB insert', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/request-actions.ts')
    ).text();
    // Validation should appear before the DB insert
    const validationIdx = source.indexOf('Invalid enabled options');
    const insertIdx = source.indexOf('.insert(requests)');
    expect(validationIdx).toBeGreaterThan(0);
    expect(insertIdx).toBeGreaterThan(0);
    expect(validationIdx).toBeLessThan(insertIdx);
  });
});

// ============================================================
// SECTION 4: Pure utility function tests (TC-017, TC-018, TC-039)
// ============================================================

describe('TC-017: branch name generation maps type prefix correctly', () => {
  test('new-feature -> feat/', () => {
    expect(generateBranchName('new-feature', '2026-04-24-my-feature')).toBe('feat/2026-04-24-my-feature');
  });

  test('spec-change -> change/', () => {
    expect(generateBranchName('spec-change', '2026-04-24-foo')).toBe('change/2026-04-24-foo');
  });

  test('refactoring -> refactor/', () => {
    expect(generateBranchName('refactoring', '2026-04-24-bar')).toBe('refactor/2026-04-24-bar');
  });

  test('bugfix -> fix/', () => {
    expect(generateBranchName('bugfix', '2026-04-24-baz')).toBe('fix/2026-04-24-baz');
  });
});

describe('TC-018: buildProposeMessage() contains request content and enabled (updated signature)', () => {
  test('output contains all required fields', () => {
    const message = buildProposeMessage({
      requestId: 10,
      requestTitle: 'Test Feature',
      requestContent: 'This is the content',
      requestType: 'new-feature',
      enabled: ['test-case-generator'],
    });

    // New signature: no branchName/slug params, but includes requestId and guidelines
    expect(message).toContain('10'); // requestId
    expect(message).toContain('Test Feature');
    expect(message).toContain('This is the content');
    expect(message).toContain('test-case-generator');
    expect(message).toContain('register_branch');
  });

  test('enabled section is omitted when empty', () => {
    const message = buildProposeMessage({
      requestId: 1,
      requestTitle: 'Test',
      requestContent: null,
      requestType: 'new-feature',
      enabled: [],
    });

    expect(message).not.toContain('Enabled Workflow Options');
  });

  test('enabled section lists all enabled options', () => {
    const message = buildProposeMessage({
      requestId: 1,
      requestTitle: 'Test',
      requestContent: null,
      requestType: 'new-feature',
      enabled: ['adr', 'security-reviewer'],
    });

    expect(message).toContain('adr');
    expect(message).toContain('security-reviewer');
  });
});

describe('TC-039: slug generation produces YYYY-MM-DD-{kebab-case-title}', () => {
  test('generates correct slug from date and title', () => {
    expect(generateSlug('2026-04-24', 'My Feature Request')).toBe('2026-04-24-my-feature-request');
  });

  test('handles special characters in title', () => {
    const slug = generateSlug('2026-04-24', 'Test: Feature! With "quotes"');
    expect(slug).toBe('2026-04-24-test-feature-with-quotes');
  });

  test('trims leading/trailing hyphens', () => {
    const slug = generateSlug('2026-04-24', '   Feature   ');
    expect(slug).toBe('2026-04-24-feature');
  });

  test('handles multiple consecutive special chars', () => {
    const slug = generateSlug('2026-04-24', 'Hello   World');
    expect(slug).toBe('2026-04-24-hello-world');
  });
});

// ============================================================
// SECTION 5: parseEnabledJson() tests (TC-038)
// ============================================================

describe('TC-038: parseEnabledJson() handles invalid JSON gracefully', () => {
  test('returns empty array for broken JSON', () => {
    expect(parseEnabledJson('[broken')).toEqual([]);
  });

  test('returns empty array for null', () => {
    expect(parseEnabledJson(null)).toEqual([]);
  });

  test('returns empty array for non-array JSON', () => {
    expect(parseEnabledJson('{"key": "value"}')).toEqual([]);
  });

  test('parses valid JSON array', () => {
    expect(parseEnabledJson('["test-case-generator","adr"]')).toEqual([
      'test-case-generator',
      'adr',
    ]);
  });

  test('returns empty array for empty string', () => {
    expect(parseEnabledJson('')).toEqual([]);
  });
});

// ============================================================
// SECTION 6: ENABLED_OPTIONS constant (TC-013)
// ============================================================

describe('TC-013: VALID_ENABLED_OPTIONS contains all expected options', () => {
  test('all 5 options are present', () => {
    const required = [
      'test-case-generator',
      'adr',
      'module-architect',
      'security-reviewer',
      'pattern-reviewer',
    ];
    for (const opt of required) {
      expect(VALID_ENABLED_OPTIONS).toContain(opt as EnabledOption);
    }
  });

  test('has exactly 5 options', () => {
    expect(VALID_ENABLED_OPTIONS).toHaveLength(5);
  });
});

// ============================================================
// SECTION 7: GitHub API function tests (TC-026, TC-027, TC-028, TC-029)
// ============================================================

describe('TC-026: getDirectoryContents() returns file list on success', () => {
  test('returns parsed directory entries', async () => {
    const mockResponse = [
      { name: 'proposal.md', path: 'openspec/changes/slug/proposal.md', type: 'file', size: 100 },
      { name: 'design.md', path: 'openspec/changes/slug/design.md', type: 'file', size: 200 },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      } as Partial<Response>)
    ) as unknown as typeof fetch;

    const { getDirectoryContents } = await import('@/lib/github-api');
    const result = await getDirectoryContents('token', 'owner', 'repo', 'openspec/changes/slug', 'feat/slug');

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('proposal.md');
    expect(result[1].name).toBe('design.md');
    expect(result[0].type).toBe('file');
    expect(result[0].size).toBe(100);

    globalThis.fetch = originalFetch;
  });
});

describe('TC-027: getDirectoryContents() returns empty array for 404', () => {
  test('returns [] without throwing on 404', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Partial<Response>)
    ) as unknown as typeof fetch;

    const { getDirectoryContents } = await import('@/lib/github-api');
    const result = await getDirectoryContents('token', 'owner', 'repo', 'path', 'branch');

    expect(result).toEqual([]);
    globalThis.fetch = originalFetch;
  });
});

describe('TC-028: getFileContent() returns decoded Base64 content', () => {
  test('returns decoded markdown text', async () => {
    const originalContent = '# Proposal\n\nThis is the content.';
    const base64Content = Buffer.from(originalContent, 'utf-8').toString('base64');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ content: base64Content, encoding: 'base64' }),
      } as Partial<Response>)
    ) as unknown as typeof fetch;

    const { getFileContent } = await import('@/lib/github-api');
    const result = await getFileContent('token', 'owner', 'repo', 'path/to/file.md', 'branch');

    expect(result).toBe(originalContent);
    globalThis.fetch = originalFetch;
  });

  test('decodes content with embedded newlines (GitHub adds newlines in base64)', async () => {
    const originalContent = 'Hello World';
    const base64WithNewlines = Buffer.from(originalContent).toString('base64').replace(/.{76}/g, '$&\n');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ content: base64WithNewlines, encoding: 'base64' }),
      } as Partial<Response>)
    ) as unknown as typeof fetch;

    const { getFileContent } = await import('@/lib/github-api');
    const result = await getFileContent('token', 'owner', 'repo', 'file.md', 'branch');

    expect(result).toBe(originalContent);
    globalThis.fetch = originalFetch;
  });
});

describe('TC-029: getFileContent() returns null for 404', () => {
  test('returns null without throwing on 404', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Partial<Response>)
    ) as unknown as typeof fetch;

    const { getFileContent } = await import('@/lib/github-api');
    const result = await getFileContent('token', 'owner', 'repo', 'nonexistent.md', 'branch');

    expect(result).toBeNull();
    globalThis.fetch = originalFetch;
  });
});

// ============================================================
// SECTION 8: startPropose() — static analysis tests (TC-014, TC-015, TC-016)
// (cannot call startPropose() directly as it uses better-sqlite3 via getDb())
// ============================================================

describe('TC-014: startPropose() verifies draft status before proceeding', () => {
  test('propose-actions.ts checks for draft status', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/propose-actions.ts')
    ).text();
    expect(source).toContain("request.status !== 'draft'");
    expect(source).toContain('Cannot start propose when request status is');
  });
});

describe('TC-015: startPropose() verifies request ownership (IDOR prevention)', () => {
  test('propose-actions.ts joins with repositories to verify userId', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/propose-actions.ts')
    ).text();
    // Must verify ownership via join with repositories.userId
    expect(source).toContain('repositories.userId');
    expect(source).toContain('user.dbId');
    expect(source).toContain('Request not found');
  });
});

describe('TC-016: startPropose() rejects non-draft requests', () => {
  test('error message specifies the required status', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/propose-actions.ts')
    ).text();
    expect(source).toContain('Must be "draft"');
  });
});

// ============================================================
// SECTION 9: handleProposeCompleted() — DB + static analysis tests (TC-021, TC-022, TC-023, TC-025)
// ============================================================

describe('TC-021: handleProposeCompleted() marks session as completed', () => {
  test('propose-actions source updates session to completed', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/session-completion-handler.ts')
    ).text();
    expect(source).toContain("handleProposeCompleted");
    expect(source).toContain("status: 'completed'");
  });
});

describe("TC-022: propose completion keeps request in 'in-progress'", () => {
  test("handleProposeCompleted does not update request status to 'reviewing'", async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/session-completion-handler.ts')
    ).text();
    // Extract only the handleProposeCompleted function body
    const proposeStartIdx = source.indexOf('async function handleProposeCompleted');
    const bootstrapStartIdx = source.indexOf('async function handleBootstrapCompleted');
    const proposeSection = source.slice(proposeStartIdx, bootstrapStartIdx);

    // Must NOT update request status to reviewing
    expect(proposeSection).not.toContain("'reviewing'");
    // Must NOT update requests table
    expect(proposeSection).not.toContain('update(requests)');
  });
});

describe('TC-023: propose completion does not create PR', () => {
  test('handleProposeCompleted does not call createPullRequest', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/session-completion-handler.ts')
    ).text();
    const proposeStartIdx = source.indexOf('async function handleProposeCompleted');
    const bootstrapStartIdx = source.indexOf('async function handleBootstrapCompleted');
    const proposeSection = source.slice(proposeStartIdx, bootstrapStartIdx);

    expect(proposeSection).not.toContain('createPullRequest');
    expect(proposeSection).not.toContain('/pulls');
  });
});

describe('TC-025: session-completion-handler routes propose role correctly', () => {
  test("switch statement includes case 'propose' that calls handleProposeCompleted", async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/session-completion-handler.ts')
    ).text();
    expect(source).toContain("case 'propose':");
    expect(source).toContain('handleProposeCompleted');
  });

  test('propose and bootstrap cases are separate', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/session-completion-handler.ts')
    ).text();
    const bootstrapIdx = source.indexOf("case 'bootstrap':");
    const proposeIdx = source.indexOf("case 'propose':");
    // Both cases must exist and be different positions
    expect(bootstrapIdx).toBeGreaterThan(0);
    expect(proposeIdx).toBeGreaterThan(0);
    expect(bootstrapIdx).not.toBe(proposeIdx);
  });
});

// ============================================================
// SECTION 10: getChangeFolderFiles() — static analysis (TC-030)
// ============================================================

describe('TC-030: getChangeFolderFiles() uses correct path pattern', () => {
  test('propose-actions.ts constructs openspec/changes/{slug}/ path', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/propose-actions.ts')
    ).text();
    expect(source).toContain('openspec/changes/${slug}');
    expect(source).toContain('getDirectoryContents');
  });

  test('getChangeFolderFiles calls getFileContent with ownership check', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/propose-actions.ts')
    ).text();
    expect(source).toContain('getChangeFolderFileContent');
    expect(source).toContain('getFileContent');
    // Must verify ownership
    expect(source).toContain('repositories.userId');
  });
});

// ============================================================
// SECTION 10b: getChangeFolderDirectoryContents() — static analysis
// ============================================================

describe('getChangeFolderDirectoryContents() validates dirPath and verifies ownership', () => {
  test('propose-actions.ts has getChangeFolderDirectoryContents function', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/propose-actions.ts')
    ).text();
    expect(source).toContain('export async function getChangeFolderDirectoryContents');
    expect(source).toContain('getDirectoryContents');
  });

  test('getChangeFolderDirectoryContents verifies ownership via verifyRequestWithRepository', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/propose-actions.ts')
    ).text();
    // Extract the function body
    const funcStart = source.indexOf('export async function getChangeFolderDirectoryContents');
    const funcEnd = source.indexOf('export async function getChangeFolderFileContent');
    const funcBody = source.slice(funcStart, funcEnd);

    expect(funcBody).toContain('verifyRequestWithRepository');
    expect(funcBody).toContain('getAuthenticatedUser');
  });

  test('getChangeFolderDirectoryContents rejects path traversal', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/propose-actions.ts')
    ).text();
    const funcStart = source.indexOf('export async function getChangeFolderDirectoryContents');
    const funcEnd = source.indexOf('export async function getChangeFolderFileContent');
    const funcBody = source.slice(funcStart, funcEnd);

    expect(funcBody).toContain("'..'");
    expect(funcBody).toContain('startsWith(changeFolderPath)');
    expect(funcBody).toContain('Invalid directory path');
  });
});

// ============================================================
// SECTION 11: Rollback behavior verification (TC-019) — static analysis
// ============================================================

describe('TC-019: startPropose() rollback on failure', () => {
  test('propose-actions.ts reverts request to draft on failure', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/propose-actions.ts')
    ).text();
    // Must have try/catch with rollback to draft
    expect(source).toContain("status: 'draft'");
    expect(source).toContain('try {');
    expect(source).toContain('catch (error)');
  });
});

// ============================================================
// SECTION 12: Backward compatibility (TC-004) — DB test
// ============================================================

describe('TC-004: existing bootstrap role still works after propose addition', () => {
  test('bootstrap role INSERT still succeeds', () => {
    const { db } = createTestDb();
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r' }).run();
    db.insert(schema.requests).values({
      id: 20,
      repositoryId: 1,
      type: 'new-feature',
      title: 'Test',
      status: 'in-progress',
    }).run();

    // Bootstrap role should still work
    db.insert(schema.sessions).values({
      id: 40,
      requestId: 20,
      managedSessionId: 'test-bootstrap-session',
      role: 'bootstrap',
      status: 'active',
      title: 'Bootstrap session',
    }).run();

    const rows = db.select().from(schema.sessions).where(eq(schema.sessions.id, 40)).all();
    expect(rows[0].role).toBe('bootstrap');
  });
});
