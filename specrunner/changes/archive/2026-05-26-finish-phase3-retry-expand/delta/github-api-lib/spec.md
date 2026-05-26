## Requirements

### Requirement: PR Merge via REST API

The GitHubClient port SHALL provide a method to merge a pull request, with built-in retry for transient failures. Transient merge failures (HTTP 405 with "Base branch was modified", "unstable state", "not mergeable", "Head branch was modified", or "required status check" messages, and HTTP 423 Locked) SHALL be retried with exponential backoff (1s, 2s, 4s) up to 3 retries. Permanent failures (HTTP 403, 409) MUST NOT be retried.

#### Scenario: PR not mergeable with retry

- **WHEN** `mergePullRequest()` receives HTTP 405 with message containing "not mergeable"
- **THEN** the adapter retries with exponential backoff, up to 3 retries, and returns the final result

#### Scenario: Head branch modified with retry

- **WHEN** `mergePullRequest()` receives HTTP 405 with message containing "Head branch was modified"
- **THEN** the adapter retries with exponential backoff, up to 3 retries, and returns the final result

#### Scenario: Required status check expected with retry

- **WHEN** `mergePullRequest()` receives HTTP 405 with message containing "required status check"
- **THEN** the adapter retries with exponential backoff, up to 3 retries, and returns the final result
