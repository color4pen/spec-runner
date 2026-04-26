## Code Review Result

**Verdict**: approved
**Score**: 7.45 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: -- (initial)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 7 | 0.25 | 1.75 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 6 | 0.10 | 0.60 |
| **Total** | | | **7.45** |

### Verification Summary

| Phase | Result |
|-------|--------|
| Build | PASS |
| Type Check | PASS |
| Lint | PASS |
| Tests | PASS (215/215, 474 expects) |
| Security | N/A (security-reviewer not enabled) |

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | security | src/lib/propose-actions.ts:214 | Path traversal check uses string-based `..` detection and `startsWith` without path normalization. An attacker could potentially bypass with URL-encoded sequences or OS-level path tricks (e.g. `openspec/changes/../../secrets`). While unlikely in practice due to the nature of Server Actions, it does not match best-practice normalization. | Use `path.resolve()` or `path.normalize()` on `filePath` before checking `startsWith`, then verify the resolved path still begins with the expected prefix. Alternatively, split on `/` and reject any segment that is `..` |
| 2 | MEDIUM | testing | src/__tests__/slug-delegation-and-branch-tracking.test.ts:450-481 | TC-005/006/007 (SSE loop requires_action handling) are tested only via static source analysis (`toContain` on source text). review-lessons.md explicitly flags this pattern: "source static analysis tests should be limited to directive checks, not business logic verification" (4 occurrences). The SSE loop's requires_action/end_turn branching is core business logic. | Create mock-based integration tests that simulate the SSE event stream with requires_action and end_turn events, verifying that handleCustomToolUse is called for the former and that the loop breaks for the latter. If mocking the SSE stream is infeasible, at minimum add a structured assertion (e.g. AST-based or regex matching the conditional block structure) rather than loose string contains |
| 3 | MEDIUM | testing | src/__tests__/slug-delegation-and-branch-tracking.test.ts:532-564 | TC-012/013 (change folder viewer fallback logic) are also static analysis only. The `resolveSlugAndBranch` function is a pure helper that could be unit-tested directly with different request objects (branchName present vs null). | Export `resolveSlugAndBranch` from propose-actions.ts (or extract to propose-utils.ts since it is pure logic), then test directly with mock request objects: one with branchName set, one with null |
| 4 | MEDIUM | maintainability | src/app/api/sessions/[id]/stream/route.ts:82-98 | The `fetchAndHandleCustomTool` function fetches the last 50 events to find the custom_tool_use event by ID. If the session has many events (long-running sessions with multiple tool calls), the target event may not be in the last 50. This is fragile. | Consider using pagination to search for the specific event, or better yet, cache the custom_tool_use events as they stream through the for-await loop (they arrive before the status_idle event) so no additional API call is needed |
| 5 | MEDIUM | architecture | src/lib/session-actions.ts:96-102 | `customTools` parameter is accepted by `createBoundSession` but never actually passed to the Anthropic API `sessions.create` call (line 173). The comment at propose-actions.ts:95 acknowledges the SDK limitation. This is dead code — accepted but unused. | Either pass the `customTools` to the API call if the SDK supports it, or remove the parameter and the related comment until SDK support is confirmed. If keeping it as a documentation placeholder, add a TODO comment with a clear tracking reference |
| 6 | LOW | maintainability | src/app/api/sessions/[id]/stream/route.ts:79-98 | Comments in the `fetchAndHandleCustomTool` area are verbose and partially redundant (explains the design rationale inline). The "We need to look up" / "Since the agent.custom_tool_use event comes BEFORE" comments repeat what the function already does. | Consolidate into a single JSDoc on the function. Remove inline implementation-narration comments |
| 7 | LOW | correctness | src/lib/custom-tool-handler.ts:47 | Slug validation calls `slug.trim()` before regex test, but the trimmed value is not stored — the original `slug` is validated with trim, then `branch_name.trim()` is used for DB write (line 89) but `slug` itself is returned trimmed (line 96). This is inconsistent: the slug is validated on trimmed input but the validation could pass with leading/trailing whitespace in the original, potentially causing a mismatch between what was validated and what was stored. | Apply `const cleanSlug = slug.trim()` at the top and use `cleanSlug` consistently throughout. Currently not a bug because the DB stores `branch_name` not `slug`, but it is a latent inconsistency |
| 8 | LOW | testing | src/__tests__/slug-delegation-and-branch-tracking.test.ts:656-664 | TC-019 (RequestSummary includes branchName) uses static source analysis to check for field existence. This could be a direct test using the DB + a mock auth context. | Test by inserting a request with branchName and calling the actual function with mocked auth |
| 9 | LOW | completeness | src/lib/propose-actions.ts:214 | The path traversal check `!filePath.startsWith('openspec/changes/')` does not append a trailing `/` as recommended by constraints.md: "trailing `/` to prevent prefix collision". A path like `openspec/changes-evil/secret.md` would pass the startsWith check. | Change to `!filePath.startsWith('openspec/changes/')` — this is already correct in the current code (trailing slash is present). No action needed. [WITHDRAWN after re-reading: the check does include the trailing slash.] |

**Note**: Finding #9 is withdrawn upon verification — the existing code already includes the trailing `/` in the prefix check.

### Iteration Comparison

N/A (initial iteration)

### Summary

- The implementation is well-structured and follows established project patterns. The custom-tool-handler dispatcher mirrors session-completion-handler's role-based dispatch, and `resolveSlugAndBranch` consolidates previously scattered slug derivation into a single helper.
- Security is solid: IDOR prevention via ownership verification chains, path traversal protection, XML delimiters for prompt injection defense, and the `register_branch` handler validates ownership (`request_id` must match session's requestId).
- The main area for improvement is test quality: 5 of the must-priority test cases rely solely on static source analysis (`toContain`), which review-lessons has flagged as insufficient for business logic verification. This depresses the testing score.
- The `customTools` parameter accepted by `createBoundSession` is a dead-code placeholder (never passed to the API). This should be resolved or explicitly marked as a future-SDK TODO.
- The `fetchAndHandleCustomTool` approach of listing last 50 events to find the custom_tool_use event is fragile for long sessions but acceptable for Phase 1 scope.
- Overall: passes threshold at 7.45 with no CRITICAL or HIGH findings. All 8 active findings are MEDIUM or LOW.
