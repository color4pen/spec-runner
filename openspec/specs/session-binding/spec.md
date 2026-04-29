## Purpose

Bind a session to a request so completion handlers can look up the request context.

## Requirements
### Requirement: Session Creation with Binding
The system SHALL record every new Managed Agents session in the `sessions` table, binding it to a request with a specified role.

#### Scenario: Session created from request context
- **WHEN** an authenticated user creates a session within a request they own
- **THEN** the system creates a Managed Agents session (with the repo mounted using the user's OAuth token from the request's repository) and inserts a record into `sessions` with the `request_id`, `managed_session_id`, specified `role`, optional `step`, a generated title, and status `active`

#### Scenario: Session creation requires valid request ownership
- **WHEN** creating a session with a request_id
- **THEN** the system verifies ownership by tracing `requests → repositories → users` and rejects the operation if the authenticated user does not own the request

#### Scenario: Session creation input validation
- **WHEN** creating a session with a role parameter
- **THEN** the system validates that the role value is one of `implementer`, `reviewer`, `fixer`, `explorer` and rejects invalid values with a validation error

#### Scenario: Session creation failure rollback
- **WHEN** the DB insert fails after the Managed Agents API session has been created
- **THEN** the system archives the API session to prevent orphans and re-throws the DB error

#### Scenario: Managed Agents API failure
- **WHEN** the Managed Agents API returns an error during session creation
- **THEN** no record is inserted into `sessions` and the error is displayed to the user

### Requirement: User Session List
The system SHALL provide a list of sessions for a given request by querying the `sessions` table.

#### Scenario: Sessions listed by request
- **WHEN** the request detail page loads
- **THEN** the system queries `sessions` WHERE `request_id` = specified request (after verifying request ownership), ordered by `created_at` DESC, with a default limit of 50 records per page

#### Scenario: Session list pagination
- **WHEN** an authenticated user requests the session list with `limit` and `offset` parameters
- **THEN** the system returns at most `limit` records starting from `offset`, defaulting to limit=50, offset=0 if not specified

#### Scenario: Sessions listed with role information
- **WHEN** sessions are displayed for a request
- **THEN** each session shows its title, role, step, cached status, and creation date from the `sessions` table

#### Scenario: Empty session list
- **WHEN** the request has no sessions
- **THEN** the system displays a message prompting the user to create a session for the request

### Requirement: Session Status Cache
The system SHALL cache Managed Agents session status in the `sessions` table to avoid per-request API calls.

#### Scenario: Status refresh on demand
- **WHEN** the user clicks a refresh button on a session entry
- **THEN** the system verifies session access (via request ownership), calls the Managed Agents API to get the current session status, updates the `status` and `updated_at` columns in `sessions`, and displays the fresh status

#### Scenario: Status cache used for list
- **WHEN** the session list is rendered for a request
- **THEN** the system uses the cached `status` from `sessions` without calling the Managed Agents API

### Requirement: Session Access Verification
The system SHALL verify session access by tracing the chain `sessions → requests → repositories → users`.

#### Scenario: Session access verified via request chain
- **WHEN** a Server Action receives a session ID
- **THEN** the system joins `sessions` with `requests` and `repositories` and verifies that `repositories.user_id` matches the authenticated user's ID

#### Scenario: Session access verification failure
- **WHEN** the session access verification fails (session not found or not owned)
- **THEN** the system throws a generic "Session not found" error without distinguishing between non-existent and unauthorized access
