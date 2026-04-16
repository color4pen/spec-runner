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
The application SHALL stream events from sessions using Server-Sent Events (SSE). The SSE endpoint SHALL require authentication.

#### Scenario: SSE stream initiated
- **WHEN** an authenticated user opens a session
- **THEN** the system calls `client.beta.sessions.events.stream()` to receive events

#### Scenario: Events forwarded to client
- **WHEN** events are received from the SDK
- **THEN** the API route streams them to the browser via SSE

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
