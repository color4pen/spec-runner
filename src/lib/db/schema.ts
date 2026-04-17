import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  githubId: integer('github_id').notNull().unique(),
  githubLogin: text('github_login').notNull(),
  githubAvatarUrl: text('github_avatar_url').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const repositories = sqliteTable(
  'repositories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    fullName: text('full_name').notNull(),
    defaultBranch: text('default_branch'),
    bootstrapStatus: text('bootstrap_status', {
      enum: ['uninitialized', 'bootstrapping', 'pr_pending', 'ready'],
    })
      .notNull()
      .default('uninitialized'),
    bootstrapPrUrl: text('bootstrap_pr_url'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('repositories_user_id_full_name_unique').on(
      table.userId,
      table.fullName
    ),
  ]
);

export const requests = sqliteTable('requests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  repositoryId: integer('repository_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  type: text('type', {
    enum: ['new-feature', 'spec-change', 'refactoring', 'bugfix'],
  }).notNull(),
  status: text('status', {
    enum: ['draft', 'in-progress', 'reviewing', 'completed', 'cancelled'],
  })
    .notNull()
    .default('draft'),
  title: text('title').notNull(),
  content: text('content'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  requestId: integer('request_id')
    .notNull()
    .references(() => requests.id, { onDelete: 'cascade' }),
  managedSessionId: text('managed_session_id').notNull(),
  role: text('role', {
    enum: ['implementer', 'reviewer', 'fixer', 'explorer'],
  }).notNull(),
  step: text('step'),
  status: text('status', {
    enum: ['active', 'waiting', 'completed', 'archived'],
  })
    .notNull()
    .default('active'),
  title: text('title').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
