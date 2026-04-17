## ADDED Requirements

### Requirement: Repository Search
The system SHALL provide a search interface for finding GitHub repositories to register, using the GitHub Search API.

#### Scenario: Search repositories by query
- **WHEN** an authenticated user submits a search query in the repository registration UI
- **THEN** the system calls the GitHub Search API (`GET /search/repositories?q={query}+user:{user}`) using the user's OAuth token and returns matching repositories with name, full_name, description, language, and private flag

#### Scenario: Search results exclude already-registered repositories
- **WHEN** the system returns search results
- **THEN** repositories that are already registered for the authenticated user (exist in the `repositories` table) SHALL be marked as "already registered" and SHALL NOT be registerable again

#### Scenario: Search with empty query rejected
- **WHEN** an authenticated user submits an empty or whitespace-only search query
- **THEN** the system rejects the request with a validation error without calling the GitHub API

#### Scenario: GitHub API failure during search
- **WHEN** the GitHub Search API returns an error (rate limit, network failure, 401/403)
- **THEN** the system returns an appropriate error message to the user without crashing. For 401, the message SHALL indicate re-authentication is needed

### Requirement: Explicit Repository Registration
The system SHALL allow users to register a repository explicitly from search results, replacing the auto-registration on workspace access pattern.

#### Scenario: Register repository from search results
- **WHEN** an authenticated user selects a repository from search results and confirms registration
- **THEN** the system calls the GitHub API (`GET /repos/{owner}/{repo}`) to verify access, inserts a record into `repositories` with `user_id`, `owner`, `name`, `full_name`, `default_branch` (from API), and `bootstrap_status` defaulting to `uninitialized`

#### Scenario: Registration access verification
- **WHEN** the system attempts to register a repository
- **THEN** the system verifies the user has access to the repository via GitHub API. If the API returns 404 or 403, the system rejects registration with "Repository not found or not accessible" without revealing which error occurred

#### Scenario: Duplicate registration prevented
- **WHEN** an authenticated user attempts to register a repository that already exists for their account
- **THEN** the system rejects the registration with a "Repository already registered" error (enforced by unique constraint on `user_id + full_name`)

### Requirement: Registered Repository List
The system SHALL display only registered repositories in the sidebar/main repository list, replacing the GitHub API full repository listing.

#### Scenario: List registered repositories
- **WHEN** an authenticated user views the repositories page
- **THEN** the system returns all `repositories` records where `user_id` matches the authenticated user, ordered by `created_at` DESC, with `bootstrap_status` included in each entry

#### Scenario: Repository list with bootstrap status badges
- **WHEN** the repository list is displayed
- **THEN** each repository entry shows a visual badge indicating its `bootstrap_status`: `uninitialized` (gray), `bootstrapping` (yellow/spinning), `pr_pending` (blue), `ready` (green)

#### Scenario: Repository list includes request counts
- **WHEN** the repository list is displayed
- **THEN** each repository entry includes the count of associated requests (total and active), computed via inline subquery to avoid N+1 queries

#### Scenario: Repository list pagination
- **WHEN** an authenticated user requests their repositories with `limit` and `offset` parameters
- **THEN** the system returns at most `limit` records starting from `offset`, defaulting to limit=50, offset=0 if not specified

### Requirement: Repository Registration UI
The system SHALL provide a UI component for searching and registering repositories from the repository list page.

#### Scenario: Search input and results display
- **WHEN** a user opens the registration dialog (e.g., "Add Repository" button)
- **THEN** a dialog/modal with a search input field is shown. Typing triggers a debounced search (300ms) and results are displayed below the input

#### Scenario: Registration confirmation
- **WHEN** a user selects a repository from search results
- **THEN** the repository is registered immediately (no additional confirmation dialog for registration itself). The repository list refreshes to show the newly registered repository with `uninitialized` status
