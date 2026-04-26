## MODIFIED Requirements

### Requirement: Propose Session Completion Handling
The session-completion-handler SHALL handle propose session completion by using the DB-stored `branch_name` when available, falling back to deterministic derivation.

#### Scenario: Propose session completed with DB branch_name
- **WHEN** a propose session (role: `'propose'`) completes and the request has a non-null `branch_name` in the database
- **THEN** the system uses the DB-stored `branch_name` to verify branch existence via `getBranchExists()`, and updates the session status to `'completed'`

#### Scenario: Propose session completed without DB branch_name (fallback)
- **WHEN** a propose session completes and the request has a null `branch_name` in the database (agent did not call `register_branch`)
- **THEN** the system falls back to deterministic derivation using `generateSlug()` and `generateBranchName()` from the request's `createdAt` and `title`, and uses the derived branch name for branch existence verification

#### Scenario: Request status remains in-progress after propose completion
- **WHEN** a propose session completes
- **THEN** the request remains in `in-progress` status regardless of branch existence or `branch_name` source (DB or fallback)

#### Scenario: Propose completion does not create PR
- **WHEN** a propose session completes (regardless of branch existence)
- **THEN** the system does NOT create a pull request

### Requirement: SSE Stream Route requires_action Handling
The SSE stream route SHALL handle `requires_action` idle events in addition to `end_turn` idle events.

#### Scenario: requires_action dispatched to Custom Tool handler
- **WHEN** the SSE stream receives `session.status_idle` with `stop_reason.type === 'requires_action'`
- **THEN** the stream route dispatches the event to the Custom Tool handler and does NOT break the SSE loop

#### Scenario: end_turn still triggers completion
- **WHEN** the SSE stream receives `session.status_idle` with `stop_reason.type === 'end_turn'`
- **THEN** the stream route dispatches to `handleSessionCompleted()` and breaks the SSE loop (existing behavior preserved)

#### Scenario: Session context passed to Custom Tool handler
- **WHEN** dispatching a `requires_action` event to the Custom Tool handler
- **THEN** the stream route passes the session DB id, managed session ID, and the event's `event_ids` array to the handler
