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
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 10 | 0.10 |
| testing | 10 | 0.10 |

- **total**: 10.0

## Summary

INV-8 cleanup: guard reviewer snapshot in `pipeline-run.ts` by descriptor capability. No blocking findings.

**Scope**: Two `src/` files changed — `pipeline-run.ts` (guard condition) and new `reviewer-capability.ts` (pure predicate). Forbidden surfaces (`src/core/port/**`, `src/state/schema.ts`, `src/state/lifecycle.ts`, `compose-reviewers.ts`) are untouched.

**Correctness**: `descriptorHasReviewerInsertionPoint` uses the same CONFORMANCE anchor as `composeReviewerDescriptor`. The guard condition `reviewers.length > 0 && descriptorHasReviewerInsertionPoint(descriptor)` short-circuits correctly for empty reviewer lists, and `descriptor` is already in scope from the same `prepare()` call at `:90`.

**Tests**: All four behavioral cases are covered (design-only+defs → undefined; standard+defs → set; fast+defs → set; empty → undefined). T-03 anchor-discrimination tests confirm CONFORMANCE-present+code-review-absent → true and code-review-present+CONFORMANCE-absent → false. T-03 id-nondeependence tests confirm the predicate does not branch on `descriptor.id`. T-04 alignment test calls the real `composeReviewerDescriptor` and observes fake reviewer reachability via positional check (`baseNames.has(n)` for steps after the fake) — no CONFORMANCE token used on the observation side, preventing X⟺X tautology.

**Verification**: 401 test files, 5346 tests green. Build, typecheck, lint all pass.

