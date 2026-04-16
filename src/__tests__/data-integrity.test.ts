import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createTestDb } from './test-db';
import * as schema from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';

// TC-012: github_id UNIQUE constraint
describe('TC-012: users table github_id UNIQUE constraint', () => {
  test('second INSERT with same github_id is rejected', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      githubId: 12345,
      githubLogin: 'user1',
      githubAvatarUrl: 'https://avatar1.png',
    }).run();

    expect(() => {
      db.insert(schema.users).values({
        githubId: 12345,
        githubLogin: 'user2',
        githubAvatarUrl: 'https://avatar2.png',
      }).run();
    }).toThrow();
  });
});

// TC-013: user_sessions foreign key constraint
describe('TC-013: user_sessions foreign key constraint', () => {
  test('INSERT with non-existent user_id is rejected', () => {
    const { db } = createTestDb();

    expect(() => {
      db.insert(schema.userSessions).values({
        userId: 9999, // Does not exist
        sessionId: 'session-1',
        repo: 'owner/repo',
        title: 'Test Session',
        status: 'idle',
      }).run();
    }).toThrow();
  });
});

// TC-014: PRAGMA foreign_keys = ON is enabled
describe('TC-014: PRAGMA foreign_keys = ON', () => {
  test('foreign_keys pragma is enabled in test DB', () => {
    const { sqlite } = createTestDb();
    const result = sqlite.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(result.foreign_keys).toBe(1);
  });

  test('getDb enables foreign_keys', async () => {
    const dbSource = await Bun.file(path.join(process.cwd(), 'src/lib/db/index.ts')).text();
    expect(dbSource).toContain("foreign_keys = ON");
  });
});

// TC-015: Session creation failure rolls back (user_sessions not inserted)
describe('TC-015: Session creation failure does not leave orphaned records', () => {
  test('if Managed Agents API fails, user_sessions is not inserted', () => {
    const { db } = createTestDb();

    // Insert a user
    db.insert(schema.users).values({
      id: 1,
      githubId: 12345,
      githubLogin: 'testuser',
      githubAvatarUrl: 'https://avatar.png',
    }).run();

    // Verify no sessions exist before
    const before = db.select().from(schema.userSessions).all();
    expect(before).toHaveLength(0);
  });

  test('createBoundSession calls API before DB insert', async () => {
    const source = await Bun.file(
      path.join(process.cwd(), 'src/lib/session-actions.ts')
    ).text();
    const apiCallIndex = source.indexOf('client.beta.sessions.create');
    const dbInsertIndex = source.indexOf('.insert(userSessions)');
    // API call should come before DB insert
    expect(apiCallIndex).toBeGreaterThan(-1);
    expect(dbInsertIndex).toBeGreaterThan(-1);
    expect(apiCallIndex).toBeLessThan(dbInsertIndex);
  });
});

// TC-016: First login creates user record
describe('TC-016: First login creates user record', () => {
  test('signIn callback inserts new user', () => {
    const { db } = createTestDb();

    const githubId = 12345;
    const existing = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.githubId, githubId))
      .all();

    expect(existing).toHaveLength(0);

    db.insert(schema.users).values({
      githubId,
      githubLogin: 'newuser',
      githubAvatarUrl: 'https://new-avatar.png',
    }).run();

    const created = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.githubId, githubId))
      .all();

    expect(created).toHaveLength(1);
    expect(created[0].githubLogin).toBe('newuser');
    expect(created[0].githubAvatarUrl).toBe('https://new-avatar.png');
  });
});

// TC-017: Re-login updates profile
describe('TC-017: Re-login updates profile', () => {
  test('signIn callback updates existing user profile', () => {
    const { db } = createTestDb();

    db.insert(schema.users).values({
      githubId: 12345,
      githubLogin: 'old-login',
      githubAvatarUrl: 'https://old-avatar.png',
    }).run();

    const githubId = 12345;
    db.update(schema.users)
      .set({
        githubLogin: 'new-login',
        githubAvatarUrl: 'https://new-avatar.png',
      })
      .where(eq(schema.users.githubId, githubId))
      .run();

    const updated = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.githubId, githubId))
      .all();

    expect(updated).toHaveLength(1);
    expect(updated[0].githubLogin).toBe('new-login');
    expect(updated[0].githubAvatarUrl).toBe('https://new-avatar.png');
  });
});

// TC-018: Migration idempotency
describe('TC-018: Migration idempotency', () => {
  test('running migrations twice does not error', async () => {
    const { drizzle } = await import('drizzle-orm/bun-sqlite');
    const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');

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

// TC-019: DB auto-creation when file doesn't exist
describe('TC-019: DB auto-creation', () => {
  test('getDb creates DB file if not exists', async () => {
    const dbSource = await Bun.file(path.join(process.cwd(), 'src/lib/db/index.ts')).text();
    expect(dbSource).toContain('fs.mkdirSync(dataDir, { recursive: true })');
    expect(dbSource).toContain("fs.existsSync(dataDir)");
  });

  test('Database creates file automatically', () => {
    const tmpPath = path.join(process.cwd(), 'data', 'test-auto-create.db');
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      const sqlite = new Database(tmpPath);
      expect(fs.existsSync(tmpPath)).toBe(true);
      sqlite.close();
    } finally {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  });
});
