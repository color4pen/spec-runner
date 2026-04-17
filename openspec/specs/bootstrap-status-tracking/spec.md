## ADDED Requirements

### Requirement: Bootstrap Status State Machine
The system SHALL enforce a defined state machine for repository bootstrap status transitions.

#### Scenario: Valid state transitions
- **WHEN** the system attempts to update a repository's `bootstrap_status`
- **THEN** only the following transitions SHALL be permitted:
  - `uninitialized` -> `bootstrapping` (bootstrap initiated)
  - `bootstrapping` -> `pr_pending` (PR created successfully)
  - `bootstrapping` -> `uninitialized` (bootstrap failed, rollback)
  - `pr_pending` -> `ready` (PR merged)
  - `pr_pending` -> `uninitialized` (PR closed without merge, `bootstrap_pr_url` cleared)

#### Scenario: Invalid state transition rejected
- **WHEN** the system attempts a state transition not in the allowed transition map
- **THEN** the transition is rejected with an error describing the current state and attempted transition

#### Scenario: Terminal state behavior
- **WHEN** a repository has `bootstrap_status = 'ready'`
- **THEN** no further bootstrap status transitions are permitted in this phase (re-bootstrap is a future feature)

### Requirement: PR URL Extraction from Session Stream
The system SHALL extract the bootstrap PR URL from the managed agent session's output.

#### Scenario: PR URL detected in session events
- **WHEN** the bootstrap session produces text output containing a GitHub PR URL matching `https://github.com/{owner}/{repo}/pull/\d+`
- **THEN** the system captures the URL and transitions the repository to `pr_pending` with the URL stored in `bootstrap_pr_url`

#### Scenario: Session completes without PR URL
- **WHEN** the bootstrap session reaches `completed` or `archived` status without a PR URL being detected
- **THEN** the system transitions the repository back to `uninitialized` (bootstrap considered failed) and transitions the bootstrap request status to `cancelled` via `updateRequestStatus` (following the standard `in-progress -> cancelled` transition)

#### Scenario: Multiple PR URLs in stream
- **WHEN** the session output contains multiple GitHub PR URLs
- **THEN** the system uses the last matching URL (the final PR created is the most relevant)

#### Scenario: Bootstrap request identification
- **WHEN** the system needs to update the bootstrap request status as part of PR status sync or session completion handling
- **THEN** the system identifies the bootstrap request by querying the most recent `requests` record for the repository where `title = 'Bootstrap openspec-workflow'` and `status = 'in-progress'`. The request status transitions SHALL use `updateRequestStatus` to follow the standard state machine

### Requirement: PR Status Polling
The system SHALL poll the GitHub API for bootstrap PR status when the repository page is accessed.

#### Scenario: PR status check on page access
- **WHEN** an authenticated user accesses a repository page where `bootstrap_status = 'pr_pending'`
- **THEN** the system calls the GitHub API (`GET /repos/{owner}/{repo}/pulls/{number}`) using the user's OAuth token to check the PR's current state

#### Scenario: PR merged detected
- **WHEN** the GitHub API response indicates the PR is merged (`merged_at` is not null)
- **THEN** the system updates `bootstrap_status` to `ready` and transitions the bootstrap request status through `in-progress -> reviewing -> completed` using `updateRequestStatus` (following the standard state machine)

#### Scenario: PR closed without merge detected
- **WHEN** the GitHub API response indicates the PR is closed (`state === 'closed'`) and not merged (`merged_at` is null)
- **THEN** the system updates `bootstrap_status` to `uninitialized`, clears `bootstrap_pr_url`, and transitions the bootstrap request status to `cancelled` via `updateRequestStatus` (following the standard `in-progress -> cancelled` transition)

#### Scenario: PR still open
- **WHEN** the GitHub API response indicates the PR is still open (`state === 'open'`)
- **THEN** no status change occurs. The UI continues to show `pr_pending` with a link to the PR

#### Scenario: GitHub API failure during polling
- **WHEN** the GitHub API call for PR status fails (rate limit, network error, 404)
- **THEN** the system logs the error and retains the current `pr_pending` status without change. The next page access will retry

#### Scenario: PR number extraction from URL
- **WHEN** the system needs to poll a PR stored as `bootstrap_pr_url`
- **THEN** the PR number is extracted from the URL pattern `https://github.com/{owner}/{repo}/pull/{number}`

### Requirement: Workflow Execution Gating
The system SHALL prevent workflow execution (request creation, session creation) for repositories that are not in `ready` status.

#### Scenario: Request creation blocked for non-ready repositories
- **WHEN** a user attempts to create a request (via `createRequest` Server Action) for a repository where `bootstrap_status !== 'ready'`
- **THEN** the Server Action rejects with "Repository is not ready. Bootstrap must be completed first."

#### Scenario: UI controls disabled for non-ready repositories
- **WHEN** viewing a repository workspace where `bootstrap_status !== 'ready'`
- **THEN** the "New Request" button and session creation controls are disabled, with a message indicating bootstrap must be completed first

#### Scenario: Existing requests accessible regardless of status
- **WHEN** a repository transitions away from `ready` status (future re-bootstrap scenario)
- **THEN** existing requests and sessions remain accessible for viewing, but no new requests can be created
