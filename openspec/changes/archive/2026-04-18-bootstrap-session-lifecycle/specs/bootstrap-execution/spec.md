## MODIFIED Requirements

### Requirement: Bootstrap Session Execution
The system SHALL create and execute a managed agent session that performs the bootstrap process autonomously, using `type: 'bootstrap'` for the request and `role: 'bootstrap'` for the session, with Vault-based MCP authentication.

#### Scenario: Bootstrap session creation
- **WHEN** the user confirms bootstrap initiation with selected Agent and Environment
- **THEN** the system performs the following steps atomically:
  1. Calls `ensureVaultWithCredentials` to provision/refresh the user's Vault with their current OAuth token
  2. Updates `repositories.bootstrap_status` to `bootstrapping`
  3. Creates a request record with `type: 'bootstrap'`, `title: 'Bootstrap openspec-workflow'`, `status: 'draft'`
  4. Transitions the request status to `in-progress` via `updateRequestStatus` (following the standard `draft -> in-progress` transition)
  5. Creates a bound session via `createBoundSession` with `role: 'bootstrap'`, including the Vault resource
  6. Sends the bootstrap instruction message via `sendMessage`

#### Scenario: Bootstrap instruction message content
- **WHEN** the bootstrap session is created and the instruction message is sent
- **THEN** the message SHALL instruct the agent to:
  1. Run `openspec init` to initialize the OpenSpec structure
  2. Create the standard directory structure (openspec/specs/, openspec/changes/, etc.)
  3. Perform technology stack reconnaissance (read package.json, tsconfig.json, etc.)
  4. Detect verification commands (build, test, lint scripts)
  5. Place review-standards.md at `.claude/rules/review-standards.md`
  6. Skip hooks setup (Step 5) and .gitignore observations entry (Step 6)
  7. Commit all changes on branch `openspec-bootstrap/{owner}/{repo}`
  8. Push the branch to remote
  9. Do NOT create a PR (the application will create it after session completion)

#### Scenario: Bootstrap atomicity on failure
- **WHEN** any step in the bootstrap session creation fails (Vault provisioning, DB update, request creation, status transition, session creation, or message send)
- **THEN** the system rolls back all changes: `bootstrap_status` reverts to `uninitialized`, the request record is cancelled if created, and the API session is archived if created

#### Scenario: Pre-existing bootstrap branch cleanup
- **WHEN** `startBootstrap` is called and the branch `openspec-bootstrap/{owner}/{repo}` already exists on the remote (e.g., from a previous failed bootstrap)
- **THEN** the system deletes the existing branch via `github-api.ts` `deleteBranch` before proceeding with session creation, ensuring a clean starting point for the agent

#### Scenario: Only one bootstrap session at a time
- **WHEN** the user attempts to start bootstrap for a repository that is already in `bootstrapping` status
- **THEN** the system rejects the request with "Bootstrap already in progress"

#### Scenario: Unauthenticated bootstrap rejected
- **WHEN** an unauthenticated request attempts to start bootstrap
- **THEN** the system rejects with an authentication error

#### Scenario: Non-owner bootstrap rejected
- **WHEN** a user attempts to start bootstrap for a repository they do not own
- **THEN** the system rejects with "Repository not found" (via repository ownership verification)

### Requirement: Bootstrap Session Monitoring
The system SHALL provide visibility into the bootstrap session progress via the existing workspace UI.

#### Scenario: Bootstrap session visible in workspace
- **WHEN** a bootstrap session is running
- **THEN** the user can navigate to the repository workspace and see the bootstrap session in the sessions list, with the SSE stream showing real-time agent activity

#### Scenario: Redirect to workspace after bootstrap start
- **WHEN** bootstrap is initiated successfully
- **THEN** the UI navigates the user to the repository workspace page where they can monitor the bootstrap session progress

## REMOVED Requirements

### Requirement: PR URL Extraction from Session Stream
**Reason**: PR creation is moved from the agent to the application. The agent no longer creates PRs, so there is no PR URL in the session stream to extract. The application creates the PR after session completion via the GitHub REST API.
**Migration**: `processBootstrapSessionEvent` is removed. The session-completion-handler creates the PR and stores the URL directly.

### Requirement: Bootstrap request identification
**Reason**: Bootstrap requests are now identified by `type: 'bootstrap'` instead of title string matching (`title = 'Bootstrap openspec-workflow'`). The session-completion-handler uses `session.role` to dispatch, and accesses the request via the `sessions → requests` foreign key.
**Migration**: Replace all `title = 'Bootstrap openspec-workflow'` queries with `type = 'bootstrap'` or `role = 'bootstrap'` lookups via the session/request relationship.
