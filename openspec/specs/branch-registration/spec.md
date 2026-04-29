## Purpose

Register the agent-reported branch name on the request record via the `register_branch` Custom Tool.

## Requirements
### Requirement: register_branch Custom Tool Definition
The system SHALL define a `register_branch` Custom Tool that the agent calls after creating a branch, reporting the slug and branch name to spec-runner.

#### Scenario: Tool input schema
- **WHEN** the `register_branch` Custom Tool is defined
- **THEN** the `input_schema` specifies: `slug` (string, required) — the kebab-case slug used for the change folder, `branch_name` (string, required) — the full branch name (e.g., `feat/2026-04-25-slug-delegation`), and `request_id` (integer, required) — the DB id of the request

#### Scenario: Tool description
- **WHEN** the `register_branch` Custom Tool is defined
- **THEN** the `description` explains that the tool registers the branch name and slug with spec-runner after branch creation, and that it must be called exactly once after `git checkout -b`

### Requirement: register_branch Input Validation
The `register_branch` handler SHALL validate the input before persisting to the database.

#### Scenario: Valid input accepted
- **WHEN** `register_branch` receives `slug` (non-empty string matching kebab-case), `branch_name` (non-empty string containing at least one `/`), and `request_id` (positive integer)
- **THEN** the handler proceeds to update the database

#### Scenario: Empty slug rejected
- **WHEN** `register_branch` receives an empty or whitespace-only `slug`
- **THEN** the handler returns an error result: "Invalid input: slug must be a non-empty string"

#### Scenario: Empty branch_name rejected
- **WHEN** `register_branch` receives an empty or whitespace-only `branch_name`
- **THEN** the handler returns an error result: "Invalid input: branch_name must be a non-empty string"

#### Scenario: Slug format validation
- **WHEN** `register_branch` receives a `slug`
- **THEN** the handler validates that the slug matches the pattern `^[a-z0-9]+(-[a-z0-9]+)*$` (kebab-case, lowercase alphanumeric with hyphens, no leading/trailing hyphens). Date prefix (e.g., `2026-04-25-`) is permitted as part of the slug

### Requirement: register_branch Database Persistence
The `register_branch` handler SHALL update the `requests` table with the reported `branch_name`.

#### Scenario: Update branch_name on request
- **WHEN** `register_branch` is called with a valid `request_id` and `branch_name`
- **THEN** the handler updates `requests.branch_name` to the provided value and `requests.updated_at` to the current timestamp

#### Scenario: Request not found
- **WHEN** `register_branch` is called with a `request_id` that does not exist in the database
- **THEN** the handler returns an error result: "Request not found"

#### Scenario: Idempotent re-registration (last-write-wins)
- **WHEN** `register_branch` is called with a `request_id` that already has a non-null `branch_name` in the database
- **THEN** the handler overwrites the existing `branch_name` with the new value (last-write-wins semantics). This supports agent retries and branch recreation without requiring explicit cleanup

#### Scenario: Successful result returned to agent
- **WHEN** the database update succeeds
- **THEN** the handler returns a success result containing the confirmed `branch_name` and `slug`, so the agent can verify the registration

### Requirement: register_branch Execution Context
The `register_branch` handler SHALL be invoked from the SSE stream route, which has already verified session ownership via `verifySessionAccessByManagedId()`.

#### Scenario: Ownership verification delegation
- **WHEN** the `register_branch` handler receives a `request_id`
- **THEN** the handler validates that the `request_id` matches the `session.requestId` of the current session context (passed from the SSE stream route). This prevents an agent from registering a branch for a request it is not associated with

### Requirement: RequestSummary / RequestDetail Type Extension
The `RequestSummary` and `RequestDetail` public types SHALL include `branch_name` to expose the agent-reported branch name to the UI.

#### Scenario: branch_name exposed in RequestSummary
- **WHEN** the `RequestSummary` interface is defined
- **THEN** it includes `branchName: string | null` field, mapped from the `requests.branch_name` column

#### Scenario: branch_name available in getRequestDetail response
- **WHEN** `getRequestDetail(requestId)` is called for a request with a non-null `branch_name`
- **THEN** the response includes the `branchName` field with the stored value

#### Scenario: branch_name null for legacy requests
- **WHEN** `getRequestDetail(requestId)` is called for a request created before the migration
- **THEN** the `branchName` field is `null`
