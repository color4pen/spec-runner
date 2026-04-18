## MODIFIED Requirements

### Requirement: Create request type validation
The system SHALL validate request types including the newly added `bootstrap` type.

#### Scenario: Create request type validation
- **WHEN** creating a request with a type value
- **THEN** the system validates that type is one of `new-feature`, `spec-change`, `refactoring`, `bugfix`, `bootstrap` and rejects invalid values with a validation error

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
