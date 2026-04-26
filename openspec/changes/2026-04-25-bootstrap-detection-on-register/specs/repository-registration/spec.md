## MODIFIED Requirements

### Requirement: Explicit Repository Registration
The system SHALL allow users to register a repository explicitly from search results, replacing the auto-registration on workspace access pattern.

#### Scenario: Register repository from search results
- **WHEN** an authenticated user selects a repository from search results and confirms registration
- **THEN** the system calls the GitHub API (`GET /repos/{owner}/{repo}`) to verify access, detects bootstrap status via GitHub Contents API, and inserts a record into `repositories` with `user_id`, `owner`, `name`, `full_name`, `default_branch` (from API), and `bootstrap_status` set to the detected value (`ready` or `uninitialized`)

#### Scenario: Bootstrap status detection - fully bootstrapped repository
- **WHEN** the system registers a repository where both `openspec/project.md` and `requests/active/` exist on the default branch
- **THEN** the system SHALL set `bootstrap_status` to `ready`

#### Scenario: Bootstrap status detection - partially bootstrapped repository
- **WHEN** the system registers a repository where `openspec/project.md` exists but `requests/active/` does not exist on the default branch
- **THEN** the system SHALL set `bootstrap_status` to `uninitialized`

#### Scenario: Bootstrap status detection - uninitialized repository
- **WHEN** the system registers a repository where neither `openspec/project.md` nor `requests/active/` exist on the default branch
- **THEN** the system SHALL set `bootstrap_status` to `uninitialized`

#### Scenario: Bootstrap status detection - GitHub API error
- **WHEN** the GitHub Contents API returns an error (network failure, rate limit, 5xx) during bootstrap status detection
- **THEN** the system SHALL fall back to `bootstrap_status: 'uninitialized'` without throwing an error. The registration operation SHALL complete successfully

#### Scenario: Bootstrap status detection uses parallel API calls
- **WHEN** the system performs bootstrap status detection
- **THEN** the system SHALL check `openspec/project.md` and `requests/active/` in parallel using `Promise.all` to minimize registration latency

#### Scenario: Registration access verification
- **WHEN** the system attempts to register a repository
- **THEN** the system verifies the user has access to the repository via GitHub API. If the API returns 404 or 403, the system rejects registration with "Repository not found or not accessible" without revealing which error occurred

#### Scenario: Duplicate registration prevented
- **WHEN** an authenticated user attempts to register a repository that already exists for their account
- **THEN** the system rejects the registration with a "Repository already registered" error (enforced by unique constraint on `user_id + full_name`)
