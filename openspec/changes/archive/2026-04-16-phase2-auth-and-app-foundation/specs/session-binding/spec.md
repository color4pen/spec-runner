## ADDED Requirements

### Requirement: Session Creation with Binding
The system SHALL record every new Managed Agents session in the user_sessions table, binding it to the authenticated user and selected repository.

#### Scenario: Session created from workspace
- **WHEN** an authenticated user clicks "New Session" in a repository workspace
- **THEN** the system creates a Managed Agents session (with the repo mounted using the user's OAuth token) and inserts a record into user_sessions with the user's id, session_id, repo (owner/name), a generated title, and status 'active'

#### Scenario: Session creation input validation
- **WHEN** creating a session with a repo parameter
- **THEN** the system validates that the repo value matches the `owner/repo-name` format, where owner and repo-name consist only of alphanumeric characters, hyphens, underscores, and periods, and rejects invalid values with a validation error

#### Scenario: Session creation failure rollback
- **WHEN** the Managed Agents API returns an error during session creation
- **THEN** no record is inserted into user_sessions and the error is displayed to the user

### Requirement: User Session List
The system SHALL provide a list of sessions for a given user and repository by querying the user_sessions table.

#### Scenario: Sessions listed by user and repo
- **WHEN** the workspace page loads for a specific repository
- **THEN** the system queries user_sessions WHERE user_id = current user AND repo = current repository, ordered by created_at DESC

#### Scenario: Sessions listed with cached status
- **WHEN** sessions are displayed in the sidebar
- **THEN** each session shows its title, cached status, and creation date from the user_sessions table without calling the Managed Agents API

#### Scenario: Empty session list
- **WHEN** the user has no sessions for the current repository
- **THEN** the system displays a message prompting the user to create their first session

### Requirement: Session Status Cache
The system SHALL cache Managed Agents session status in the user_sessions table to avoid per-request API calls.

#### Scenario: Status refresh on demand
- **WHEN** the user clicks a refresh button on a session entry
- **THEN** the system calls the Managed Agents API to get the current session status, updates the `status` and `updated_at` columns in user_sessions, and displays the fresh status

#### Scenario: Status cache used for list
- **WHEN** the session list is rendered
- **THEN** the system uses the cached `status` from user_sessions without calling the Managed Agents API

#### Scenario: Status updated after session interaction
- **WHEN** the user sends a message in a session and receives a response
- **THEN** the system does not automatically update the cached status (status is only refreshed on explicit user action)

### Requirement: Session Title
The system SHALL assign a default title to new sessions and allow it to be displayed.

#### Scenario: Default title generation
- **WHEN** a new session is created
- **THEN** the system assigns a default title in the format "Session YYYY-MM-DD HH:mm" based on the creation timestamp

#### Scenario: Title displayed in sidebar
- **WHEN** sessions are listed in the workspace sidebar
- **THEN** each session displays its title as the primary identifier
