## 1. DB Schema & Migration

- [x] 1.1 Add `bootstrap_status` (TEXT NOT NULL DEFAULT 'uninitialized') and `bootstrap_pr_url` (TEXT) columns to the `repositories` table in `src/lib/db/schema.ts`. Add CHECK constraint for bootstrap_status values ('uninitialized', 'bootstrapping', 'pr_pending', 'ready')
- [x] 1.2 Create migration file to add bootstrap columns to existing `repositories` table. Use ALTER TABLE ADD COLUMN with IF NOT EXISTS for idempotency
- [x] 1.3 Update `Repository` and `NewRepository` types exported from schema.ts to include the new columns

## 2. Bootstrap Status State Machine

- [x] 2.1 Create `src/lib/bootstrap-actions.ts` with `updateBootstrapStatus(repositoryId, newStatus)` Server Action. Implement the allowed transitions map (uninitialized->bootstrapping, bootstrapping->pr_pending, bootstrapping->uninitialized, pr_pending->ready, pr_pending->uninitialized). Use `getAuthenticatedUser()` internally (no userId argument). Verify repository ownership before update
- [x] 2.2 Add transition validation: reject invalid transitions with descriptive error. Clear `bootstrap_pr_url` when transitioning `pr_pending -> uninitialized`
- [x] 2.3 Add `getRepositoryWithBootstrapStatus(repositoryId)` helper that returns repository record including bootstrap_status, with ownership verification

## 3. Repository Registration (Replace Auto-Registration)

- [x] 3.1 Create `src/lib/repository-registration-actions.ts` with `searchRepositories(query)` Server Action. Call GitHub Search API (`GET /search/repositories?q={query}+user:{login}`) using OAuth token. Validate non-empty query. Return results with `alreadyRegistered` flag by checking DB
- [x] 3.2 Create `registerRepository(owner, name)` Server Action. Verify access via GitHub API (`GET /repos/{owner}/{repo}`), validate owner/name pattern, insert into repositories with `bootstrap_status: 'uninitialized'`. Handle 404/403 uniformly, handle duplicate registration error
- [x] 3.3 Update `listUserRepositories()` to include `bootstrap_status` in returned data, and ensure inline subquery for request counts (no N+1)
- [x] 3.4 Remove auto-registration logic from `/repos/[owner]/[repo]/page.tsx`. Non-registered repository access SHALL show a "Repository not registered" message instead of auto-registering

## 4. Repository Registration UI

- [x] 4.1 Create "Add Repository" button on `/repos` page that opens a registration dialog/modal
- [x] 4.2 Implement search input with 300ms debounce in the dialog. Display results with repo name, description, language, private badge, and "already registered" indicator
- [x] 4.3 Implement repository selection and registration: clicking a search result calls `registerRepository`, refreshes the list, and closes the dialog
- [x] 4.4 Replace the GitHub API full repo listing on `/repos` page with registered-only listing from DB. Remove the `listUserRepos()` import and use `listUserRepositories()` instead
- [x] 4.5 Add bootstrap status badges to each repository card: uninitialized (gray), bootstrapping (yellow/animated), pr_pending (blue), ready (green)

## 5. Bootstrap Execution

- [x] 5.1 Create `startBootstrap(repositoryId, agentId, environmentId)` Server Action in `bootstrap-actions.ts`. Implement the atomic flow: update bootstrap_status to 'bootstrapping', create request (type: 'new-feature', title: 'Bootstrap openspec-workflow', status: 'draft'), transition request to 'in-progress' via `updateRequestStatus` (standard state machine), create bound session (role: 'implementer'), send bootstrap instruction message. Implement rollback on any step failure
- [x] 5.2 Compose the bootstrap instruction message content: openspec init, directory structure, tech stack recon, verification command detection, review-standards placement, skip hooks/gitignore, commit + PR creation via `gh pr create`
- [x] 5.3 Add guard in `startBootstrap` to reject if bootstrap_status is not 'uninitialized'. Reject if repository not owned by authenticated user

## 6. Bootstrap UI

- [x] 6.1 Add "Bootstrap" button on repository workspace page, visible when `bootstrap_status === 'uninitialized'`
- [x] 6.2 Implement confirmation dialog with Agent and Environment selection dropdowns (pre-populated from Managed Agents API). Explain what bootstrap will do
- [x] 6.3 On confirmation, call `startBootstrap`, then redirect to workspace page to monitor the bootstrap session via existing SSE stream
- [x] 6.4 Show appropriate status messages for other bootstrap states: "Bootstrapping in progress..." for `bootstrapping`, "PR pending review" with link for `pr_pending`, "Ready" badge for `ready`

## 7. PR Status Tracking

- [x] 7.1 Create `syncBootstrapPrStatus(repositoryId)` Server Action. Extract PR number from `bootstrap_pr_url`, call GitHub API (`GET /repos/{owner}/{repo}/pulls/{number}`), update status based on response: merged -> ready, closed (no merge) -> uninitialized (clear pr_url), open -> no change. Handle API errors gracefully (retain current status)
- [x] 7.2 Integrate `syncBootstrapPrStatus` into the repository workspace page Server Component: auto-call when `bootstrap_status === 'pr_pending'` on page load
- [x] 7.3 Create `setBootstrapPrUrl(repositoryId, prUrl)` action for transitioning from `bootstrapping` to `pr_pending`. Validate PR URL format matches `https://github.com/{owner}/{repo}/pull/\d+`

## 8. PR URL Extraction from Session Stream

- [x] 8.1 Add PR URL detection logic: scan session event text for `https://github.com/{owner}/{repo}/pull/\d+` pattern. On detection, call `setBootstrapPrUrl` to transition to `pr_pending`
- [x] 8.2 Handle session completion without PR URL detection: when bootstrap session reaches 'completed' or 'archived' without PR URL, transition repository back to `uninitialized` and set bootstrap request to `cancelled`

## 9. Workflow Execution Gating

- [x] 9.1 Add bootstrap_status check in `createRequest` Server Action: reject request creation for repositories where `bootstrap_status !== 'ready'` with "Repository is not ready. Bootstrap must be completed first."
- [x] 9.2 Disable "New Request" button and session creation controls in workspace UI when `bootstrap_status !== 'ready'`. Show explanatory message

## 10. Tests

- [x] 10.1 Add unit tests for bootstrap status state machine: valid transitions, invalid transitions rejection, transition with pr_url clearing
- [x] 10.2 Add unit tests for repository registration: search validation, duplicate prevention, access verification, name pattern validation
- [x] 10.3 Add unit tests for bootstrap execution: atomicity (rollback on failure), guard against non-uninitialized status, ownership verification
- [x] 10.4 Add unit tests for PR status polling: merged detection, closed detection, API error handling, PR number extraction from URL
- [x] 10.5 Add unit tests for workflow gating: createRequest rejection for non-ready repos
