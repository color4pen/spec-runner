# Tasks: github-merge-gate-determinism

All changes are confined to `src/adapter/github/github-client.ts` and
`tests/unit/adapter/github/`.

---

## T-01: Remove X-RateLimit-Remaining:0 retry block (Bug ①a)

Remove the `X-RateLimit-Remaining: "0"` block (currently lines 97–111) from `request()`
entirely. Do not replace it with a "return before check" approach — remove the block.

- [ ] Delete the `if (rateLimitRemaining === "0") { … attempt429++; continue; }` block
      from `request()` (the full block spanning the `const rateLimitRemaining` declaration
      through the closing brace).
- [ ] Confirm `attempt429` is still used by the 429 path and `MAX_429_RETRIES` constant is
      unchanged.
- [ ] Confirm the loop still compiles with no unused-variable warnings.

**Acceptance Criteria**:
- A 200 response with `X-RateLimit-Remaining: 0` is returned to the caller; `sleepFn` is
  not called and `fetchFn` is called exactly once.
- A 201 response with `X-RateLimit-Remaining: 0` on a POST is returned immediately; no
  second fetch.
- The 429 retry path (TC-RC-004, TC-RC-005, TC-RC-009) continues to pass unchanged.

---

## T-02: Method-based 5xx / network retry — POST/PUT skip retry (Bug ①b)

In `request()`, before the 5xx retry block and the network-error catch block, add a check
for the HTTP method. POST and PUT requests MUST NOT retry on 5xx or network errors.

- [ ] In the `catch (err)` block for network errors: if `init.method === "POST" || init.method === "PUT"`, rethrow `err` immediately (no sleep, no retry).
- [ ] In the `if (response.status >= 500)` block: if `init.method === "POST" || init.method === "PUT"`, throw `githubApiError(response.status, ...)` immediately (do not increment `attempt5xx` or sleep).
- [ ] GET, HEAD, DELETE, and calls with no explicit method retain existing retry behavior.

**Acceptance Criteria**:
- `fetchFn` is called exactly 1 time for a POST or PUT that returns 5xx; `sleepFn` is not called for 5xx backoff on those calls.
- `fetchFn` is called exactly 1 time for a POST or PUT that throws a network error.
- GET 5xx still retries up to `MAX_5XX_RETRIES` (TC-RC-007, TC-RC-008 unchanged).

---

## T-03: createPullRequest — 422 "already exists" idempotency (Bug ①a caller)

In `createPullRequest`, handle 422 responses that indicate a PR already exists.

- [ ] After the `if (resp.status !== 201)` branch, add: if `resp.status === 422`, read the body as JSON. Check if the parsed body's `message` (or any entry in `errors[].message`) contains the substring `"already exists"` (case-insensitive check is acceptable). If matched:
  - Call `this.listPullRequests(owner, repo, head, base)`.
  - Find the first result where `state === "OPEN"` (or the first result regardless of state if no open one exists).
  - If found, return `{ url: pr.url, number: pr.number }`.
  - If not found, fall through to throw.
- [ ] On 422 without the "already exists" substring: throw `githubApiError(resp.status, …)` as before.
- [ ] On non-201 / non-422: throw `githubApiError(resp.status, …)` as before.

**Acceptance Criteria**:
- `createPullRequest` returns `{ url, number }` of the existing PR when GitHub returns 422 with "already exists" in the message.
- `createPullRequest` throws on 422 for unrelated reasons.
- `createPullRequest` throws on non-201 non-422 responses.

---

## T-04: mergePullRequest — 405 "already merged" returns { merged: true } (Bug ①a caller)

In `mergePullRequest`'s `attemptMerge` inner function, add an "already merged" check
before the generic 405/409 handler.

- [ ] In the `if (resp.status === 405 || resp.status === 409)` block, split the 405 case:
  - Parse the body.
  - If `resp.status === 405` and `(data.message ?? "").toLowerCase().includes("already merged")`:
    return `{ merged: true, message: "Pull Request already merged" }`.
  - Otherwise: existing behavior — return `{ merged: false, message: … }`.
- [ ] 409 (merge conflict) handling is unchanged.

**Acceptance Criteria**:
- `mergePullRequest` returns `{ merged: true }` when GitHub returns 405 with a message containing "already merged" (case-insensitive).
- `mergePullRequest` returns `{ merged: false }` for 405 with other messages (e.g., "not mergeable"), unchanged from current behavior.
- `mergePullRequest` returns `{ merged: false }` for 409, unchanged.

---

## T-05: getCheckStatus — paginate commit statuses via /statuses plural (Bug ②)

Replace the single `GET /commits/{ref}/status` call with a paginated loop over
`GET /commits/{ref}/statuses?per_page=100` following Link headers.

- [ ] Remove the `const statusUrl = …/status` variable and the single `this.request(statusUrl)` call and `statusData.statuses` extraction.
- [ ] Replace with a pagination loop matching the check-runs pattern:
  ```
  const commitStatuses: Array<{ context: string; state: string }> = [];
  const seenContexts = new Set<string>();
  let statusesUrl: string | null =
    `${this.baseUrl}/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/statuses?per_page=100`;

  while (statusesUrl !== null) {
    validateSameOrigin(statusesUrl, this.baseUrl);   // ← from T-07
    const statusResp = await this.request(statusesUrl);
    if (statusResp.status !== 200) {
      throw githubApiError(statusResp.status, `getCheckStatus statuses(${owner}/${repo}@${ref})`);
    }
    const page = (await statusResp.json()) as Array<{ context: string; state: string }>;
    for (const s of page) {
      if (!seenContexts.has(s.context)) {
        seenContexts.add(s.context);
        commitStatuses.push(s);
      }
    }
    statusesUrl = parseNextLink(statusResp.headers.get("Link"));
  }
  ```
- [ ] The `commitStatuses` array is then used exactly as `statusData.statuses` was — fed into the existing `normalizeCommitStatus` loop.
- [ ] The comment `// Fetch combined commit statuses (no pagination support needed — max 100)` is removed.

**Acceptance Criteria**:
- `getCheckStatus` fetches at least 2 pages when the server returns a Link next header.
- A failure status on page 2 appears in `result.failing`.
- Duplicate contexts across pages: only the first-seen (newest) is retained.
- Non-200 from /statuses throws GITHUB_API_ERROR.

---

## T-06: parseRetryAfter() helper — HTTP-date support + safe fallback (Bug ③)

Add a `parseRetryAfter(header: string): number` pure function and use it in the 429 branch.

- [ ] Implement `parseRetryAfter` as a module-level (unexported) function:
  ```ts
  function parseRetryAfter(header: string): number {
    // Try integer seconds
    const asInt = parseInt(header, 10);
    if (!isNaN(asInt) && asInt >= 0) {
      return Math.min(asInt, 60);
    }
    // Try HTTP-date
    const asDate = new Date(header).getTime();
    if (!isNaN(asDate)) {
      const delaySec = Math.ceil((asDate - Date.now()) / 1000);
      return Math.min(Math.max(delaySec, 1), 60);
    }
    // Safe fallback — never instant
    return 60;
  }
  ```
- [ ] In the 429 branch, replace:
  ```ts
  const waitSec = retryAfterHeader ? Math.min(parseInt(retryAfterHeader, 10), 60) : 60;
  ```
  with:
  ```ts
  const waitSec = retryAfterHeader ? parseRetryAfter(retryAfterHeader) : 60;
  ```
- [ ] The 60-second cap and the absent-header default of 60 are preserved.

**Acceptance Criteria**:
- Integer `Retry-After: 30` → `sleepFn(30_000)`.
- `Retry-After: 120` → `sleepFn(60_000)` (capped).
- HTTP-date ~30 s in the future → `sleepFn` called with value in `[25_000, 60_000]`.
- Garbage value `"garbage"` → `sleepFn(60_000)` (fallback, not 0).
- Absent header → `sleepFn(60_000)` (unchanged).

---

## T-07: validateSameOrigin() — same-origin guard for all pagination next URLs

Add `validateSameOrigin` helper and call it in every pagination loop.

- [ ] Implement `validateSameOrigin(nextUrl: string, baseUrl: string): void` as a module-level function:
  ```ts
  function validateSameOrigin(nextUrl: string, baseUrl: string): void {
    const next = new URL(nextUrl);
    const base = new URL(baseUrl);
    if (next.protocol !== base.protocol || next.hostname !== base.hostname || next.port !== base.port) {
      throw githubApiError(
        0,
        `Pagination next URL origin mismatch: expected ${base.origin}, got ${next.origin}`,
      );
    }
  }
  ```
- [ ] Call `validateSameOrigin(checkRunsUrl, this.baseUrl)` at the top of the check-runs `while` loop in `getCheckStatus` (before `this.request(checkRunsUrl)`).
- [ ] Call `validateSameOrigin(statusesUrl, this.baseUrl)` at the top of the commit-statuses `while` loop (new loop from T-05).
- [ ] Call `validateSameOrigin(nextUrl, this.baseUrl)` at the top of the `while` loop in `listPullRequestFiles` (before `this.request(nextUrl)`).
- [ ] Call `validateSameOrigin(nextUrl, this.baseUrl)` at the top of the `while` loop in `searchOpenIssuesByLabel`.
- [ ] Call `validateSameOrigin(nextUrl, this.baseUrl)` at the top of the `while` loop in `listIssueComments`.
- [ ] The initial URL (computed from `this.baseUrl`) does NOT need to be validated (it is trusted by construction); only Link-header-derived next URLs are validated.

**Acceptance Criteria**:
- A cross-origin Link next URL throws GITHUB_API_ERROR before any fetch to that URL.
- A same-origin Link next URL is followed normally (no error thrown).
- All five methods that follow pagination are covered.

---

## T-08: Tests — update existing and add new test cases

### T-08a: Update TC-RC-006 / TC-RC-010 / TC-RC-011 (now-invalid rate-limit retry assertions)

File: `tests/unit/adapter/github/github-client-request.test.ts`

These tests currently assert that a 2xx with `X-RateLimit-Remaining: 0` triggers a retry.
After D1 removes that block, they must be rewritten.

- [ ] **TC-RC-006** (both cases): change expectation to "2xx + RateLimit-Remaining:0 → returned immediately".
  - Use a single `mockFetch` returning `okRefShaResponse()` with `X-RateLimit-Remaining: 0`.
  - Assert `mockFetch` called once and `sleepFn` not called (no rate-limit wait).
- [ ] **TC-RC-010**: rewrite as "200 + X-RateLimit-Remaining:0 → returned immediately, not retried".
  - Use a single-response mock returning 200 + body matching `okRefShaResponse()` format + `Remaining: 0`.
  - Assert `mockFetch` called once; result is the SHA (no throw).
- [ ] **TC-RC-011**: rewrite or remove. If the mixed scenario now resolves to the first 429 wait + retry succeeding, update accordingly. If the test intent is now covered by TC-RC-009 alone, document and delete TC-RC-011.

### T-08b: New test cases for D1 (return immediately on 2xx + Remaining:0)

File: `tests/unit/adapter/github/github-client-request.test.ts`

- [ ] **TC-RC-012**: POST 201 + `X-RateLimit-Remaining: 0` → returned immediately (using `createIssueComment` as the vehicle). Assert `fetchFn` called once, `sleepFn` not called for rate-limit.

### T-08c: New test cases for D2 (no 5xx retry on POST/PUT)

File: `tests/unit/adapter/github/github-client-request.test.ts`

- [ ] **TC-RC-013**: POST 500 → throws GITHUB_API_ERROR after exactly 1 fetch call (use `createIssueComment` as the vehicle; exercise via the GITHUB_API_ERROR throw it would generate from the 500 being returned to it).

  Note: because `createIssueComment` checks `resp.status !== 201` and throws if true, and `request()` for POST on 5xx now throws before returning the response, the test should verify the throw comes from `request()` rather than from `createIssueComment`'s own check. Both cases result in a thrown error, but fetch count should be 1.

- [ ] **TC-RC-014**: PUT 502 → throws after exactly 1 fetch call (use `mergePullRequest` as the vehicle; confirm `fetchFn` called once).
- [ ] **TC-RC-015**: GET 500 retries (unchanged) — confirm existing TC-RC-007/TC-RC-008 still pass; add a comment that GET retries are unaffected.

### T-08d: New test cases for D6 (parseRetryAfter HTTP-date / fallback)

File: `tests/unit/adapter/github/github-client-request.test.ts`

- [ ] **TC-RC-016**: `Retry-After` with a valid HTTP-date ~30 s in the future → `sleepFn` called with value in `[25_000, 60_000]`. Mock `Date.now` if needed to make the test deterministic, or use a fixed timestamp far in the future (capped at 60 000).
- [ ] **TC-RC-017**: `Retry-After: garbage` → `sleepFn(60_000)` (fallback, not 0 or NaN).
- [ ] **TC-RC-018**: `Retry-After` with an HTTP-date in the past → `sleepFn(1_000)` (floor of 1 s, not negative/0).

### T-08e: New test cases for D3 (createPullRequest idempotency)

File: `tests/unit/adapter/github/github-client-pr.test.ts`

- [ ] **TC-CP-001**: 422 + body `{ message: "A pull request already exists for owner:branch" }` → `listPullRequests` called → returns `{ url, number }` of existing OPEN PR.
- [ ] **TC-CP-002**: 422 + unrelated body (`{ message: "Validation Failed" }`) → throws GITHUB_API_ERROR.
- [ ] **TC-CP-003**: 422 "already exists" + `listPullRequests` returns empty array → throws GITHUB_API_ERROR (no PR found to return).

### T-08f: New test cases for D4 (mergePullRequest already-merged)

File: `tests/unit/adapter/github/github-client-pr.test.ts`

- [ ] **TC-PM-023**: 405 + `{ message: "Pull Request already merged" }` → `{ merged: true }`. Assert `fetchFn` called once (no retry), `result.merged === true`.
- [ ] **TC-PM-024**: 405 + `{ message: "Pull request already merged" }` (lowercase 'r') → `{ merged: true }`. (Case-insensitive match.)
- [ ] Confirm TC-PM-002 (405 "not mergeable" → `{ merged: false }`) still passes unchanged.

### T-08g: New test cases for D5 (commit statuses pagination)

File: `tests/unit/adapter/github/github-client-pr.test.ts`

- [ ] **TC-CS-013**: Two-page `/statuses` response where page 2 contains a `"failure"` status.
  - Page 1: 1 success status, Link: next pointing to page 2.
  - Page 2: 1 failure status `{ context: "ci/slow-check", state: "failure" }`, no Link.
  - Check-runs: 1 page, empty.
  - Assert `result.state === "failure"` and `result.failing` contains `"ci/slow-check"`.
  - Assert `fetchFn` called 3 times (page1-statuses, page2-statuses, check-runs) or (check-runs, page1-statuses, page2-statuses) depending on fetch order.
- [ ] **TC-CS-014**: Duplicate context across pages — page 1 has `{ context: "ci/check", state: "success" }`, page 2 has `{ context: "ci/check", state: "failure" }`. Assert rollup is `"success"` (first/newest wins, duplicate suppressed).
- [ ] **TC-CS-015**: Single-page `/statuses` response with no Link header — assert correct behavior (no second call for statuses; combined check-runs result is correct).
- [ ] Confirm TC-CS-004 (single status failure) still passes (the endpoint URL has changed; update the mock URL if the test asserts the called URL).

### T-08h: New test cases for D7 (same-origin pagination guard)

File: `tests/unit/adapter/github/github-client-pr.test.ts` (or a new file
`tests/unit/adapter/github/github-client-security.test.ts` if it becomes large)

- [ ] **TC-SO-001**: `getCheckStatus` — check-runs page 1 Link header points to `https://evil.example.com/…` → throws GITHUB_API_ERROR; `fetchFn` called exactly once (first page only; cross-origin URL never fetched).
- [ ] **TC-SO-002**: `getCheckStatus` — commit-statuses page 1 Link header points to cross-origin → throws GITHUB_API_ERROR.
- [ ] **TC-SO-003**: `listPullRequestFiles` — page 1 Link header points to cross-origin → throws GITHUB_API_ERROR; `fetchFn` called once.
- [ ] **TC-SO-004**: `listIssueComments` — cross-origin next URL → throws GITHUB_API_ERROR.
- [ ] **TC-SO-005**: Same-origin next URL (same host, different path/page) → no error, pagination continues normally. (Confirm existing TC-CS-012 still passes, as it exercises same-origin pagination.)

---

## T-09: typecheck && test green

- [ ] Run `bun run typecheck` — zero errors.
- [ ] Run `bun run test` — all tests pass, including both updated and new test cases.
