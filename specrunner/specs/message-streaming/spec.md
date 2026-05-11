## Purpose

SSE streaming of session events to the workspace UI in real time.

## Requirements

### Requirement: Send Messages to Session
The application SHALL send user messages to active sessions. Message sending SHALL require authentication.

#### Scenario: Message sent to session
- **WHEN** an authenticated user submits a message in the UI
- **THEN** the system calls `client.beta.sessions.events.send()` with the session ID and message events

#### Scenario: Message format
- **WHEN** sending a message
- **THEN** the events array includes a message event with role `user` and content

#### Scenario: Unauthenticated message send rejected
- **WHEN** an unauthenticated request attempts to send a message
- **THEN** the system rejects the request and returns an authentication error

### Requirement: Stream Events from Session
The application SHALL stream events from sessions using Server-Sent Events (SSE). The SSE endpoint SHALL require authentication. The SSE route SHALL detect session completion and delegate to the session completion handler.

#### Scenario: SSE stream initiated
- **WHEN** an authenticated user opens a session
- **THEN** the system calls `client.beta.sessions.events.stream()` to receive events

#### Scenario: Events forwarded to client
- **WHEN** events are received from the SDK
- **THEN** the API route streams them to the browser via SSE

#### Scenario: Session completion detected and delegated
- **WHEN** the SSE stream detects session completion (session status becomes `idle` with the most recent message having `stop_reason.type === 'end_turn'`)
- **THEN** the route calls `handleSessionCompleted(sessionDbId, accessToken)` from `session-completion-handler.ts` to execute role-based post-completion logic

#### Scenario: No role-specific logic in SSE route
- **WHEN** inspecting the SSE route handler code
- **THEN** the route contains NO bootstrap-specific logic, NO PR URL extraction, NO bootstrap status updates, and NO title string matching. The route's only post-completion responsibility is calling `handleSessionCompleted`

#### Scenario: Unauthenticated SSE stream rejected
- **WHEN** an unauthenticated request attempts to connect to the SSE stream endpoint
- **THEN** the system returns HTTP 401 Unauthorized and does not establish a stream

### Requirement: Real-Time UI Updates
The UI SHALL display streamed events in real-time.

#### Scenario: EventSource connection established
- **WHEN** the UI opens a session
- **THEN** the browser creates an EventSource connection to the API route

#### Scenario: Events rendered incrementally
- **WHEN** events arrive via SSE
- **THEN** the UI appends them to a message display area without page refresh

### Requirement: Stream Lifecycle Management
The application SHALL handle stream connection and disconnection.

#### Scenario: Stream closed by user
- **WHEN** the user navigates away or closes the session UI
- **THEN** the EventSource connection is closed gracefully

#### Scenario: Stream error handling
- **WHEN** the SSE connection fails
- **THEN** the UI displays an error message and provides retry option

### Requirement: Client Status Polling After Session Completion
The client SHALL poll for repository status changes after detecting session completion, to learn about the results of the completion handler's actions.

#### Scenario: Polling initiated after session completion
- **WHEN** the client's EventSource connection closes (indicating session completion)
- **THEN** the client polls `GET /api/repos/{owner}/{name}/status` at 3-second intervals for up to 30 attempts

#### Scenario: PR URL displayed after polling detects pr_pending
- **WHEN** the polling response shows `bootstrapStatus = 'pr_pending'` and `bootstrapPrUrl` is non-null
- **THEN** the client displays the PR URL in the chat interface and calls `router.refresh()` to update the page

#### Scenario: Polling stops on terminal state
- **WHEN** the polling response shows `bootstrapStatus` of `pr_pending`, `ready`, or `uninitialized` (changed from `bootstrapping`)
- **THEN** the client stops polling

#### Scenario: Polling timeout
- **WHEN** the maximum number of polling attempts (30) is reached without a status change
- **THEN** the client stops polling and displays a message suggesting the user refresh the page

### Requirement: Repository Status API
The system SHALL provide an API endpoint to check the current bootstrap status of a repository.

#### Scenario: Status endpoint returns current state
- **WHEN** an authenticated user calls `GET /api/repos/{owner}/{name}/status`
- **THEN** the system returns `{ bootstrapStatus, bootstrapPrUrl, requestStatus }` for the repository, after verifying ownership. The `requestStatus` is obtained by querying `requests WHERE repository_id = ? AND type = 'bootstrap' ORDER BY created_at DESC LIMIT 1` and returning its `status` field. If no bootstrap request exists, `requestStatus` is `null`

#### Scenario: Status endpoint requires authentication
- **WHEN** an unauthenticated request calls the status endpoint
- **THEN** the system returns HTTP 401

#### Scenario: Status endpoint requires ownership
- **WHEN** an authenticated user calls the status endpoint for a repository they do not own
- **THEN** the system returns HTTP 404 (generic "not found" to prevent enumeration)
