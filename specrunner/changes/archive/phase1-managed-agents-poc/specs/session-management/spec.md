## ADDED Requirements

### Requirement: Session Creation
The application SHALL create sessions that combine an agent, environment, and GitHub repository.

#### Scenario: Session created with all resources
- **WHEN** the user initiates session creation
- **THEN** the system calls `client.beta.sessions.create()` with an agent ID, environment ID, and GitHub repository resource

#### Scenario: GitHub repository mounted
- **WHEN** creating a session
- **THEN** the resources include `type: 'github_repository'` with URL, authorization token, and mount path

### Requirement: Session State Tracking
The application SHALL track active sessions in server-side memory.

#### Scenario: Session ID stored
- **WHEN** a session is created
- **THEN** the session ID is stored with its associated agent and environment IDs

#### Scenario: Session metadata accessible
- **WHEN** querying session state
- **THEN** the system returns the session ID, agent ID, environment ID, and repository URL

### Requirement: Session Cleanup
The application SHALL support manual session termination.

#### Scenario: User closes session
- **WHEN** the user requests to close a session
- **THEN** the session is removed from in-memory storage

#### Scenario: Session state cleared
- **WHEN** a session is closed
- **THEN** the session ID is no longer available for message sending
