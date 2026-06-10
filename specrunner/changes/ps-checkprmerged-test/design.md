# Design: ps.checkPrMerged unit tests

## Context

`checkPrMerged(job, githubClient)` at `src/cli/ps.ts:99` has no unit tests. The function has three guard branches (missing pullRequest, missing githubClient, API error) and two nominal paths (MERGED → true, non-MERGED → false). These behaviors need test coverage.

## Goals / Non-Goals

**Goals**:
- Add unit tests covering all 5 behavioral scenarios of `checkPrMerged`
- No changes to `src/`

**Non-Goals**:
- Testing `runPs` end-to-end or display formatting
- Testing `GitHubClient` adapter itself

## Decisions

**D1 — Inline mock, not `buildMockGithubClient`**

`buildMockGithubClient` is designed for pipeline integration tests that need the full `GitHubClient` surface. `checkPrMerged` only calls `getPullRequest`. An inline `vi.fn()` cast keeps the test file self-contained and eliminates unnecessary coupling.

Alternatives: use `buildMockGithubClient` with a custom `getPullRequest` override — rejected because it imports pipeline-test infrastructure for a pure unit test.

**D2 — File placement: `tests/unit/cli/ps-check-pr-merged.test.ts`**

Follows the existing `tests/unit/cli/ps-*.test.ts` convention (`ps-filter.test.ts`, `ps-pr-hint.test.ts`).

## Risks / Trade-offs

None. Test-only change; no production code modified.

## Open Questions

None.
