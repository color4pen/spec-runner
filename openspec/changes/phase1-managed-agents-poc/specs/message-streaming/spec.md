## ADDED Requirements

### Requirement: Send Messages to Session
The application SHALL send user messages to active sessions.

#### Scenario: Message sent to session
- **WHEN** the user submits a message in the UI
- **THEN** the system calls `client.beta.sessions.events.send()` with the session ID and message events

#### Scenario: Message format
- **WHEN** sending a message
- **THEN** the events array includes a message event with role `user` and content

### Requirement: Stream Events from Session
The application SHALL stream events from sessions using Server-Sent Events (SSE).

#### Scenario: SSE stream initiated
- **WHEN** the user opens a session
- **THEN** the system calls `client.beta.sessions.events.stream()` to receive events

#### Scenario: Events forwarded to client
- **WHEN** events are received from the SDK
- **THEN** the API route streams them to the browser via SSE

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
