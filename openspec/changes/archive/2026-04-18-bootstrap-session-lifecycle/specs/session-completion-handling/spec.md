## ADDED Requirements

### Requirement: Role-Based Session Completion Dispatch
The system SHALL dispatch session completion processing based on the session's `role` field, not on title string matching or any other ad-hoc mechanism.

#### Scenario: Bootstrap role dispatched
- **WHEN** `handleSessionCompleted` is called for a session with `role = 'bootstrap'`
- **THEN** the system executes the bootstrap completion handler

#### Scenario: Unknown or default role dispatched
- **WHEN** `handleSessionCompleted` is called for a session with a role that has no specific handler (e.g., `implementer`, `reviewer`, `fixer`, `explorer`)
- **THEN** the system updates the session status to `completed` and performs no additional side effects

#### Scenario: Session context loaded
- **WHEN** `handleSessionCompleted` is called with a session DB ID
- **THEN** the system loads the session record along with its associated request and repository (via JOIN) to provide full context to the role-specific handler

### Requirement: Bootstrap Completion Handler
The system SHALL handle bootstrap session completion by verifying the agent's work (branch existence), creating a PR via the GitHub API, and updating the repository status.

#### Scenario: Branch exists — PR created
- **WHEN** the bootstrap completion handler runs and the expected branch (`openspec-bootstrap/{owner}/{repo}`) exists
- **THEN** the system creates a PR via `github-api.ts` with the branch as head, the repository's default branch as base, a standard title and body, stores the PR URL in `repositories.bootstrap_pr_url`, transitions `bootstrap_status` to `pr_pending`, and transitions the request status to `reviewing`

#### Scenario: Idempotent PR creation — existing PR reused
- **WHEN** the bootstrap completion handler runs and an open PR already exists for the bootstrap branch
- **THEN** the system uses the existing PR's URL instead of creating a new one, and proceeds with status updates

#### Scenario: Branch does not exist — rollback
- **WHEN** the bootstrap completion handler runs and the expected branch does not exist
- **THEN** the system transitions `bootstrap_status` to `uninitialized`, transitions the request status to `cancelled`, and archives the session

#### Scenario: PR creation failure — rollback
- **WHEN** the GitHub API PR creation call fails (network error, permission error)
- **THEN** the system transitions `bootstrap_status` to `uninitialized`, transitions the request status to `cancelled`, and logs the error

#### Scenario: DB update failure after PR creation — PR cleanup
- **WHEN** the PR is created successfully but the subsequent DB update fails
- **THEN** the system attempts to close the orphaned PR via `github-api.ts` (best-effort) and re-throws the DB error

### Requirement: Session Completion Detection in SSE Route
The SSE route SHALL detect session completion and delegate to the session completion handler.

#### Scenario: Completion detected via idle + end_turn
- **WHEN** the SSE stream receives an event indicating the session status is `idle` and the most recent message's `stop_reason.type` is `end_turn`
- **THEN** the SSE route calls `handleSessionCompleted(sessionDbId, accessToken)` after streaming the final events to the client

#### Scenario: SDK event type verification
- **WHEN** implementing session completion detection
- **THEN** the implementer SHALL verify the exact event type names and field paths against `@anthropic-ai/sdk` TypeScript type definitions (e.g., `BetaSessionStreamEvent`, `stop_reason` structure) before coding the detection logic. If the SDK types differ from this spec's assumptions (`session_updated`, `stop_reason.type === 'end_turn'`), the implementation SHALL follow the SDK types and this spec SHALL be updated accordingly

#### Scenario: SSE route contains no role-specific logic
- **WHEN** inspecting the SSE route handler code
- **THEN** the route does NOT contain any bootstrap-specific logic (no PR URL extraction, no bootstrap status updates, no title string matching). All post-completion logic is in `session-completion-handler.ts`

### Requirement: Module Design for Completion Handler
The `session-completion-handler.ts` module SHALL NOT use the `'use server'` directive. It is a pure library module called from the SSE API route, not a Server Action. The OAuth access token required for GitHub API calls is passed as an explicit parameter from the SSE route, which has already authenticated the user.

#### Scenario: Function signature with token
- **WHEN** `handleSessionCompleted` is invoked from the SSE route
- **THEN** the function signature is `handleSessionCompleted(sessionDbId: number, accessToken: string)`, where `accessToken` is the authenticated user's OAuth token obtained by the SSE route via `auth()`

#### Scenario: No 'use server' directive
- **WHEN** inspecting `src/lib/session-completion-handler.ts`
- **THEN** the file does NOT contain `'use server'` at the top

#### Scenario: Internal DB updates bypass ownership verification
- **WHEN** `handleSessionCompleted` updates request status or repository status internally
- **THEN** it uses direct DB queries (not `updateRequestStatus` which calls `getAuthenticatedUser()`) since ownership was already verified at the SSE route level and `getAuthenticatedUser()` is not available in non-Server-Action contexts

#### Scenario: Ownership verified via session chain at SSE level
- **WHEN** `handleSessionCompleted` is called
- **THEN** the SSE route has already verified ownership via `verifySessionAccessByManagedId`, preventing IDOR. The completion handler trusts the caller's authentication
