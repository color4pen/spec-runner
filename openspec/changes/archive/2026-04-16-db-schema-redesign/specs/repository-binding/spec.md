## ADDED Requirements

### Requirement: Repository Registration
The system SHALL register a repository in the `repositories` table when a user first accesses a repository workspace, creating a binding between user and repository.

#### Scenario: Auto-register repository on workspace access
- **WHEN** an authenticated user navigates to `/repos/{owner}/{repo}` and no `repositories` record exists for that user and repository
- **THEN** the system fetches repository metadata from the GitHub API using the user's OAuth token, verifies the user has access, and inserts a record into `repositories` with `user_id`, `owner`, `name`, `full_name` (as `owner/name`), and `default_branch` (from the API response)

#### Scenario: Repository access verification on registration
- **WHEN** the system attempts to auto-register a repository
- **THEN** the system calls the GitHub API (`GET /repos/{owner}/{repo}`) using the user's OAuth token. If the API returns 404 or 403, the system rejects registration with a "Repository not found or not accessible" error without revealing which error occurred

#### Scenario: GitHub API failure fallback on registration
- **WHEN** the GitHub API call fails due to rate limiting, network error, or other transient failure during repository registration
- **THEN** the system returns an error to the user indicating the repository could not be verified at this time, and does NOT insert a record into `repositories`. The user may retry

#### Scenario: Existing repository not duplicated
- **WHEN** an authenticated user navigates to a repository workspace that already has a `repositories` record for that user
- **THEN** the system uses the existing record without creating a duplicate (enforced by unique constraint on `user_id + full_name`)

#### Scenario: Repository name validation
- **WHEN** registering a repository
- **THEN** the system validates that `owner` and `name` match the pattern `[a-zA-Z0-9._-]+` and rejects invalid values

### Requirement: Repository List for User
The system SHALL provide a list of registered repositories for the authenticated user.

#### Scenario: List user repositories
- **WHEN** an authenticated user requests their registered repositories
- **THEN** the system returns all `repositories` records where `user_id` matches the authenticated user, ordered by `created_at` DESC

#### Scenario: Repository list includes request counts
- **WHEN** the repository list is displayed
- **THEN** each repository entry includes the count of associated requests (total and active)

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
- **THEN** it returns null (not an error), allowing the caller to decide whether to auto-register
