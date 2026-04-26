## ADDED Requirements

### Requirement: Custom Tool Event Detection
The SSE stream route SHALL detect `session.status_idle` events with `stop_reason.type === 'requires_action'` and dispatch them to the Custom Tool handler.

#### Scenario: Detect requires_action idle event
- **WHEN** the SSE stream receives a `session.status_idle` event with `stop_reason.type === 'requires_action'`
- **THEN** the system extracts the `event_ids` from the `stop_reason` and dispatches them to `handleCustomToolUse()` in `custom-tool-handler.ts`

#### Scenario: Continue streaming after Custom Tool handling
- **WHEN** the Custom Tool handler completes and returns `user.custom_tool_result` to the Anthropic API
- **THEN** the SSE loop does NOT break (unlike `end_turn`) and continues receiving events as the session resumes to `running` state

#### Scenario: Distinguish requires_action from end_turn
- **WHEN** a `session.status_idle` event is received
- **THEN** the system checks `stop_reason.type` to determine whether to dispatch Custom Tool handling (`requires_action`) or trigger session completion (`end_turn`). Both paths are mutually exclusive within a single idle event

### Requirement: Custom Tool Dispatcher
The `custom-tool-handler.ts` module SHALL provide a dispatcher that routes Custom Tool calls to the appropriate handler by tool name.

#### Scenario: Dispatch by tool name
- **WHEN** `handleCustomToolUse()` is called with a Custom Tool Use event
- **THEN** the dispatcher matches `event.name` against registered tool handlers and invokes the matching handler

#### Scenario: Unknown tool name
- **WHEN** a Custom Tool Use event has a `name` that does not match any registered handler
- **THEN** the dispatcher returns a `user.custom_tool_result` with an error message indicating the tool is not recognized, and the session resumes

#### Scenario: Tool handler error
- **WHEN** a registered tool handler throws an error during execution
- **THEN** the dispatcher catches the error and returns a `user.custom_tool_result` with the error message, preventing the session from hanging in `idle` state indefinitely

### Requirement: Custom Tool Result Delivery
The system SHALL send `user.custom_tool_result` events back to the Anthropic API to resume the session after Custom Tool execution.

#### Scenario: Successful tool result
- **WHEN** a Custom Tool handler completes successfully
- **THEN** the system sends a `user.custom_tool_result` event to the Anthropic sessions.events API with the `custom_tool_use_id` from the original event and the handler's return value as content

#### Scenario: Error tool result
- **WHEN** a Custom Tool handler fails or the tool name is unknown
- **THEN** the system sends a `user.custom_tool_result` event with an error description as content, allowing the agent to handle the failure gracefully

### Requirement: Custom Tool Handler Module Design
The `custom-tool-handler.ts` module SHALL NOT use the `'use server'` directive. It is a pure lib module called from the SSE stream route (API Route context), using direct DB queries where needed.

#### Scenario: Module directive
- **WHEN** inspecting `src/lib/custom-tool-handler.ts`
- **THEN** the file does NOT contain `'use server'` at the top (same pattern as `session-completion-handler.ts`)

#### Scenario: Direct DB access
- **WHEN** a Custom Tool handler needs to read or write database records
- **THEN** it uses `getDb()` directly (not Server Actions), consistent with the API Route execution context

### Requirement: Custom Tool Timeout Handling
The Custom Tool dispatcher SHALL handle timeouts to prevent sessions from hanging indefinitely in `idle` state.

#### Scenario: Handler timeout
- **WHEN** a Custom Tool handler does not complete within 30 seconds
- **THEN** the dispatcher aborts the handler and returns a `user.custom_tool_result` with an error message: "Tool handler timed out after 30 seconds", allowing the agent to decide how to proceed

#### Scenario: SSE client disconnect during tool handling
- **WHEN** the client SSE connection is closed while a Custom Tool handler is executing
- **THEN** the server-side handler continues to completion and sends the `user.custom_tool_result` to the Anthropic API regardless of client connection state (the Anthropic session resumes independently of the client SSE stream)
