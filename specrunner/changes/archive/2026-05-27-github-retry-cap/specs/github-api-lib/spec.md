## Requirements

### Requirement: Retry and Rate Limit Handling

The client SHALL cap 429 and `X-RateLimit-Remaining: 0` retries at `MAX_429_RETRIES` (5) using a single shared counter, and MUST throw `SpecRunnerError(GITHUB_API_ERROR)` when the limit is exceeded.

#### Scenario: 429 retry exhausted

- **WHEN** a REST API call returns 429 Too Many Requests continuously
- **THEN** the client retries up to `MAX_429_RETRIES` (5) times, and throws `SpecRunnerError(GITHUB_API_ERROR)` when exhausted

#### Scenario: Rate limit remaining exhausted

- **WHEN** `X-RateLimit-Remaining` is `0` on consecutive responses
- **THEN** the client retries up to `MAX_429_RETRIES` (5) times (counter shared with 429), and throws `SpecRunnerError(GITHUB_API_ERROR)` when exhausted

#### Scenario: 429 and rate-limit share retry counter

- **WHEN** 429 responses and `X-RateLimit-Remaining: 0` responses occur in any combination
- **THEN** a single shared counter tracks both, and the total retries do not exceed `MAX_429_RETRIES` (5)
