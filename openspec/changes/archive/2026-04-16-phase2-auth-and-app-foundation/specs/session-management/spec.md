## MODIFIED Requirements

### Requirement: Session Creation
The application SHALL create sessions that combine an agent, environment, and GitHub repository. Session creation SHALL require authentication and use the authenticated user's OAuth token for GitHub repository access.

#### Scenario: Session created with all resources
- **WHEN** an authenticated user initiates session creation
- **THEN** the system calls `client.beta.sessions.create()` with an agent ID, environment ID, and GitHub repository resource

#### Scenario: GitHub repository mounted
- **WHEN** creating a session
- **THEN** the resources include `type: 'github_repository'` with URL and the authenticated user's OAuth access token as the authorization token (not a static environment variable)

#### Scenario: Unauthenticated session creation rejected
- **WHEN** an unauthenticated request attempts to create a session
- **THEN** the system rejects the request and returns an authentication error

### Requirement: Session State Tracking
The application SHALL track sessions in the user_sessions database table instead of relying solely on the Managed Agents API for session listing.

#### Scenario: Session ID stored
- **WHEN** a session is created
- **THEN** the session ID is stored in the user_sessions table with the user ID, repository, title, and status

#### Scenario: Session metadata accessible
- **WHEN** querying session state
- **THEN** the system returns session data from the user_sessions table including session ID, repository, title, status, and timestamps

### Requirement: Session Cleanup
The application SHALL support manual session termination with database record update.

#### Scenario: User closes session
- **WHEN** the user requests to close a session
- **THEN** the session is archived via the Managed Agents API and the user_sessions record status is updated to 'archived'

#### Scenario: Session state cleared
- **WHEN** a session is archived
- **THEN** the session remains in user_sessions with status 'archived' and is no longer shown as active in the sidebar
