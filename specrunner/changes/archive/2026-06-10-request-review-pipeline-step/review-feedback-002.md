# Code Review Feedback — iteration 002

- **verdict**: needs-fix
- **iteration**: 002

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | testing | tests/unit/core/step/executor-verdict.test.ts | TC-003, TC-004, TC-024 (all must-priority) are not covered. `executor-verdict.test.ts` tests 10 cases for JUDGE / CODE_REVIEW / PRODUCER step classes but has zero tests for `REQUEST_REVIEW_REPORT_TOOL`. The entire `isRequestReviewStep` branch in `finalizeStep()` — the core behavioral change of this PR — is untested. Specifically: `toolResult {verdict:"approve"}` → `"approve"` (TC-003), `toolResult null` → `"needs-discussion"` (TC-004), `toolResult {verdict:"reject"}` → `"reject"` (TC-024). | Add a `makeRequestReviewStep()` helper using `REQUEST_REVIEW_REPORT_TOOL` and add three test cases: approve verdict, reject verdict, and null toolResult fallback. Mirror the existing `makeJudgeStep` / `makeRunnerWithToolResult` pattern already in the file. | yes |
| 2 | MEDIUM | testing | tests/unit/core/archive/orchestrator.test.ts | TC-014 "draft removed on archive" (must-priority) — Finding #3 from review-001 was marked "yes" but the assertion is still absent. `makeFs()` mocks `fs.rm` at line 71, but no test verifies `rm` was called with the expected draft path (`path.join(CWD, "specrunner/drafts", SLUG)`) and options `{ recursive: true, force: true }`. | Add an assertion to an existing or new test: after `runArchiveOrchestrator` completes, `(mockFs.rm as vi.MockedFunction<typeof fs.rm>).mock.calls` should include a call whose first argument equals `nodePath.join(CWD, "specrunner/drafts", SLUG)`. | yes |
| 3 | MEDIUM | testing | tests/unit/util/paths.test.ts, tests/unit/core/pipeline/pipeline-roles.test.ts | TC-020 (requestReviewResultPath format, must), TC-022 (RequestReviewStep kind/name/reportTool, must), TC-028 (STANDARD_DESCRIPTOR.startStep matches PipelineRunCommand startStep, must) have no test implementations. TC-020 and TC-022 were in review-001 finding #4 but remain absent. TC-028 is additionally not covered. | (a) In `paths.test.ts`: add `expect(requestReviewResultPath("foo", 1)).toBe("specrunner/changes/foo/request-review-result-001.md")`. (b) In a step test: assert `RequestReviewStep.kind === "agent"`, `name === "request-review"`, `reportTool === REQUEST_REVIEW_REPORT_TOOL`. (c) In `pipeline-roles.test.ts`: assert `STANDARD_DESCRIPTOR.startStep === "request-review"` and that `PipelineRunCommand.prepare()` returns `startStep === "request-review"`. | yes |
| 4 | LOW | testing | tests/unit/core/step/step-names.test.ts | TC-3 ("all AgentStep instances have names in AGENT_STEP_NAMES") uses `ALL_STEPS` that omits `RequestReviewStep`. TC-2's union-equality partially covers this, but TC-3's exhaustiveness claim is undermined. | Add `RequestReviewStep` import and include it in `ALL_STEPS`. | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 5 | 0.10 |

- **total**: 8.5

## Summary

Both HIGH findings from review-001 are resolved: `draft-move.test.ts` now tests copy semantics (TC-DRAFT-001 through TC-DRAFT-004), and `copy-artifacts.test.ts` adds TC-RECOPY-001 through TC-RECOPY-005 covering `recopyDraftToChangeFolder`. All 3568 tests pass. Implementation quality remains high.

Three blockers prevent approval: (1) the `isRequestReviewStep` executor branch is entirely untested — TC-003, TC-004, TC-024 (all must) have no coverage and this branch is the core new behavior introduced by this PR; (2) the TC-014 draft-deletion assertion is still missing from the archive orchestrator test despite review-001 marking it as fixed; (3) TC-020, TC-022, TC-028 (all must) from review-001 finding #4 remain unimplemented.
