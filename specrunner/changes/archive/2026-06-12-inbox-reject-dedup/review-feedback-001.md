# Code Review Feedback — iteration 001

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
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | testing | tests/unit/adapter/github/ | TC-007 (must) uncovered: no test exercises `GitHubApiClient.removeLabel` against mock HTTP responses. T-01 AC requires 204/404/422 response handling to be tested at the adapter level. The analogous `listIssueComments` adapter tests exist in `github-client-inbox.test.ts` but `removeLabel` tests were not added. | Add adapter unit tests mirroring the `TC-LC-*` pattern: TC-007 (204 → resolves), TC-008 (404 → resolves idempotent), TC-009 (422 → throws `SpecRunnerError(GITHUB_API_ERROR)`). Add to `github-client-inbox.test.ts` or a new `github-client-remove-label.test.ts`. | yes |
| 2 | MEDIUM | testing | src/core/inbox/__tests__/run-inbox.test.ts | TC-011 (should) and TC-012 (should) uncovered: no assertion that `listIssueComments` is called for unlinked approved issues, and no test that a failure of that call is non-fatal. The `makeRejectClient` helper stubs the method but TC-L1/L2/L3 do not assert dedup-path call behavior. | Add a describe block for unlinked-issue comment fetch. TC-011: assert `listIssueComments` was called with the unlinked issue number. TC-012: mock `listIssueComments` to reject; assert warn logged and orchestrator completes without propagating the error. | yes |
| 3 | LOW | maintainability | src/core/inbox/__tests__/run-inbox.test.ts | `makeRejectClient` includes `createIssueComment: vi.fn()` which is never asserted in TC-L1/L2/L3 (the tests use `postRejectComment` effect mock instead). Minor helper noise. | Remove `createIssueComment` from `makeRejectClient` or add a comment explaining it's required for the client interface shape. | yes |

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

Core implementation is correct and well-structured: L1 (label removal) and L2 (planner dedup) are both present, the Ports & Adapters boundary is respected, and the dedup logic in `planStarts` is pure and unit-testable. Verification passed (typecheck + test + lint all green).

Blocking gap: TC-007 (must) — `removeLabel` adapter behavior against HTTP 204/404/422 responses is not unit-tested. The adapter has an established test pattern (`github-client-inbox.test.ts`) for this class of test; `removeLabel` simply needs to be added there.

