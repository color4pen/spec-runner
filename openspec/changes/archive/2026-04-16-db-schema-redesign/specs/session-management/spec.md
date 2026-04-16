## MODIFIED Requirements

### Requirement: Session Creation
The application SHALL create sessions within the context of a request. Session creation SHALL require authentication and request ownership verification, and SHALL use the repository's OAuth token for GitHub repository access.

#### Scenario: Session created with request context
- **WHEN** an authenticated user initiates session creation for a request they own
- **THEN** the system calls `client.beta.sessions.create()` with an agent ID, environment ID, and GitHub repository resource derived from the request's repository record

#### Scenario: GitHub repository mounted from request's repository
- **WHEN** creating a session
- **THEN** the resources include `type: 'github_repository'` with URL derived from the request's repository `full_name` and the authenticated user's OAuth access token as the authorization token

#### Scenario: Session role assigned
- **WHEN** creating a session within a request
- **THEN** the session record includes a `role` field (one of `implementer`, `reviewer`, `fixer`, `explorer`) indicating the session's purpose in the workflow

#### Scenario: Unauthenticated session creation rejected
- **WHEN** an unauthenticated request attempts to create a session
- **THEN** the system rejects the request and returns an authentication error

### Requirement: Session State Tracking
The application SHALL track sessions in the `sessions` database table, linked to requests instead of directly to users.

#### Scenario: Session ID stored with request reference
- **WHEN** a session is created
- **THEN** the `managed_session_id` is stored in the `sessions` table with the `request_id`, `role`, optional `step`, `title`, and `status`

#### Scenario: Session metadata accessible via request
- **WHEN** querying session state
- **THEN** the system returns session data from the `sessions` table including managed_session_id, role, step, status, title, and timestamps, accessible only through request ownership verification

### Requirement: Session Cleanup
The application SHALL support manual session termination with database record update, requiring request ownership verification.

#### Scenario: User closes session
- **WHEN** the user requests to close a session for a request they own
- **THEN** the session is archived via the Managed Agents API and the `sessions` record status is updated to `archived`

#### Scenario: Session state cleared
- **WHEN** a session is archived
- **THEN** the session remains in `sessions` with status `archived` and is no longer shown as active in the request detail view
