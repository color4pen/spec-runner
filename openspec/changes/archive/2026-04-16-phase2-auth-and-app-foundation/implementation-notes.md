# Implementation Notes

## Status
- **result**: completed
- **tasks_completed**: 39/39

## Files Modified
- package.json (added dependencies: drizzle-orm, drizzle-kit, next-auth, better-sqlite3, @types/better-sqlite3, @types/bun; added test/db scripts)
- next.config.ts (added serverExternalPackages for better-sqlite3)
- .gitignore (added data/*.db, data/*.db-journal, data/*.db-wal, data/*.db-shm)
- .env.local.example (added AUTH_SECRET, AUTH_URL, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET)
- src/app/page.tsx (redirect based on auth state)
- src/app/layout.tsx (unchanged)
- src/app/api/sessions/[id]/stream/route.ts (added auth guard, 401 response)

## Files Created
- drizzle.config.ts
- drizzle/0000_illegal_vanisher.sql (migration)
- drizzle/meta/_journal.json
- drizzle/meta/0000_snapshot.json
- data/.gitkeep
- src/lib/db/schema.ts (users, user_sessions tables)
- src/lib/db/index.ts (DB singleton with better-sqlite3, auto-migration)
- src/lib/auth.ts (Auth.js v5 config with GitHub Provider, JWT, user upsert)
- src/lib/auth-helpers.ts (getAuthenticatedUser, getGitHubToken, AuthenticationError)
- src/lib/github.ts (listUserRepos server action)
- src/lib/session-actions.ts (createBoundSession, listUserSessions, refreshSessionStatus, archiveBoundSession)
- src/app/api/auth/[...nextauth]/route.ts
- src/app/(auth)/login/page.tsx
- src/app/(protected)/layout.tsx (auth check + redirect)
- src/app/(protected)/_components/header.tsx
- src/app/(protected)/debug/page.tsx (Phase 1 debug dashboard moved here)
- src/app/(protected)/repos/page.tsx (repository list with cards)
- src/app/(protected)/repos/[owner]/[repo]/page.tsx (workspace server component)
- src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx (sidebar + chat + session management)
- src/__tests__/test-db.ts (in-memory bun:sqlite test helper)
- src/__tests__/security.test.ts (TC-001 through TC-005)
- src/__tests__/security-authed.test.ts (TC-006 through TC-011)
- src/__tests__/data-integrity.test.ts (TC-012 through TC-019)
- src/__tests__/api-contract.test.ts (TC-020 through TC-026)

## Blocked Tasks
なし

## Key Decisions
1. **better-sqlite3 instead of bun:sqlite for production**: Next.js build uses Node.js internally, so `bun:sqlite` (Bun-only) cannot be used in production code. Switched to `better-sqlite3` with `serverExternalPackages` config. Tests use `bun:sqlite` via separate test-db helper since `bun test` runs in Bun runtime.

2. **Repo list at /repos instead of / (protected)**: Since both `app/page.tsx` and `app/(protected)/page.tsx` would resolve to `/` in Next.js App Router, the repo list is served at `/repos` and the root page redirects there when authenticated.

3. **Auth.js env var naming**: Used `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` (Auth.js v5 auto-inference convention) instead of `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

4. **Workspace as single client component**: Combined sidebar, session list, new session form, and chat area into one `workspace-client.tsx` component to simplify state management (selected session, SSE connection, event stream).

5. **Repo parameter validation regex**: `^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$` -- strict allowlist pattern to prevent path traversal and injection attacks.
