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
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | testing | tests/unit/adapter/github/github-client-request.test.ts | TC-006/TC-007 (POST/PUT network error → immediate rethrow) not covered. `fetch` throws path for POST/PUT is implemented correctly (line 74) but no test exercises it; the 5xx path is tested (TC-RC-013/014). "should" priority per test-cases.md. | Add tests that mock `fetchFn` to throw a network error for POST and PUT calls, asserting exactly 1 call and no sleep. | no |
| 2 | low | testing | tests/unit/adapter/github/github-client-pr.test.ts | TC-017 (non-200 from /statuses → GITHUB_API_ERROR) not covered. `_errorResponse` helper exists but is unused. Implementation is correct (lines 427-429). "should" priority per test-cases.md. | Activate `_errorResponse` in a test for `getCheckStatus` with a 403 statuses response. | no |
| 3 | low | maintainability | src/adapter/github/github-client.ts | Variable shadowing: function parameter `body: string` (PR description) is re-declared as `const body` in the 422 branch of `createPullRequest`. No functional bug — the parameter has already been serialized before the re-declaration. ESLint passes (no-shadow not enabled for this pattern). | Rename the inner variable (e.g. `const errorBody`) to avoid shadowing. | no |
| 4 | low | architecture | src/adapter/github/github-client.ts | `validateSameOrigin` is called on the initial URL of each pagination loop (the first iteration), which is trusted by construction (`${this.baseUrl}/…`). Design doc T-07 states "only Link-header-derived next URLs are validated." The extra URL parse is harmless. | Restructure loops to validate only after parsing `parseNextLink` (same pattern as a do-while with validation at the top of the second+ iteration). | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.85

## Summary

All three bugs (①a X-RateLimit re-fire, ①b POST/PUT 5xx retry, ②commit-status truncation, ③Retry-After HTTP-date) are fixed correctly. The same-origin guard (⑤) is in place for all five paginated methods. All 6 acceptance criteria are verified by tests. All 13 "must" test cases from test-cases.md are present. `typecheck`, `test`, and `lint` are green.

The four info-level findings are non-blocking: two missing "should"-priority tests, one variable shadowing (lint-clean, cosmetic), and one redundant same-origin check on the first loop iteration (harmless). No correctness, security, or architecture issues found.
