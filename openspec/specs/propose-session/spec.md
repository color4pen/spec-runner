## MODIFIED Requirements

### Requirement: Propose Session Startup
The system SHALL start a propose session after a request is created, using the same pattern as bootstrap session startup (Vault setup, session creation, message sending).

#### Scenario: Start propose session for a request
- **WHEN** an authenticated user triggers propose session startup for a request they own in `draft` status
- **THEN** the system transitions the request to `in-progress`, ensures the user's Vault is configured, creates a bound session with role `'propose'`, and sends an instruction message containing the request's type, title, content, enabled options, and branch name

#### Scenario: Branch naming convention
- **WHEN** starting a propose session
- **THEN** the system generates the branch name as `{prefix}/{slug}` where prefix is mapped from request type (`new-feature` -> `feat/`, `spec-change` -> `change/`, `refactoring` -> `refactor/`, `bugfix` -> `fix/`) and slug is derived from the request

#### Scenario: Propose instruction message content
- **WHEN** building the propose instruction message
- **THEN** the message includes: (1) branch creation instruction with the generated branch name, (2) openspec-propose skill execution with the request's title and content as context, (3) request type and enabled workflow options, (4) commit and push instruction

#### Scenario: Idempotent branch handling
- **WHEN** starting a propose session and a branch with the same name already exists
- **THEN** the system deletes the existing branch before proceeding (same pattern as bootstrap)

#### Scenario: Request not in draft status rejected
- **WHEN** attempting to start a propose session for a request not in `draft` status
- **THEN** the system rejects the operation with an error message indicating the request must be in draft status

#### Scenario: Non-owned request rejected
- **WHEN** an authenticated user attempts to start a propose session for a request they do not own
- **THEN** the system rejects with "Request not found" without revealing whether the request exists

#### Scenario: Stay on request detail after startup
- **WHEN** the propose session is successfully started
- **THEN** the UI remains on the request detail page; it does NOT auto-navigate to the SSE streaming chat view. The session list refreshes to show the new propose session with its current status

#### Scenario: Inline session progress
- **WHEN** the propose session is running and the user is on the request detail page
- **THEN** the UI displays the propose session status inline (e.g., "active", "waiting", "completed") on the session row. The user MAY click the session row to open the SSE stream view explicitly
