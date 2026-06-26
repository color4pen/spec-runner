# Design: github-merge-gate-determinism

## Context

`src/adapter/github/github-client.ts` has three classes of bugs that make the merge/finish
gate fail-open (merge proceeds when it should block, or a mutation is executed more than once):

**Bug ①a — X-RateLimit-Remaining:0 re-fires successful mutations**
`request()` checks `X-RateLimit-Remaining: 0` BEFORE returning a 2xx response.
A mutation that returns 200/201 with `Remaining: 0` is re-sent (loop continues).
Effect: `mergePullRequest` can attempt a squash merge twice; `createPullRequest` can
create duplicate PRs; `createIssueComment` can post duplicate comments.

**Bug ①b — 5xx retry on non-idempotent methods**
`request()` retries POST/PUT on 5xx with exponential backoff. A partial-execution 500
(e.g., GitHub accepted the merge but failed to respond) causes a re-send.
Effect: same double-execution risk as ①a, triggered by server errors instead of rate headers.

**Bug ② — commit statuses truncated at 30**
`getCheckStatus` calls `GET /commits/{ref}/status` (combined endpoint) without `per_page`
or pagination. GitHub returns at most 30 statuses by default.
Effect: failure statuses beyond position 30 are invisible → fail-open merge.

**Bug ③ — Retry-After HTTP-date causes instant retry**
`parseInt(retryAfterHeader, 10)` on an HTTP-date string (`Thu, 26 Jun 2026 10:00:00 GMT`)
returns `NaN`. `Math.min(NaN, 60)` is `NaN`. `sleepFn(NaN)` resolves immediately.
429 retry budget is consumed without waiting.
Effect: 429 rate-limit retries are exhausted instantly, crashing the call.

Missing safety property — **no same-origin guard on Link pagination URLs**
`parseNextLink` returns verbatim URLs from Link headers; `request()` blindly attaches
`Authorization: token …` before checking the host. Adding commit-statuses pagination
increases the attack surface, so the guard is added in this change.

## Goals / Non-Goals

**Goals**:
- Fix ①a: return 2xx responses before any rate-limit retry check
- Fix ①b: POST/PUT do not retry on 5xx or network errors
- Fix ①a caller side: `createPullRequest` 422 idempotency; `mergePullRequest` 405 already-merged
- Fix ②: paginate commit statuses via `/statuses` (plural) + Link
- Fix ③: parse HTTP-date in Retry-After; safe fallback for garbage values
- Add same-origin guard for all Link-pagination next URLs

**Non-Goals**:
- Changes to merge-gate policy (protected paths, branch protection)
- Proactive rate-limit throttling
- Rollback of previously merged PRs #713 / #714
- subprocess credential containment (separate request)

## Decisions

### D1: Remove X-RateLimit-Remaining:0 retry block from request()

**Decision**: Delete the `X-RateLimit-Remaining: "0"` retry block entirely.

**Rationale**: GitHub enforces rate limits via 429 responses. A 200 with `Remaining: 0`
means "here is your data; you have no quota left". The caller should receive the data.
The next request will return 429 which is already handled by the 429 branch. Retrying
on `Remaining: 0` re-sends the same request body, which for POST/PUT is a mutation replay.
Removing the block makes the fix minimal and unconditional (no 2xx vs non-2xx distinction needed).

**Alternative rejected**: Move `return response` before the rate-limit check.
This fixes the 2xx case but still retries non-2xx, non-429, non-5xx responses with
`Remaining: 0` (e.g., 404 with the header). A 404 is a definitive answer and should
not be retried. Removing the block is strictly more correct.

**Test impact**: TC-RC-006, TC-RC-010, TC-RC-011 exercise the now-deleted retry path
and must be rewritten as "2xx + RateLimit-Remaining:0 → return immediately".

### D2: Method-based 5xx and network-error retry — POST/PUT skip retry, GET/DELETE retain it

**Decision**: In `request()`, detect `init.method`. If `POST` or `PUT`:
- On 5xx: throw `GITHUB_API_ERROR` immediately (no sleep, no retry)
- On network error: throw the original error immediately

GET, HEAD, DELETE, and unspecified method retain existing retry behavior.

**Rationale**: POST and PUT are non-idempotent. A 5xx after a POST/PUT is ambiguous
(may or may not have executed). Retrying risks double-execution. GET is safe to retry
by definition. DELETE is safe because callers treat 404 as success (idempotent result).
The method is already available as `init.method` at call sites.

**Alternative rejected**: idempotent flag passed explicitly by callers.
Requires callers to opt-in correctly. Method-based inference is automatic and can't be
forgotten. All current callers use standard HTTP method semantics.

**Caller impact**: `createPullRequest`, `createIssueComment` will now propagate 5xx
as thrown errors rather than absorbing them via retry. Both already have
`if (resp.status !== 201) throw githubApiError(…)` paths; that path is unchanged.
`mergePullRequest` calls `request()` inside `attemptMerge` → a thrown error propagates
through `retryWithBackoff` (which only retries on result values, not exceptions) → safe.

### D3: createPullRequest — 422 "already exists" maps to existing PR

**Decision**: On 422, parse the response body. If any error entry in `errors[]` or the
top-level `message` contains the substring `"already exists"`, call `listPullRequests`
with the same `(owner, repo, head, base)` and return the first result's `{ url, number }`.
On other 422 bodies, throw `GITHUB_API_ERROR` as before.

**Rationale**: GitHub returns 422 with `"A pull request already exists for <owner>:<branch>"`
when a PR is posted for a head+base pair that already has one. Treating this as failure causes
downstream reporters to show a false PR-creation error. The correct semantic is idempotent
success.

**Alternative rejected**: Fetch existing PR before POST (pre-check). This adds an extra
GET on every `createPullRequest` call; the 422 path is the exceptional case, not the norm.

### D4: mergePullRequest — 405 "already merged" maps to { merged: true }

**Decision**: In `attemptMerge`, before the generic 405 handler, check if the response
body message (lowercased) contains `"already merged"`. If so, return
`{ merged: true, message: "Pull Request already merged" }`.

**Rationale**: GitHub returns HTTP 405 with "Pull Request already merged" when the PR is
in the merged state. The current code returns `{ merged: false }` for all 405, which
falsely reports a merge failure for an already-completed merge.

**Note**: The `isMergeTransientFailure` check runs on returned values, not thrown errors.
The "already merged" return `{ merged: true }` short-circuits `retryWithBackoff` correctly
(`shouldRetryResult` returns `false` for `merged: true`).

### D5: getCheckStatus commit statuses — switch to /statuses (plural) + per_page=100 + Link pagination

**Decision**: Replace the single `GET /commits/{ref}/status` call with a paginated loop
over `GET /commits/{ref}/statuses?per_page=100` following Link headers. Deduplicate by
context, keeping the first occurrence (GitHub returns newest-first, so first = most recent).

**Rationale**: The `/status` (singular) endpoint returns a combined roll-up with a default
page size of 30. There is no supported `per_page` parameter for this endpoint.
The `/statuses` (plural) endpoint returns individual status events and supports `per_page=100`
+ Link pagination, matching the check-runs fetch pattern already in `getCheckStatus`.
Deduplication by context is required because the same context can have multiple historical
entries; only the latest matters for gate decisions.

**Alternative rejected**: Use `/status` with added `per_page=100`. The combined endpoint
does not document or reliably support pagination; it is a roll-up resource.

### D6: parseRetryAfter() helper — add HTTP-date parsing with safe fallback

**Decision**: Extract a `parseRetryAfter(header: string): number` helper that:
1. Tries `parseInt(header, 10)` — if ≥ 0, return `Math.min(value, 60)`.
2. Tries `new Date(header).getTime()` — if valid, compute seconds until the date,
   clamp to `[1, 60]`.
3. Fallback: return `60` (safe maximum wait, not instant).

Replace the inline `Math.min(parseInt(retryAfterHeader, 10), 60)` in the 429 branch.

**Rationale**: HTTP/1.1 allows `Retry-After` as either `<delay-seconds>` or
`<http-date>`. GitHub can send either. `parseInt` of an HTTP-date returns `NaN`,
which propagates through `Math.min` and `sleepFn(NaN)` resolves immediately —
consuming the entire retry budget without delay.

### D7: validateSameOrigin() — guard before following any Link next URL

**Decision**: Add a module-level `validateSameOrigin(nextUrl: string, baseUrl: string): void`
that parses both URLs (via `new URL()`) and throws `githubApiError(0, …)` if protocol,
hostname, or port differ.

Call this function inside every pagination loop before invoking `this.request(nextUrl)`:
- `getCheckStatus` check-runs loop (existing)
- `getCheckStatus` commit-statuses loop (new in D5)
- `listPullRequestFiles`
- `searchOpenIssuesByLabel`
- `listIssueComments`

**Rationale**: GitHub Link headers are server-provided; a compromised response could inject
a cross-origin URL. `request()` attaches `Authorization: token …` to every URL it is given.
Adding validation before following next-page URLs prevents token exfiltration via header injection.
This extends the existing B-10 host↔token binding to cover paginated requests.

**Alternative rejected**: Validate inside `request()` before attaching the Authorization header.
This changes the semantics of `request()` (must know the configured base URL everywhere) and
would also block legitimate absolute API calls that happen to differ in path only. Explicit
validation at each pagination call site is narrower and clearer.

## Risks / Trade-offs

- **[Risk] D1 removes rate-limit pre-emptive wait**: If GitHub sends `Remaining: 0` on a
  200 response and the caller immediately issues another request, it will receive 429.
  The 429 handler already waits and retries — this is the correct flow.
  **Mitigation**: existing 429 path handles this; no net regression.

- **[Risk] D2 — POST/PUT 5xx now surfaces immediately**: Callers that previously saw
  eventual success (after request() retried 3 times) will now see immediate GITHUB_API_ERROR.
  This is stricter, not looser. Upstream code (pipeline error handling, escalation) already
  handles thrown errors from all GitHub operations.
  **Mitigation**: all callers of createPullRequest / createIssueComment / mergePullRequest
  have explicit error-handling paths. No caller assumes these calls never throw.

- **[Risk] D5 — /statuses plural may return many more records**: A repo with many status
  contexts or a long status history could result in many pages. The deduplication set
  bounds the final list to unique contexts.
  **Mitigation**: per_page=100 limits fetch size per call; the number of unique contexts
  is bounded by CI configuration, not history length.

- **[Risk] D3 listPullRequests call in 422 path**: If the 422-fallback `listPullRequests`
  itself fails (network, 5xx), `createPullRequest` throws an error. This is no worse than
  the current behavior (which throws on 422 anyway).
  **Mitigation**: no additional error handling needed.

## Open Questions

None. All design choices confirmed by architect evaluation in the request.
