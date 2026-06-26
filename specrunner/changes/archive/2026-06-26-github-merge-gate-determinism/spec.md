# Spec: github-merge-gate-determinism

## Requirements

### Requirement: Successful mutation responses MUST be returned immediately regardless of rate-limit headers

The `request()` method in `GitHubApiClient` SHALL return a 2xx response to the caller immediately
without re-issuing the request, even when the response carries `X-RateLimit-Remaining: 0`.

#### Scenario: 2xx + X-RateLimit-Remaining:0 returns immediately

**Given** `request()` is called with a POST, PUT, or GET method
**When** the server responds with status 200 or 201 and includes `X-RateLimit-Remaining: 0`
**Then** `request()` returns the response to the caller without making another HTTP call and without calling sleepFn

---

### Requirement: Non-idempotent mutations MUST NOT be retried on 5xx or network errors

The `request()` method SHALL not retry HTTP requests whose method is POST or PUT
when a 5xx response is received or a network error is thrown. The first 5xx or network
error on a POST/PUT SHALL cause `request()` to throw `GITHUB_API_ERROR` immediately.

GET and DELETE are exempt: they retain their existing retry behavior.

#### Scenario: POST 5xx → immediate throw, no retry

**Given** `request()` is called with method POST
**When** the server responds with status 500
**Then** `request()` throws `GITHUB_API_ERROR` after exactly 1 fetch call (no retry), and sleepFn is not called for 5xx backoff

#### Scenario: PUT 5xx → immediate throw, no retry

**Given** `request()` is called with method PUT
**When** the server responds with status 502
**Then** `request()` throws `GITHUB_API_ERROR` after exactly 1 fetch call (no retry)

#### Scenario: GET 5xx → retries as before

**Given** `request()` is called with method GET (or no method)
**When** the server persistently responds with 5xx
**Then** `request()` retries up to MAX_5XX_RETRIES times before throwing, unchanged from current behavior

---

### Requirement: createPullRequest MUST be idempotent on duplicate PR

`createPullRequest` SHALL treat a 422 response whose error message indicates "already exists"
as a success by locating and returning the existing pull request. It MUST NOT create a
duplicate PR or report failure for an already-existing PR.

#### Scenario: 422 "already exists" → returns existing PR

**Given** `createPullRequest` is called for a head/base pair that already has an open PR
**When** the POST /pulls call returns 422 with a message indicating the PR already exists
**Then** `createPullRequest` calls `listPullRequests` and returns `{ url, number }` of the existing PR
**Then** no duplicate PR is created

#### Scenario: 422 other error → throws

**Given** `createPullRequest` receives a 422 response for a reason other than "already exists"
**When** the error body does not indicate a duplicate PR
**Then** `createPullRequest` throws `GITHUB_API_ERROR` as it does for other non-201 statuses

---

### Requirement: mergePullRequest MUST report already-merged as success

`mergePullRequest` SHALL return `{ merged: true }` when GitHub responds with 405 and a
message indicating the PR has already been merged. It MUST NOT report `merged: false` for
a PR that is already in a merged state.

#### Scenario: 405 "already merged" → merged: true

**Given** `mergePullRequest` is called for a PR that was already merged
**When** the PUT /pulls/{n}/merge call returns 405 with a message containing "already merged"
**Then** `mergePullRequest` returns `{ merged: true, message: "Pull Request already merged" }`

---

### Requirement: getCheckStatus MUST fetch all commit statuses via pagination

`getCheckStatus` SHALL use the paginated `/commits/{ref}/statuses` endpoint with
`per_page=100` and SHALL follow `Link: rel="next"` pages until all statuses are fetched.
A failure status that appears on any page MUST be included in the `failing` array of the rollup.

#### Scenario: commit statuses span 2 pages, page 2 has failure

**Given** a commit ref with >30 individual statuses across 2 pages
**When** `getCheckStatus` is called
**Then** it issues at least 2 fetch calls for the /statuses endpoint
**Then** a `state: "failure"` status from page 2 appears in `result.failing`

#### Scenario: duplicate context on multiple pages — deduplication keeps first (newest)

**Given** the `/statuses` endpoint returns the same context on page 1 (success) and page 2 (failure)
(GitHub returns newest first)
**When** `getCheckStatus` is called
**Then** only the page-1 (newest) entry for that context is used in the rollup

---

### Requirement: Retry-After header MUST support HTTP-date format

The `request()` method SHALL parse `Retry-After` as an HTTP-date when the value is not
a valid non-negative integer. Unrecognizable values SHALL fall back to a safe default
wait (≥10 s) and MUST NOT result in immediate retry.

#### Scenario: Retry-After integer seconds

**Given** a 429 response with `Retry-After: 30`
**When** `request()` processes the response
**Then** sleepFn is called with 30 000 ms (≤ 60 000 ms cap)

#### Scenario: Retry-After HTTP-date

**Given** a 429 response with `Retry-After: Thu, 26 Jun 2026 10:00:00 GMT` (30 s in the future)
**When** `request()` processes the response
**Then** sleepFn is called with approximately 30 000 ms (within ±5 s tolerance), capped at 60 000 ms

#### Scenario: Retry-After invalid value

**Given** a 429 response with `Retry-After: garbage`
**When** `request()` processes the response
**Then** sleepFn is called with ≥ 10 000 ms (safe fallback, not instant retry)

---

### Requirement: Pagination MUST NOT follow Link URLs to a different origin

Before following a `Link: rel="next"` URL from a GitHub API response, the client SHALL
verify that the URL's origin (protocol + hostname + port) matches the configured base URL.
Mismatched origins MUST cause an immediate `GITHUB_API_ERROR` throw without making any
additional HTTP request with the Authorization token.

#### Scenario: cross-origin next URL is rejected

**Given** a check-runs, commit-statuses, PR files, issues, or comments pagination response
**When** the `Link: rel="next"` URL has a different hostname than the configured base URL
**Then** `getCheckStatus` (or the calling method) throws `GITHUB_API_ERROR`
**Then** no fetch call is made to the cross-origin URL
