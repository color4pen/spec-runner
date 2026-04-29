## Purpose

Cancel an in-flight bootstrap, archive the session, and revert repository status.

## Requirements

### Requirement: Cancel Bootstrap from Bootstrapping State
The system SHALL allow the repository owner to cancel a bootstrap that is in `bootstrapping` state, archiving the session and reverting the repository status.

#### Scenario: Active bootstrap session identification
- **WHEN** `cancelBootstrap` needs to find the active bootstrap session for archiving
- **THEN** the system queries: `requests WHERE repository_id = ? AND type = 'bootstrap' AND status IN ('draft', 'in-progress', 'reviewing')` to find the bootstrap request, then `sessions WHERE request_id = ? AND role = 'bootstrap' AND status = 'active'` to find the active session. If no active session is found, the system skips the API archive step and proceeds with DB status updates only

#### Scenario: Cancel during bootstrapping
- **WHEN** `cancelBootstrap` is called for a repository with `bootstrap_status = 'bootstrapping'`
- **THEN** the system identifies the active bootstrap session (see above), archives it via the Managed Agents API, updates the session status to `archived`, transitions `bootstrap_status` to `uninitialized`, and transitions the bootstrap request status to `cancelled`

#### Scenario: Session archive failure during cancel
- **WHEN** the Managed Agents API archive call fails during cancellation
- **THEN** the system logs the error, proceeds with DB status updates (best-effort), and does not re-throw the API error

### Requirement: Cancel Bootstrap from PR Pending State
The system SHALL allow the repository owner to cancel a bootstrap that is in `pr_pending` state, closing the PR, deleting the branch, and reverting the repository status.

#### Scenario: Cancel during pr_pending
- **WHEN** `cancelBootstrap` is called for a repository with `bootstrap_status = 'pr_pending'`
- **THEN** the system closes the PR via `github-api.ts`, deletes the bootstrap branch via `github-api.ts`, clears `bootstrap_pr_url`, transitions `bootstrap_status` to `uninitialized`, and transitions the bootstrap request status to `cancelled`

#### Scenario: PR already closed during cancel
- **WHEN** `cancelBootstrap` is called and the PR is already closed or merged
- **THEN** the system proceeds with status updates without error (idempotent PR close)

#### Scenario: Branch already deleted during cancel
- **WHEN** `cancelBootstrap` is called and the bootstrap branch has already been deleted
- **THEN** the system proceeds with status updates without error (idempotent branch delete)

### Requirement: Cancel Bootstrap Idempotency
The system SHALL handle repeated cancel calls gracefully.

#### Scenario: Cancel called for non-cancellable state
- **WHEN** `cancelBootstrap` is called for a repository with `bootstrap_status` of `uninitialized` or `ready`
- **THEN** the system returns without error (no-op)

### Requirement: Cancel Bootstrap Authorization
Only the repository owner SHALL be able to cancel a bootstrap.

#### Scenario: Owner cancels bootstrap
- **WHEN** an authenticated user who owns the repository calls `cancelBootstrap`
- **THEN** the operation proceeds

#### Scenario: Non-owner cancel rejected
- **WHEN** an authenticated user who does not own the repository calls `cancelBootstrap`
- **THEN** the system rejects with "Repository not found" (via `getRepositoryWithBootstrapStatus` ownership check)

#### Scenario: Unauthenticated cancel rejected
- **WHEN** an unauthenticated request calls `cancelBootstrap`
- **THEN** the system rejects with an authentication error

### Requirement: Cancel Bootstrap UI
The client SHALL display a cancel button when the repository is in a cancellable bootstrap state.

#### Scenario: Cancel button visible during bootstrapping
- **WHEN** viewing a repository with `bootstrap_status = 'bootstrapping'`
- **THEN** a "Cancel Bootstrap" button is displayed

#### Scenario: Cancel button visible during pr_pending
- **WHEN** viewing a repository with `bootstrap_status = 'pr_pending'`
- **THEN** a "Cancel Bootstrap" button is displayed alongside the PR link

#### Scenario: Cancel button hidden for non-cancellable states
- **WHEN** viewing a repository with `bootstrap_status` of `uninitialized` or `ready`
- **THEN** no cancel button is displayed
