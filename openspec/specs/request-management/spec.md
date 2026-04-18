## Requirements

### Requirement: Request Creation
The system SHALL allow authenticated users to create a request within a repository, storing it in the `requests` table with type, title, and content.

#### Scenario: Create request with valid input
- **WHEN** an authenticated user submits a new request form with type, title, and content for a repository they own
- **THEN** the system inserts a record into `requests` with `repository_id` referencing the user's repository, the specified type, title, content, status `draft`, and current timestamps

#### Scenario: Create request type validation
- **WHEN** creating a request with a type value
- **THEN** the system validates that type is one of `new-feature`, `spec-change`, `refactoring`, `bugfix`, `bootstrap` and rejects invalid values with a validation error

#### Scenario: Create request for non-owned repository rejected
- **WHEN** an authenticated user attempts to create a request for a repository not in their `repositories` table
- **THEN** the system rejects the request with an authorization error without revealing whether the repository exists

#### Scenario: Unauthenticated request creation rejected
- **WHEN** an unauthenticated request attempts to create a request
- **THEN** the system rejects the request and returns an authentication error

### Requirement: Request List
The system SHALL provide a list of requests for a given repository, ordered by creation date descending.

#### Scenario: List requests by repository
- **WHEN** an authenticated user requests the list of requests for a repository they own
- **THEN** the system returns requests for that repository ordered by `created_at` DESC, including id, type, title, status, and timestamps, with a default limit of 50 records per page

#### Scenario: List requests with pagination
- **WHEN** an authenticated user requests the list of requests with `limit` and `offset` parameters
- **THEN** the system returns at most `limit` records starting from `offset`, defaulting to limit=50, offset=0 if not specified

#### Scenario: List requests for non-owned repository rejected
- **WHEN** an authenticated user attempts to list requests for a repository not in their `repositories` table
- **THEN** the system rejects the request with an authorization error

#### Scenario: Empty request list
- **WHEN** the user has no requests for the current repository
- **THEN** the system returns an empty array

### Requirement: Request Detail
The system SHALL provide detailed information about a single request, including its associated sessions.

#### Scenario: Get request detail
- **WHEN** an authenticated user requests the detail of a request they own
- **THEN** the system returns the request's id, type, title, content, status, timestamps, and a list of associated sessions with their role, step, and status

#### Scenario: Get request detail for non-owned request rejected
- **WHEN** an authenticated user attempts to get the detail of a request not owned by them
- **THEN** the system rejects the request with an authorization error without revealing whether the request exists

### Requirement: Request Status Update
The system SHALL allow the owner of a request to update its status.

#### Scenario: Update request status
- **WHEN** an authenticated user updates the status of a request they own
- **THEN** the system updates the `status` and `updated_at` columns in `requests` and returns the updated record

#### Scenario: Status transition validation
- **WHEN** updating a request status
- **THEN** the system validates that the new status is one of `draft`, `in-progress`, `reviewing`, `completed`, `cancelled`

#### Scenario: Status transition rules
- **WHEN** updating a request status
- **THEN** the system enforces allowed transitions: `draft` → `in-progress` or `cancelled`, `in-progress` → `reviewing` or `cancelled`, `reviewing` → `completed` or `in-progress` (rework) or `cancelled`, `completed` → (terminal, no further transitions), `cancelled` → (terminal, no further transitions). Invalid transitions are rejected with a validation error

#### Scenario: Update status of non-owned request rejected
- **WHEN** an authenticated user attempts to update the status of a request not owned by them
- **THEN** the system rejects the request with an authorization error

### Requirement: Request Ownership Verification
The system SHALL verify request ownership by tracing the chain `requests → repositories → users` before any request operation.

#### Scenario: Ownership verified via repository chain
- **WHEN** a Server Action receives a request ID
- **THEN** the system joins `requests` with `repositories` and verifies that `repositories.user_id` matches the authenticated user's ID before proceeding

#### Scenario: Ownership verification failure
- **WHEN** the ownership chain verification fails (request not found or not owned)
- **THEN** the system throws a generic "Request not found" error without distinguishing between non-existent and unauthorized access

### Requirement: Bootstrap Request Creation Guard
The system SHALL allow `bootstrap` type requests to bypass the repository readiness check, since bootstrap requests are created while the repository is in `bootstrapping` state.

#### Scenario: Bootstrap request created for non-ready repository
- **WHEN** `startBootstrap` creates a request with `type: 'bootstrap'` for a repository with `bootstrap_status = 'bootstrapping'`
- **THEN** the request is created successfully (direct DB insert bypasses `createRequest` guard)

#### Scenario: Non-bootstrap request blocked for non-ready repository
- **WHEN** a user attempts to create a request with any type other than `bootstrap` for a repository where `bootstrap_status !== 'ready'`
- **THEN** the Server Action rejects with "Repository is not ready. Bootstrap must be completed first."

### Requirement: Request Status Transition Extension
The request status state machine SHALL allow cancellation from `reviewing` status, enabling bootstrap cancellation and general workflow abort.

#### Scenario: Reviewing to cancelled transition
- **WHEN** a request in `reviewing` status needs to be cancelled (e.g., bootstrap PR cancelled, or workflow aborted)
- **THEN** the system permits the `reviewing -> cancelled` transition
- **AND** the updated allowed transitions from `reviewing` are: `completed`, `in-progress` (rework), `cancelled`

#### Scenario: Updated transition map
- **WHEN** the request status transition map is applied
- **THEN** the allowed transitions are:
  - `draft` -> `in-progress` | `cancelled`
  - `in-progress` -> `reviewing` | `cancelled`
  - `reviewing` -> `completed` | `in-progress` (rework) | `cancelled`
  - `completed` -> (terminal)
  - `cancelled` -> (terminal)

### Requirement: Request Deletion Policy
The system SHALL NOT provide a delete operation for requests. Requests are logically closed by transitioning to `cancelled` or `completed` status.

#### Scenario: No delete endpoint
- **WHEN** an API consumer attempts to delete a request
- **THEN** no Server Action or API route exists for request deletion. Requests persist indefinitely and are only removed via CASCADE DELETE when their parent repository is removed
