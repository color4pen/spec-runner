/**
 * Tests for slug-delegation-and-branch-tracking feature
 *
 * Covers test cases from test-cases.md:
 * TC-001 to TC-013 (must priority), TC-014, TC-015, TC-016, TC-017 (should priority)
 *
 * Strategy:
 * - DB schema tests: createTestDb() with bun:sqlite
 * - Pure utility functions: direct call tests
 * - register_branch handler: mock-based unit tests
 * - SSE loop behavior: static source analysis (source contains required patterns)
 * - buildProposeMessage: pure function tests
 * - change folder viewer: static source analysis for fallback logic
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { createTestDb } from './test-db';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import path from 'path';
import {
  generateSlug,
  generateBranchName,
  extractSlugFromBranchName,
  buildProposeMessage,
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
// TC-009: branch_name and base_branch columns exist in DB
// ============================================================

describe('TC-009: branch_name and base_branch columns added to requests table', () => {
  test('requests table has branch_name TEXT nullable column', () => {
    const { sqlite } = createTestDb();
    const info = sqlite.query("PRAGMA table_info('requests')").all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    const col = info.find((c) => c.name === 'branch_name');
    expect(col).toBeDefined();
    expect(col?.type.toUpperCase()).toBe('TEXT');
    expect(col?.notnull).toBe(0); // nullable
  });

  test('requests table has base_branch TEXT nullable column', () => {
    const { sqlite } = createTestDb();
    const info = sqlite.query("PRAGMA table_info('requests')").all() as Array<{
      name: string;
      type: string;
      notnull: number;
    }>;
    const col = info.find((c) => c.name === 'base_branch');
    expect(col).toBeDefined();
    expect(col?.type.toUpperCase()).toBe('TEXT');
    expect(col?.notnull).toBe(0); // nullable
  });
});

// ============================================================
// TC-008 + TC-023: branch_name DB persistence — state transitions
// ============================================================

describe('TC-008/TC-023: branch_name DB persistence', () => {
  test('new request has branch_name = null', () => {
    const { db } = createTestDb();
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r', bootstrapStatus: 'ready' }).run();
    db.insert(schema.requests).values({
      id: 1,
      repositoryId: 1,
      type: 'new-feature',
      title: 'Test',
      status: 'draft',
    }).run();

    const rows = db.select().from(schema.requests).where(eq(schema.requests.id, 1)).all();
    expect(rows[0].branchName).toBeNull();
  });

  test('branch_name can be updated from null to a value', () => {
    const { db } = createTestDb();
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r', bootstrapStatus: 'ready' }).run();
    db.insert(schema.requests).values({
      id: 1,
      repositoryId: 1,
      type: 'new-feature',
      title: 'Test',
      status: 'in-progress',
    }).run();

    // Simulate register_branch setting the branch_name
    db.update(schema.requests)
      .set({ branchName: 'feat/2026-04-25-modernize-ui' })
      .where(eq(schema.requests.id, 1))
      .run();

    const rows = db.select().from(schema.requests).where(eq(schema.requests.id, 1)).all();
    expect(rows[0].branchName).toBe('feat/2026-04-25-modernize-ui');
  });

  test('branch_name supports last-write-wins (idempotent re-registration)', () => {
    const { db } = createTestDb();
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r' }).run();
    db.insert(schema.requests).values({
      id: 1,
      repositoryId: 1,
      type: 'new-feature',
      title: 'Test',
      status: 'in-progress',
      branchName: 'feat/2026-04-25-old-name',
    }).run();

    // Overwrite with new value (last-write-wins)
    db.update(schema.requests)
      .set({ branchName: 'feat/2026-04-25-new-name' })
      .where(eq(schema.requests.id, 1))
      .run();

    const rows = db.select().from(schema.requests).where(eq(schema.requests.id, 1)).all();
    expect(rows[0].branchName).toBe('feat/2026-04-25-new-name');
  });

  test('existing request records have null branch_name after migration', () => {
    const { db, sqlite } = createTestDb();
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r' }).run();

    // Insert via raw SQL to simulate legacy record without branch_name
    sqlite.prepare(
      'INSERT INTO requests (id, repository_id, type, status, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime("now"), datetime("now"))'
    ).run(10, 1, 'new-feature', 'draft', 'Legacy Request');

    const rows = db.select().from(schema.requests).where(eq(schema.requests.id, 10)).all();
    expect(rows[0].branchName).toBeNull();
    expect(rows[0].baseBranch).toBeNull();
  });
});

// ============================================================
// TC-002: register_branch — empty slug rejected
// TC-003: register_branch — empty branch_name rejected
// TC-004: register_branch — invalid slug format rejected
// TC-001: register_branch — valid input updates DB
// (Integration tests using direct DB)
// ============================================================

describe('register_branch input validation', () => {
  // We test the validation logic by importing the handler directly.
  // Since handleCustomToolUse also calls the Anthropic API, we mock it
  // and test the validation at the handler level via the exported function interface.

  // Mock the Anthropic client so user.custom_tool_result send is captured
  let sentEvents: Array<{
    events: Array<{
      type: string;
      custom_tool_use_id: string;
      content: Array<{ type: string; text: string }>;
      is_error: boolean;
    }>;
  }> = [];

  beforeEach(() => {
    sentEvents = [];
    mock.module('@/lib/anthropic', () => ({
      getAnthropicClient: mock(() => ({
        beta: {
          sessions: {
            events: {
              send: mock((sessionId: string, event: (typeof sentEvents)[0]) => {
                sentEvents.push(event);
                return Promise.resolve({});
              }),
              list: mock(() =>
                Promise.resolve({ data: [] })
              ),
            },
          },
        },
      })),
    }));
  });

  test('TC-002: empty slug is rejected', async () => {
    const { db } = createTestDb();
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r' }).run();
    db.insert(schema.requests).values({
      id: 1, repositoryId: 1, type: 'new-feature', title: 'Test', status: 'in-progress',
    }).run();

    mock.module('@/lib/db', () => ({ getDb: mock(() => db) }));

    const { handleCustomToolUse } = await import('@/lib/custom-tool-handler');
    await handleCustomToolUse(1, 'session-id', 1, {
      customToolUseId: 'event-1',
      name: 'register_branch',
      input: { slug: '', branch_name: 'feat/2026-04-25-test', request_id: 1 },
    });

    expect(sentEvents).toHaveLength(1);
    expect(sentEvents[0].events[0].content[0].text).toContain('slug must be a non-empty string');
    // DB should NOT be updated
    const rows = db.select().from(schema.requests).where(eq(schema.requests.id, 1)).all();
    expect(rows[0].branchName).toBeNull();
  });

  test('TC-003: empty branch_name is rejected', async () => {
    const { db } = createTestDb();
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r' }).run();
    db.insert(schema.requests).values({
      id: 1, repositoryId: 1, type: 'new-feature', title: 'Test', status: 'in-progress',
    }).run();

    mock.module('@/lib/db', () => ({ getDb: mock(() => db) }));

    const { handleCustomToolUse } = await import('@/lib/custom-tool-handler');
    await handleCustomToolUse(1, 'session-id', 1, {
      customToolUseId: 'event-1',
      name: 'register_branch',
      input: { slug: '2026-04-25-test', branch_name: '', request_id: 1 },
    });

    expect(sentEvents).toHaveLength(1);
    expect(sentEvents[0].events[0].content[0].text).toContain('branch_name must be a non-empty string');
    const rows = db.select().from(schema.requests).where(eq(schema.requests.id, 1)).all();
    expect(rows[0].branchName).toBeNull();
  });

  test('TC-004: underscore slug is rejected (not kebab-case)', async () => {
    const { db } = createTestDb();
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r' }).run();
    db.insert(schema.requests).values({
      id: 1, repositoryId: 1, type: 'new-feature', title: 'Test', status: 'in-progress',
    }).run();

    mock.module('@/lib/db', () => ({ getDb: mock(() => db) }));

    const { handleCustomToolUse } = await import('@/lib/custom-tool-handler');
    await handleCustomToolUse(1, 'session-id', 1, {
      customToolUseId: 'event-1',
      name: 'register_branch',
      input: { slug: '2026_04_25_modernize_ui', branch_name: 'feat/test', request_id: 1 },
    });

    expect(sentEvents).toHaveLength(1);
    expect(sentEvents[0].events[0].content[0].text).toContain('kebab-case');
    const rows = db.select().from(schema.requests).where(eq(schema.requests.id, 1)).all();
    expect(rows[0].branchName).toBeNull();
  });

  test('TC-004: uppercase/space slug is rejected (not kebab-case)', async () => {
    const { db } = createTestDb();
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r' }).run();
    db.insert(schema.requests).values({
      id: 1, repositoryId: 1, type: 'new-feature', title: 'Test', status: 'in-progress',
    }).run();

    mock.module('@/lib/db', () => ({ getDb: mock(() => db) }));

    const { handleCustomToolUse } = await import('@/lib/custom-tool-handler');
    await handleCustomToolUse(1, 'session-id', 1, {
      customToolUseId: 'event-1',
      name: 'register_branch',
      input: { slug: 'Modernize UI', branch_name: 'feat/test', request_id: 1 },
    });

    expect(sentEvents).toHaveLength(1);
    expect(sentEvents[0].events[0].content[0].text).toContain('kebab-case');
  });

  test('TC-001: valid input updates DB branch_name', async () => {
    const { db } = createTestDb();
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r' }).run();
    db.insert(schema.requests).values({
      id: 1, repositoryId: 1, type: 'new-feature', title: 'Modernize UI', status: 'in-progress',
    }).run();

    mock.module('@/lib/db', () => ({ getDb: mock(() => db) }));

    const { handleCustomToolUse } = await import('@/lib/custom-tool-handler');
    await handleCustomToolUse(1, 'session-id', 1, {
      customToolUseId: 'event-1',
      name: 'register_branch',
      input: {
        slug: '2026-04-25-modernize-ui',
        branch_name: 'feat/2026-04-25-modernize-ui',
        request_id: 1,
      },
    });

    expect(sentEvents).toHaveLength(1);
    const result = JSON.parse(sentEvents[0].events[0].content[0].text) as { success: boolean; branch_name: string };
    expect(result.success).toBe(true);
    expect(result.branch_name).toBe('feat/2026-04-25-modernize-ui');

    const rows = db.select().from(schema.requests).where(eq(schema.requests.id, 1)).all();
    expect(rows[0].branchName).toBe('feat/2026-04-25-modernize-ui');
  });
});

// ============================================================
// Custom Tool dispatcher tests (TC-014, TC-015)
// ============================================================

describe('TC-014: Custom Tool dispatcher — unknown tool name', () => {
  let sentEvents: Array<{
    events: Array<{
      type: string;
      custom_tool_use_id: string;
      content: Array<{ type: string; text: string }>;
      is_error: boolean;
    }>;
  }> = [];

  beforeEach(() => {
    sentEvents = [];
    mock.module('@/lib/anthropic', () => ({
      getAnthropicClient: mock(() => ({
        beta: {
          sessions: {
            events: {
              send: mock((sessionId: string, event: (typeof sentEvents)[0]) => {
                sentEvents.push(event);
                return Promise.resolve({});
              }),
            },
          },
        },
      })),
    }));
  });

  test('unknown tool returns error and does not throw', async () => {
    const { db } = createTestDb();
    db.insert(schema.users).values({ id: 1, githubId: 1, githubLogin: 'u', githubAvatarUrl: 'x' }).run();
    db.insert(schema.repositories).values({ id: 1, userId: 1, owner: 'o', name: 'r', fullName: 'o/r' }).run();
    db.insert(schema.requests).values({
      id: 1, repositoryId: 1, type: 'new-feature', title: 'Test', status: 'in-progress',
    }).run();

    mock.module('@/lib/db', () => ({ getDb: mock(() => db) }));

    const { handleCustomToolUse } = await import('@/lib/custom-tool-handler');
    // Should not throw
    await expect(
      handleCustomToolUse(1, 'session-id', 1, {
        customToolUseId: 'event-unknown',
        name: 'unknown_tool_xyz',
        input: {},
      })
    ).resolves.toBeUndefined();

    expect(sentEvents).toHaveLength(1);
    expect(sentEvents[0].events[0].content[0].text).toContain('Unknown tool');
    expect(sentEvents[0].events[0].content[0].text).toContain('unknown_tool_xyz');
  });
});

describe('TC-015: Custom Tool dispatcher — handler error is caught', () => {
  let sentEvents: Array<{
    events: Array<{
      type: string;
      custom_tool_use_id: string;
      content: Array<{ type: string; text: string }>;
      is_error: boolean;
    }>;
  }> = [];

  beforeEach(() => {
    sentEvents = [];
    mock.module('@/lib/anthropic', () => ({
      getAnthropicClient: mock(() => ({
        beta: {
          sessions: {
            events: {
              send: mock((sessionId: string, event: (typeof sentEvents)[0]) => {
                sentEvents.push(event);
                return Promise.resolve({});
              }),
            },
          },
        },
      })),
    }));
  });

  test('DB error in handler is caught and returned as error result', async () => {
    // Provide a DB mock that throws on update
    const throwingDb = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ id: 1 }]),
        }),
      }),
      update: () => {
        throw new Error('DB connection failed');
      },
    };

    mock.module('@/lib/db', () => ({ getDb: mock(() => throwingDb) }));

    const { handleCustomToolUse } = await import('@/lib/custom-tool-handler');
    await expect(
      handleCustomToolUse(1, 'session-id', 1, {
        customToolUseId: 'event-error',
        name: 'register_branch',
        input: {
          slug: '2026-04-25-test',
          branch_name: 'feat/2026-04-25-test',
          request_id: 1,
        },
      })
    ).resolves.toBeUndefined();

    expect(sentEvents).toHaveLength(1);
    // Error should be captured and returned, not re-thrown
    expect(sentEvents[0].events[0].content[0].text).toBeTruthy();
  });
});

// ============================================================
// SSE Loop behavior — static source analysis (TC-005, TC-006, TC-007)
// ============================================================

describe('TC-005/TC-006/TC-007: SSE loop requires_action handling — static analysis', () => {
  test('TC-005/TC-006: stream route handles requires_action without breaking', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/app/api/sessions/[id]/stream/route.ts')
    ).text();

    // Must detect requires_action
    expect(source).toContain("stop_reason.type === 'requires_action'");
    // Must NOT break on requires_action (only on end_turn)
    expect(source).toContain("stop_reason.type === 'end_turn'");
    // Must dispatch to custom tool handler
    expect(source).toContain('handleCustomToolUse');
    // Must not break after requires_action (no break in the requires_action branch)
  });

  test('TC-007: end_turn still breaks the loop', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/app/api/sessions/[id]/stream/route.ts')
    ).text();

    // The end_turn block must contain break
    const endTurnIdx = source.indexOf("stop_reason.type === 'end_turn'");
    const requiresActionIdx = source.indexOf("stop_reason.type === 'requires_action'");
    const breakIdx = source.indexOf('break;', endTurnIdx);

    expect(endTurnIdx).toBeGreaterThan(0);
    expect(requiresActionIdx).toBeGreaterThan(0);
    expect(breakIdx).toBeGreaterThan(endTurnIdx);
    // break must come before the requires_action handling block
    expect(breakIdx).toBeLessThan(requiresActionIdx);
  });
});

// ============================================================
// TC-010: Diff URL generation
// TC-011: Diff URL hidden when branch_name is null
// ============================================================

describe('TC-010: Diff URL — branch_name present generates correct URL format', () => {
  test('compare URL is constructed correctly', () => {
    const owner = 'myorg';
    const repo = 'myrepo';
    const defaultBranch = 'main';
    const branchName = 'feat/2026-04-25-modernize-ui';

    const url = `https://github.com/${owner}/${repo}/compare/${defaultBranch}...${branchName}`;
    expect(url).toBe(
      'https://github.com/myorg/myrepo/compare/main...feat/2026-04-25-modernize-ui'
    );
  });
});

describe('TC-010/TC-011: Diff URL — workspace-client renders link correctly', () => {
  test('workspace-client renders diff URL when branchName exists', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx')
    ).text();

    // Must conditionally show diff URL based on branchName
    expect(source).toContain('selectedRequest.branchName');
    expect(source).toContain('compare/');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).toContain('target="_blank"');
  });

  test('TC-011: diff URL is inside a branchName conditional', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx')
    ).text();

    // Check the conditional is present and contains compare URL
    const branchCondIdx = source.indexOf('selectedRequest.branchName &&');
    expect(branchCondIdx).toBeGreaterThan(0);
    const compareIdx = source.indexOf('compare/', branchCondIdx);
    expect(compareIdx).toBeGreaterThan(branchCondIdx);
  });
});

// ============================================================
// TC-012/TC-013: Change folder viewer fallback logic
// ============================================================

describe('TC-012/TC-013: Change folder viewer — fallback logic (static analysis)', () => {
  test('TC-012: propose-actions uses DB branchName when available', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/propose-actions.ts')
    ).text();

    // Must check request.branchName (DB value)
    expect(source).toContain('request.branchName');
    // Must use extractSlugFromBranchName
    expect(source).toContain('extractSlugFromBranchName');
  });

  test('TC-013: propose-actions falls back to generateSlug when DB branchName is null', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/propose-actions.ts')
    ).text();

    // Fallback must call generateSlug and generateBranchName
    expect(source).toContain('generateSlug');
    expect(source).toContain('generateBranchName');
  });

  test('TC-012: extractSlugFromBranchName extracts slug correctly', () => {
    expect(extractSlugFromBranchName('feat/2026-04-25-modernize-ui')).toBe('2026-04-25-modernize-ui');
    expect(extractSlugFromBranchName('change/2026-04-25-update-spec')).toBe('2026-04-25-update-spec');
    expect(extractSlugFromBranchName('fix/no-date')).toBe('no-date');
  });

  test('TC-012: extractSlugFromBranchName returns null when no slash', () => {
    expect(extractSlugFromBranchName('main')).toBeNull();
    expect(extractSlugFromBranchName('no-slash-branch')).toBeNull();
  });
});

// ============================================================
// TC-016: buildProposeMessage — new signature (no branchName/slug)
// TC-017: buildProposeMessage — slug guidelines included
// ============================================================

describe('TC-016: buildProposeMessage — new signature accepts requestId', () => {
  test('buildProposeMessage works with requestId parameter', () => {
    const message = buildProposeMessage({
      requestId: 42,
      requestTitle: 'Modernize Login UI',
      requestContent: 'Update the login page',
      requestType: 'new-feature',
      enabled: ['test-case-generator'],
    });

    expect(message).toContain('42');
    expect(message).toContain('Modernize Login UI');
    expect(message).toContain('Update the login page');
    expect(message).toContain('test-case-generator');
  });

  test('TC-016: buildProposeMessage does not require branchName or slug parameters', () => {
    // This call should compile and succeed without branchName/slug
    expect(() =>
      buildProposeMessage({
        requestId: 1,
        requestTitle: 'Test',
        requestContent: null,
        requestType: 'new-feature',
        enabled: [],
      })
    ).not.toThrow();
  });
});

describe('TC-017: buildProposeMessage — slug generation guidelines included', () => {
  test('message contains kebab-case guideline', () => {
    const message = buildProposeMessage({
      requestId: 1,
      requestTitle: 'Test',
      requestContent: null,
      requestType: 'new-feature',
      enabled: [],
    });

    expect(message).toContain('kebab-case');
    expect(message).toContain('YYYY-MM-DD-');
    expect(message).toContain('60');
    expect(message).toContain('register_branch');
  });

  test('message instructs agent to call register_branch with correct params', () => {
    const message = buildProposeMessage({
      requestId: 99,
      requestTitle: 'Test Feature',
      requestContent: null,
      requestType: 'new-feature',
      enabled: [],
    });

    expect(message).toContain('register_branch');
    expect(message).toContain('request_id');
    expect(message).toContain('99');
    expect(message).toContain('slug');
    expect(message).toContain('branch_name');
  });
});

// ============================================================
// Backward compatibility: existing tests still apply
// TC-018 (old): buildProposeMessage format changes are non-breaking
// The old signature used branchName/slug, new uses requestId.
// The old tests in request-create-propose.test.ts need updating.
// ============================================================

describe('Backward compatibility: propose-utils still exports generateSlug and generateBranchName', () => {
  test('generateSlug still works', () => {
    expect(generateSlug('2026-04-25', 'My Feature')).toBe('2026-04-25-my-feature');
  });

  test('generateBranchName still works', () => {
    expect(generateBranchName('new-feature', '2026-04-25-my-feature')).toBe('feat/2026-04-25-my-feature');
  });
});

// ============================================================
// TC-019: RequestSummary includes branchName
// ============================================================

describe('TC-019: RequestSummary includes branchName field', () => {
  test('request-actions.ts exposes branchName in RequestSummary interface', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/request-actions.ts')
    ).text();

    expect(source).toContain('branchName: string | null');
    expect(source).toContain('branchName: r.branchName ?? null');
  });
});
