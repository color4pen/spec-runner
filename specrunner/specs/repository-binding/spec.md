## Purpose

Bind a request to a specific repository so all sessions for the request operate on that repo.

## Requirements
### Requirement: Repository Registration
The system SHALL register a repository in the `repositories` table when a user explicitly selects it from the registration UI, replacing the previous auto-registration on workspace access.

#### Scenario: Explicit registration from search UI
- **WHEN** an authenticated user selects a repository from the search results in the registration UI
- **THEN** the system fetches repository metadata from the GitHub API using the user's OAuth token, verifies the user has access, and inserts a record into `repositories` with `user_id`, `owner`, `name`, `full_name`, `default_branch` (from the API response), and `bootstrap_status` set to `uninitialized`

#### Scenario: Repository access verification on registration
- **WHEN** the system attempts to register a repository
- **THEN** the system calls the GitHub API (`GET /repos/{owner}/{repo}`) using the user's OAuth token. If the API returns 404 or 403, the system rejects registration with a "Repository not found or not accessible" error without revealing which error occurred

#### Scenario: GitHub API failure fallback on registration
- **WHEN** the GitHub API call fails due to rate limiting, network error, or other transient failure during repository registration
- **THEN** the system returns an error to the user indicating the repository could not be verified at this time, and does NOT insert a record into `repositories`. The user may retry

#### Scenario: Existing repository not duplicated
- **WHEN** an authenticated user attempts to register a repository that already has a `repositories` record for that user
- **THEN** the system rejects with "Repository already registered" (enforced by unique constraint on `user_id + full_name`)

#### Scenario: Repository name validation
- **WHEN** registering a repository
- **THEN** the system validates that `owner` and `name` match the pattern `[a-zA-Z0-9._-]+` and rejects invalid values

### Requirement: Repository List for User
The system SHALL provide a list of registered repositories for the authenticated user, with bootstrap status information.

#### Scenario: List user repositories
- **WHEN** an authenticated user requests their registered repositories
- **THEN** the system returns all `repositories` records where `user_id` matches the authenticated user, ordered by `created_at` DESC, including `bootstrap_status` and `bootstrap_pr_url` in each record. The `RepositorySummary` type SHALL be extended to include `bootstrapStatus: string` and `bootstrapPrUrl: string | null` fields

#### Scenario: Repository list includes request counts
- **WHEN** the repository list is displayed
- **THEN** each repository entry includes the count of associated requests (total and active), computed via inline subquery

#### Scenario: Repository list pagination
- **WHEN** an authenticated user requests their repositories with `limit` and `offset` parameters
- **THEN** the system returns at most `limit` records starting from `offset`, defaulting to limit=50, offset=0 if not specified

### Requirement: Repository Lookup
The system SHALL provide a lookup function to find a repository record by user ID and full_name, used internally by request creation and other operations.

#### Scenario: Lookup existing repository
- **WHEN** the system looks up a repository by user_id and full_name
- **THEN** it returns the repository record if it exists

#### Scenario: Lookup non-existent repository
- **WHEN** the system looks up a repository that does not exist for the given user
- **THEN** it returns null (not an error), allowing the caller to decide how to handle
