import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'spec-runner.db');
const MIGRATIONS_PATH = path.join(process.cwd(), 'drizzle');

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);

  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');
  // Enable WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL');

  _db = drizzle(sqlite, { schema });

  // Run migrations on first connection
  try {
    if (fs.existsSync(MIGRATIONS_PATH)) {
      migrate(_db, { migrationsFolder: MIGRATIONS_PATH });
    }
  } catch (err) {
    console.error('Migration error:', err);
  }

  return _db;
}
