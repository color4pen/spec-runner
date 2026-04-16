## 1. Database Foundation (SQLite + Drizzle ORM)

- [x] 1.1 Install drizzle-orm and drizzle-kit dependencies (`bun add drizzle-orm && bun add -d drizzle-kit`)
- [x] 1.2 Create Drizzle config file (`drizzle.config.ts`) with bun:sqlite driver and `data/` as DB path
- [x] 1.3 Define schema in `src/lib/db/schema.ts` (users table: id, github_id, github_login, github_avatar_url, created_at)
- [x] 1.4 Define schema in `src/lib/db/schema.ts` (user_sessions table: id, user_id FK, session_id, repo, title, status, created_at, updated_at)
- [x] 1.5 Create database connection singleton in `src/lib/db/index.ts` using bun:sqlite driver
- [x] 1.6 Generate initial migration with `bunx drizzle-kit generate` and verify SQL output
- [x] 1.7 Add `data/*.db` and `data/*.db-journal` to `.gitignore`
- [x] 1.8 Create `data/` directory with `.gitkeep`

## 2. Auth.js (GitHub OAuth)

- [x] 2.1 Install next-auth v5 (`bun add next-auth@beta`)
- [x] 2.2 Create Auth.js config in `src/lib/auth.ts` with GitHub Provider, JWT session strategy, and callbacks for account/jwt/session to persist OAuth access token
- [x] 2.3 Create Auth.js API route handler at `src/app/api/auth/[...nextauth]/route.ts`
- [x] 2.4 Create `src/lib/auth-helpers.ts` with `getAuthenticatedUser()` utility that returns user + token or throws, and `getGitHubToken()` that extracts the OAuth token from session
- [x] 2.5 Add user upsert logic in Auth.js signIn callback: insert or update users table on login
- [x] 2.6 Add environment variables to `.env.example`: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, AUTH_SECRET, AUTH_URL

## 3. Route Structure Reorganization

- [x] 3.1 Create `(auth)` route group with login page at `src/app/(auth)/login/page.tsx`
- [x] 3.2 Create `(protected)` route group with layout at `src/app/(protected)/layout.tsx` that checks auth and redirects to login if unauthenticated
- [x] 3.3 Create header navigation component with app name, user avatar/login, and logout button
- [x] 3.4 Update root `src/app/page.tsx` to redirect: authenticated users → repo list, unauthenticated → login
- [x] 3.5 Move Phase 1 debug dashboard to `src/app/(protected)/debug/page.tsx`

## 4. Repository List Page

- [x] 4.1 Create Server Action `listUserRepos()` in `src/lib/github.ts` that fetches repositories from GitHub API using the user's OAuth token
- [x] 4.2 Create repository list page at `src/app/(protected)/repos/page.tsx` (default protected page) displaying repos as cards with name, owner, description, language, updated date
- [x] 4.3 Add link navigation from each repo card to `/repos/{owner}/{repo}`

## 5. Workspace Page

- [x] 5.1 Create workspace page at `src/app/(protected)/repos/[owner]/[repo]/page.tsx` with sidebar + main area layout
- [x] 5.2 Create sidebar component showing session list (from user_sessions query) and "New Session" button
- [x] 5.3 Create main area component with session detail view (chat interface reusing Phase 1 SSE streaming)
- [x] 5.4 Create default state for main area when no session is selected

## 6. Session Binding (User-Session Management)

- [x] 6.1 Create Server Action `createBoundSession()` in `src/lib/session-actions.ts` that creates a Managed Agents session AND inserts a user_sessions record (using user's OAuth token for repo mount)
- [x] 6.2 Create Server Action `listUserSessions(repo)` that queries user_sessions by user_id and repo
- [x] 6.3 Create Server Action `refreshSessionStatus(userSessionId)` that fetches status from Managed Agents API and updates user_sessions cache
- [x] 6.4 Create Server Action `archiveBoundSession(userSessionId)` that archives via API and updates user_sessions status to 'archived'
- [x] 6.5 Implement default title generation: "Session YYYY-MM-DD HH:mm"

## 7. Authentication Guards on Existing Endpoints

- [x] 7.1 Add authentication check to SSE stream route (`src/app/api/sessions/[id]/stream/route.ts`): return 401 if unauthenticated
- [x] 7.2 Add authentication guard to all existing Server Actions in `src/lib/actions.ts` using `getAuthenticatedUser()`
- [x] 7.3 Update `createSession` in actions.ts to use OAuth token instead of GITHUB_TOKEN environment variable
- [x] 7.4 Verify all protected routes reject unauthenticated requests

## 8. Integration and Polish

- [x] 8.1 Wire up workspace sidebar session click to load session detail and establish SSE connection
- [x] 8.2 Wire up "New Session" button to agent/environment selection and `createBoundSession()`
- [x] 8.3 Add loading states and error handling for GitHub API calls (repo list) and session operations
- [x] 8.4 Verify end-to-end flow: login → repo list → select repo → create session → chat → logout
