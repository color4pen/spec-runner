# Code Review Feedback — iteration 002

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: needs-fix
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | testing | tests/unit/adapter/github/github-client-inbox.test.ts | TC-007 (must) still uncovered in iteration 002: no test exercises `GitHubApiClient.removeLabel` against mock HTTP responses. Iteration 001 flagged this as the sole blocking finding; the iteration 002 fix (TC-L1/L2/L3 in run-inbox.test.ts) addresses the orchestrator level but not the adapter level. T-01 AC requires 204/404/422 response handling to be verified at the adapter boundary. The analogous `listIssueComments` adapter tests exist in this file. | Add three test cases to `github-client-inbox.test.ts`: TC-007 (DELETE → 204 resolves), TC-008 (DELETE → 404 resolves idempotent), TC-009 (DELETE → 422 throws `SpecRunnerError(GITHUB_API_ERROR)`). Follow the `TC-LC-*` pattern already present in the file. | yes |
| 2 | MEDIUM | testing | src/core/inbox/__tests__/run-inbox.test.ts | TC-011 and TC-012 (should) still uncovered. No assertion that `listIssueComments` is called for unlinked approved issues in the collection phase, and no test that a failure of that call is non-fatal. The `makeRejectClient` helper stubs `listIssueComments` but the label-removal describe block does not assert on call counts or error suppression for this code path. | Add a describe block covering TC-011 (assert `listIssueComments` was called with the unlinked issue number) and TC-012 (mock `listIssueComments` to reject; assert warn logged and orchestrator returns a summary without propagating the error). | yes |
| 3 | LOW | maintainability | src/core/inbox/__tests__/run-inbox.test.ts | `makeRejectClient` includes `createIssueComment: vi.fn()` which is never asserted in TC-L1/L2/L3 (tests use the `postRejectComment` effect stub instead). Minor helper noise carried over from iteration 001. | Remove `createIssueComment` from `makeRejectClient`, or add a comment explaining it satisfies the `GitHubClient` type constraint only. | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 6 | 0.10 |

- **total**: 8.7

## Summary

Iteration 002 addressed TC-L1, TC-L2, and TC-L3 (reject label-removal orchestrator tests), updated `makeEffects` to include `removeApprovalLabel`, and propagated `removeLabel` into mock `GitHubClient` objects across existing tests to satisfy the updated port interface. Core implementation remains correct: L1 (label removal) and L2 (planner dedup) are both present, the Ports & Adapters boundary is respected, and the dedup logic in `planStarts` is pure and fully covered at the unit level.

Blocking gap unchanged from iteration 001: TC-007 (must) — `removeLabel` adapter behavior against HTTP 204/404/422 responses is not unit-tested at the adapter level. No diff to `github-client-inbox.test.ts` and no new adapter test file appeared in iteration 002.
