## Purpose

Wrapper utilities around GitHub REST API for branches, file contents, and pull requests.
## Requirements

### Requirement: Branch File Listing
The github-api.ts module SHALL provide a function to list files in a directory on a specific branch.

#### Scenario: List directory contents on branch
- **WHEN** `getDirectoryContents(token, owner, repo, path, ref)` is called with a valid branch reference
- **THEN** the system calls GitHub Contents API `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}` and returns an array of file/directory entries with name, path, type, and size

#### Scenario: Directory not found on branch
- **WHEN** the specified path does not exist on the branch
- **THEN** the function returns an empty array (does not throw for 404)

#### Scenario: Branch not found
- **WHEN** the specified branch reference does not exist
- **THEN** the function returns an empty array (does not throw for 404)

#### Scenario: Directory entry limit
- **WHEN** a directory contains more than 1000 entries
- **THEN** the GitHub Contents API returns only the first 1000 entries. For change folder usage this limit is not expected to be reached; if needed in the future, the implementation should switch to the Git Trees API

### Requirement: Branch File Content Retrieval
The github-api.ts module SHALL provide a function to retrieve the content of a single file on a specific branch.

#### Scenario: Get file content on branch
- **WHEN** `getFileContent(token, owner, repo, path, ref)` is called with a valid file path and branch reference
- **THEN** the system calls GitHub Contents API `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}`, decodes the Base64 `content` field, and returns the decoded string

#### Scenario: File not found on branch
- **WHEN** the specified file does not exist on the branch
- **THEN** the function returns null (does not throw for 404)

#### Scenario: File content encoding
- **WHEN** the GitHub API returns file content
- **THEN** the function decodes the `content` field from Base64 encoding (GitHub's default) and returns the UTF-8 string

### Requirement: PR Listing via REST API

The GitHubClient port SHALL provide a method to list pull requests for a given head branch.

#### Scenario: List PRs by head branch
- **WHEN** `listPullRequests(owner, repo, head, base, state)` is called
- **THEN** the system calls `GET /repos/{owner}/{repo}/pulls?head={owner}:{head}&base={base}&state=all` and returns an array of PR entries with `url`, `number`, `state` (normalized to `"OPEN"` / `"MERGED"` / `"CLOSED"`)

#### Scenario: No PRs exist
- **WHEN** no PRs match the head/base filter
- **THEN** the function returns an empty array

#### Scenario: Merged PR detection
- **WHEN** a PR has `state: "closed"` and `merged_at` is non-null in the REST response
- **THEN** the entry's `state` is normalized to `"MERGED"`

### Requirement: PR Creation via REST API

The GitHubClient port SHALL provide a method to create a pull request.

#### Scenario: Create PR
- **WHEN** `createPullRequest(owner, repo, head, base, title, body)` is called
- **THEN** the system calls `POST /repos/{owner}/{repo}/pulls` with `{ title, body, head, base }` and returns `{ url, number }` from the response

#### Scenario: Create PR auth failure
- **WHEN** the GitHub API returns 401
- **THEN** the function throws `SpecRunnerError(GITHUB_TOKEN_EXPIRED)`

### Requirement: PR View via REST API

The GitHubClient port SHALL provide a method to fetch a single PR's status.

#### Scenario: Get PR details
- **WHEN** `getPullRequest(owner, repo, prNumber)` is called
- **THEN** the system calls `GET /repos/{owner}/{repo}/pulls/{pull_number}` and returns a normalized object with:
  - `state`: `"OPEN"` / `"MERGED"` / `"CLOSED"` (from `state` + `merged` fields)
  - `mergeStateStatus`: uppercase string (from `mergeable_state`)
  - `headRefName`: string (from `head.ref`)
  - `mergeable`: `"MERGEABLE"` / `"CONFLICTING"` / `"UNKNOWN"` (from `mergeable` boolean/null)

#### Scenario: Mergeable not yet computed
- **WHEN** the REST API returns `mergeable: null`
- **THEN** the `mergeable` field is normalized to `"UNKNOWN"`

#### Scenario: PR not found
- **WHEN** the GitHub API returns 404
- **THEN** the function throws `SpecRunnerError(GITHUB_API_ERROR)` with status 404

### Requirement: PR Merge via REST API

The GitHubClient port SHALL provide a method to merge a pull request.

#### Scenario: Squash merge PR
- **WHEN** `mergePullRequest(owner, repo, prNumber, { mergeMethod: "squash" })` is called
- **THEN** the system calls `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` with `{ merge_method: "squash" }` and returns `{ merged: true, message }` on success

#### Scenario: PR not mergeable
- **WHEN** the GitHub API returns 405 (Method Not Allowed)
- **THEN** the function returns `{ merged: false, message }` (does not throw)

#### Scenario: Head branch modified
- **WHEN** the GitHub API returns 409 (Conflict)
- **THEN** the function returns `{ merged: false, message }` (does not throw)

### Requirement: Retry and Rate Limit Handling

All GitHub REST API calls SHALL respect rate limits and retry on transient errors.

#### Scenario: 5xx server error with retry
- **WHEN** a REST API call returns 5xx
- **THEN** the client retries with exponential backoff (base=1s, factor=2, jitter) up to 3 times before throwing

#### Scenario: Network error with retry
- **WHEN** a REST API call fails with a network error (e.g., ECONNRESET)
- **THEN** the client retries with the same exponential backoff policy

#### Scenario: Rate limit exceeded (429)
- **WHEN** a REST API call returns 429 Too Many Requests
- **THEN** the client waits for the duration specified by the `Retry-After` header before retrying

#### Scenario: Primary rate limit exhausted
- **WHEN** `X-RateLimit-Remaining` is `0`
- **THEN** the client waits until the timestamp in `X-RateLimit-Reset` before making the next request

### Requirement: API Version Header

All GitHub REST API calls SHALL include the `X-GitHub-Api-Version` header.

#### Scenario: Version header present
- **WHEN** any REST API call is made
- **THEN** the request includes `X-GitHub-Api-Version: 2022-11-28`
