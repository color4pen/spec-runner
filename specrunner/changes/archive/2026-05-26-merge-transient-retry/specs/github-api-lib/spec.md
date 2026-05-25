## Requirements

### Requirement: PR Merge via REST API

The GitHubClient port SHALL provide a method to merge a pull request, with built-in retry for transient failures. Transient merge failures (HTTP 405 with "Base branch was modified" or "unstable state" messages, and HTTP 423 Locked) SHALL be retried with exponential backoff (1s, 2s, 4s) up to 3 attempts total. Permanent failures (HTTP 403, 409, non-transient 405) MUST NOT be retried.

#### Scenario: Squash merge PR

- **WHEN** `mergePullRequest(owner, repo, prNumber, { mergeMethod: "squash" })` is called
- **THEN** the system calls `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` with `{ merge_method: "squash" }` and returns `{ merged: true, message }` on success

#### Scenario: PR not mergeable

- **WHEN** the GitHub API returns 405 (Method Not Allowed) with a non-transient message
- **THEN** the function returns `{ merged: false, message }` without retry

#### Scenario: Head branch modified

- **WHEN** the GitHub API returns 409 (Conflict)
- **THEN** the function returns `{ merged: false, message }` without retry

#### Scenario: Transient 405 merge failure with retry

- **WHEN** `mergePullRequest()` receives HTTP 405 with message containing "Base branch was modified"
- **THEN** the adapter retries with exponential backoff (1s, 2s, 4s), up to 3 attempts total, and returns the final result

#### Scenario: Transient 405 unstable state with retry

- **WHEN** `mergePullRequest()` receives HTTP 405 with message containing "unstable state"
- **THEN** the adapter retries with exponential backoff, up to 3 attempts total, and returns the final result

#### Scenario: Transient 423 Locked merge failure with retry

- **WHEN** `mergePullRequest()` receives HTTP 423 (Locked)
- **THEN** the adapter retries with exponential backoff, up to 3 attempts total, and returns the final result

#### Scenario: Permanent 403 merge failure without retry

- **WHEN** `mergePullRequest()` receives HTTP 403
- **THEN** the function returns `{ merged: false, message }` immediately without retry

#### Scenario: Permanent 409 merge failure without retry

- **WHEN** `mergePullRequest()` receives HTTP 409
- **THEN** the function returns `{ merged: false, message }` immediately without retry

#### Scenario: Transient retry exhausted

- **WHEN** `mergePullRequest()` receives transient failures for all 3 attempts
- **THEN** the function returns `{ merged: false, message }` from the last attempt (does not throw)

#### Scenario: Merge retry logging

- **WHEN** a transient merge failure triggers a retry
- **THEN** the adapter writes a log line to stdout in the format "GitHub PR merge retry: {message}, retrying ({attempt}/3)..." before sleeping
