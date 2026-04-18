## Requirements

### Requirement: GitHub Pull Request Creation
The system SHALL provide a function to create a pull request on a GitHub repository via the REST API.

#### Scenario: PR created successfully
- **WHEN** `createPullRequest` is called with a valid OAuth token, owner, repo, head branch, base branch, title, and body
- **THEN** the system calls `POST /repos/{owner}/{repo}/pulls` with the provided parameters and returns the created PR's URL and number

#### Scenario: PR creation fails due to invalid token
- **WHEN** `createPullRequest` is called with an expired or invalid OAuth token
- **THEN** the system throws an error with the HTTP status code and message from the GitHub API

#### Scenario: PR creation fails due to missing branch
- **WHEN** `createPullRequest` is called with a head branch that does not exist
- **THEN** the system throws an error indicating the branch was not found (GitHub API 422)

### Requirement: GitHub Pull Request Status Retrieval
The system SHALL provide a function to retrieve the current status of a pull request.

#### Scenario: PR status retrieved
- **WHEN** `getPullRequestStatus` is called with a valid token, owner, repo, and PR number
- **THEN** the system calls `GET /repos/{owner}/{repo}/pulls/{number}` and returns an object with `state` ('open' | 'closed'), `merged` (boolean), and `html_url`

#### Scenario: PR not found
- **WHEN** `getPullRequestStatus` is called with a PR number that does not exist
- **THEN** the system throws an error indicating the PR was not found (HTTP 404)

### Requirement: GitHub Pull Request Closure
The system SHALL provide a function to close an open pull request.

#### Scenario: PR closed successfully
- **WHEN** `closePullRequest` is called with a valid token, owner, repo, and PR number
- **THEN** the system calls `PATCH /repos/{owner}/{repo}/pulls/{number}` with `{ state: 'closed' }` and returns success

#### Scenario: PR already closed
- **WHEN** `closePullRequest` is called for a PR that is already closed
- **THEN** the operation succeeds without error (idempotent)

### Requirement: GitHub Branch Existence Check
The system SHALL provide a function to check whether a branch exists in a repository.

#### Scenario: Branch exists
- **WHEN** `getBranchExists` is called with a valid token, owner, repo, and branch name
- **THEN** the system calls `GET /repos/{owner}/{repo}/branches/{branch}` and returns `true`

#### Scenario: Branch does not exist
- **WHEN** `getBranchExists` is called with a branch name that does not exist
- **THEN** the system returns `false` (HTTP 404 is handled gracefully, not thrown)

### Requirement: GitHub Branch Deletion
The system SHALL provide a function to delete a branch from a repository.

#### Scenario: Branch deleted successfully
- **WHEN** `deleteBranch` is called with a valid token, owner, repo, and branch name
- **THEN** the system calls `DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}` and returns success

#### Scenario: Branch already deleted
- **WHEN** `deleteBranch` is called for a branch that does not exist
- **THEN** the operation succeeds without error (idempotent, HTTP 422 is ignored)

### Requirement: Existing PR Search by Head Branch
The system SHALL provide a function to find an existing open PR for a given head branch, to support idempotent PR creation.

#### Scenario: Existing PR found
- **WHEN** `findOpenPrByHead` is called with a valid token, owner, repo, and head branch
- **THEN** the system calls `GET /repos/{owner}/{repo}/pulls?head={owner}:{branch}&state=open` and returns the first PR's URL and number if found, or null if not found

#### Scenario: No existing PR
- **WHEN** `findOpenPrByHead` is called and no open PR exists for the head branch
- **THEN** the system returns `null`

### Requirement: Module Design Constraints
The `github-api.ts` module SHALL NOT use the `'use server'` directive. All functions accept an OAuth token as an explicit parameter. Authentication and authorization are the caller's responsibility.

#### Scenario: No server action directive
- **WHEN** inspecting `src/lib/github-api.ts`
- **THEN** the file does NOT contain `'use server'` at the top

#### Scenario: Token passed explicitly
- **WHEN** any function in `github-api.ts` is called
- **THEN** the OAuth token is received as a function parameter, not obtained from the session internally
