# Test Cases: github-merge-gate-determinism

## Summary

- **Total**: 30 cases
- **Automated** (unit/integration): 29
- **Manual**: 1
- **Priority**: must: 13, should: 17, could: 0

---

## Area 1: X-RateLimit-Remaining:0 — no re-fire on successful responses (Bug ①a, T-01)

### TC-001: 2xx + X-RateLimit-Remaining:0 returns immediately

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Successful mutation responses MUST be returned immediately regardless of rate-limit headers > Scenario: 2xx + X-RateLimit-Remaining:0 returns immediately

---

### TC-002: POST 201 + X-RateLimit-Remaining:0 returns immediately without second fetch

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08b (TC-RC-012)

**GIVEN** `request()` is called via `createIssueComment` (method POST)
**WHEN** the server responds 201 with `X-RateLimit-Remaining: 0`
**THEN** `fetchFn` is called exactly once, `sleepFn` is not called for rate-limit, and the response is returned to the caller

---

## Area 2: POST/PUT 5xx and network errors — no retry (Bug ①b, T-02)

### TC-003: POST 5xx → immediate throw, no retry

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Non-idempotent mutations MUST NOT be retried on 5xx or network errors > Scenario: POST 5xx → immediate throw, no retry

---

### TC-004: PUT 5xx → immediate throw, no retry

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Non-idempotent mutations MUST NOT be retried on 5xx or network errors > Scenario: PUT 5xx → immediate throw, no retry

---

### TC-005: GET 5xx → retries as before

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Non-idempotent mutations MUST NOT be retried on 5xx or network errors > Scenario: GET 5xx → retries as before

---

### TC-006: POST network error → throws immediately, no retry

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `request()` is called with method POST
**WHEN** `fetchFn` throws a network error (e.g., `TypeError: Failed to fetch`)
**THEN** `request()` rethrows the error immediately after exactly 1 fetch call; `sleepFn` is not called for network-error backoff

---

### TC-007: PUT network error → throws immediately, no retry

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** `request()` is called with method PUT
**WHEN** `fetchFn` throws a network error
**THEN** `request()` rethrows the error immediately after exactly 1 fetch call; `sleepFn` is not called for network-error backoff

---

## Area 3: createPullRequest idempotency (Bug ①a caller, T-03)

### TC-008: 422 "already exists" → returns existing PR

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: createPullRequest MUST be idempotent on duplicate PR > Scenario: 422 "already exists" → returns existing PR

---

### TC-009: 422 other error → throws GITHUB_API_ERROR

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: createPullRequest MUST be idempotent on duplicate PR > Scenario: 422 other error → throws

---

### TC-010: 422 "already exists" but listPullRequests returns empty → throws

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08e (TC-CP-003)

**GIVEN** `createPullRequest` receives a 422 response with message `"A pull request already exists for owner:branch"`
**WHEN** the subsequent `listPullRequests` call returns an empty array
**THEN** `createPullRequest` throws `GITHUB_API_ERROR` (no PR found to return as existing)

---

## Area 4: mergePullRequest already-merged (Bug ①a caller, T-04)

### TC-011: 405 "already merged" → merged: true

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: mergePullRequest MUST report already-merged as success > Scenario: 405 "already merged" → merged: true

---

### TC-012: 405 "already merged" case-insensitive match → merged: true

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08f (TC-PM-024)

**GIVEN** `mergePullRequest` is called for a PR that was already merged
**WHEN** the PUT /pulls/{n}/merge call returns 405 with body `{ "message": "Pull request already merged" }` (lowercase 'r')
**THEN** `mergePullRequest` returns `{ merged: true }` (case-insensitive match succeeds)

---

### TC-013: 405 with non-"already merged" message → merged: false

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08f (TC-PM-002 existing behavior)

**GIVEN** `mergePullRequest` is called for a PR that is not mergeable
**WHEN** the PUT /pulls/{n}/merge call returns 405 with body `{ "message": "Pull Request is not mergeable" }`
**THEN** `mergePullRequest` returns `{ merged: false, message: "Pull Request is not mergeable" }` (existing behavior unchanged)

---

## Area 5: getCheckStatus commit statuses pagination (Bug ②, T-05)

### TC-014: commit statuses span 2 pages, page 2 has failure → in result.failing

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: getCheckStatus MUST fetch all commit statuses via pagination > Scenario: commit statuses span 2 pages, page 2 has failure

---

### TC-015: duplicate status context across pages — first (newest) wins

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: getCheckStatus MUST fetch all commit statuses via pagination > Scenario: duplicate context on multiple pages — deduplication keeps first (newest)

---

### TC-016: single-page /statuses response with no Link header — no extra fetch

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08g (TC-CS-015)

**GIVEN** `getCheckStatus` is called for a ref with ≤100 commit statuses
**WHEN** the `/commits/{ref}/statuses` response has no `Link` header
**THEN** `fetchFn` is called exactly once for the statuses endpoint (no second statuses page fetch); the rollup result is correct

---

### TC-017: non-200 response from /statuses endpoint → throws GITHUB_API_ERROR

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05 acceptance criteria

**GIVEN** `getCheckStatus` is called for a valid ref
**WHEN** the `/commits/{ref}/statuses` endpoint returns 403 or 404
**THEN** `getCheckStatus` throws `GITHUB_API_ERROR`; no further statuses fetch is attempted

---

## Area 6: Retry-After parsing — HTTP-date and fallback (Bug ③, T-06)

### TC-018: Retry-After integer seconds

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Retry-After header MUST support HTTP-date format > Scenario: Retry-After integer seconds

---

### TC-019: Retry-After HTTP-date

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Retry-After header MUST support HTTP-date format > Scenario: Retry-After HTTP-date

---

### TC-020: Retry-After invalid value → safe fallback, not instant

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Retry-After header MUST support HTTP-date format > Scenario: Retry-After invalid value

---

### TC-021: Retry-After integer exceeding 60 → capped at 60 000 ms

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 acceptance criteria

**GIVEN** a 429 response with `Retry-After: 120`
**WHEN** `request()` processes the response
**THEN** `sleepFn` is called with `60_000` ms (capped at 60 s maximum)

---

### TC-022: Retry-After HTTP-date in the past → floor 1 000 ms

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08d (TC-RC-018)

**GIVEN** a 429 response with `Retry-After` set to an HTTP-date already in the past
**WHEN** `request()` processes the response
**THEN** `sleepFn` is called with `1_000` ms (minimum floor, not 0 or negative)

---

### TC-023: Retry-After header absent → default 60 000 ms

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06 acceptance criteria

**GIVEN** a 429 response with no `Retry-After` header
**WHEN** `request()` processes the response
**THEN** `sleepFn` is called with `60_000` ms (unchanged default behavior)

---

## Area 7: Same-origin guard for pagination Link URLs (T-07)

### TC-024: cross-origin next URL is rejected

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Pagination MUST NOT follow Link URLs to a different origin > Scenario: cross-origin next URL is rejected

---

### TC-025: getCheckStatus commit-statuses cross-origin next URL → throws, no fetch to evil URL

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08h (TC-SO-002)

**GIVEN** `getCheckStatus` is processing paginated commit statuses
**WHEN** page 1 of `/statuses` returns a `Link` header whose `rel="next"` URL has a different hostname than the configured base URL
**THEN** `getCheckStatus` throws `GITHUB_API_ERROR`; `fetchFn` is called exactly once (page 1 only; the cross-origin URL is never fetched)

---

### TC-026: listPullRequestFiles cross-origin next URL → throws

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08h (TC-SO-003)

**GIVEN** `listPullRequestFiles` is paginating through PR file results
**WHEN** page 1 returns a `Link: rel="next"` URL pointing to a different origin
**THEN** `listPullRequestFiles` throws `GITHUB_API_ERROR`; `fetchFn` is called exactly once

---

### TC-027: listIssueComments cross-origin next URL → throws

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08h (TC-SO-004)

**GIVEN** `listIssueComments` is paginating through issue comment results
**WHEN** page 1 returns a `Link: rel="next"` URL pointing to a different origin
**THEN** `listIssueComments` throws `GITHUB_API_ERROR`; `fetchFn` is called exactly once

---

### TC-028: searchOpenIssuesByLabel cross-origin next URL → throws

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-07 acceptance criteria

**GIVEN** `searchOpenIssuesByLabel` is paginating through issue search results
**WHEN** page 1 returns a `Link: rel="next"` URL pointing to a different origin
**THEN** `searchOpenIssuesByLabel` throws `GITHUB_API_ERROR`; `fetchFn` is called exactly once

---

### TC-029: same-origin next URL → pagination continues normally

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-08h (TC-SO-005)

**GIVEN** any paginated method (`getCheckStatus`, `listPullRequestFiles`, `listIssueComments`, `searchOpenIssuesByLabel`) is processing a multi-page response
**WHEN** the `Link: rel="next"` URL has the same origin (same protocol, hostname, and port) as the configured base URL but a different path or page parameter
**THEN** no error is thrown and the method follows the next URL normally, fetching the subsequent page

---

## Area 8: Build correctness (T-09)

### TC-030: typecheck passes with zero errors

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** all code changes from T-01 through T-07 are applied
**WHEN** `bun run typecheck` is executed
**THEN** TypeScript compilation reports zero errors

---

## Result

```yaml
result: completed
total: 30
automated: 29
manual: 1
must: 13
should: 17
could: 0
blocked_reasons: []
```
