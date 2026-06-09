# Code Review Feedback — iteration 001

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | HIGH | testing | tests/unit/core/runtime/draft-move.test.ts | 4 tests (TC-DRAFT-001 through TC-DRAFT-004) test OLD move semantics via `simulateSetupWorkspaceDraftMove`, which still deletes the draft. T-14 explicitly requires updating these tests to copy semantics. They pass only because they test a local stub, not actual `local.ts` code — they now document deprecated behavior. | Rewrite these tests to assert copy semantics: after `setupWorkspace`, the draft file at `specrunner/drafts/<slug>/request.md` still exists. Alternatively, remove the file and add copy-semantics tests alongside the new `recopyDraftToChangeFolder` tests. | yes |
| 2 | HIGH | testing | tests/unit/util/copy-artifacts.test.ts | `recopyDraftToChangeFolder` is new code in `copy-artifacts.ts` with zero unit tests. TC-012 (edited draft reviewed after resume) and TC-013 (absent draft skipped) are both must-priority test cases that depend solely on this function. Neither is covered. | Add unit tests: (a) draft exists → file overwritten + `git add` called; (b) draft absent → no-op, no error; (c) symlink at draft path → `SpecRunnerError(SYMLINK_REJECTED)` thrown; (d) target dir created when absent. | yes |
| 3 | MEDIUM | testing | src/core/archive/__tests__/orchestrator.test.ts | TC-014 "draft removed on archive" is a must-priority test case. The orchestrator test mocks `fs.rm` but never asserts it was called with the draft directory path. The implementation exists; the assertion is missing. | Add assertion: after `runArchiveOrchestrator`, `fs.rm` was called with `path.join(FAKE_CWD, "specrunner/drafts", FAKE_SLUG)` and `{ recursive: true, force: true }`. | yes |
| 4 | LOW | testing | tests/unit/util/ and tests/unit/step/ | TC-020 (`requestReviewResultPath("foo", 1)` format), TC-021 (`getOutputTemplates("request-review", ...)` returns result file on first iteration), TC-022 (`RequestReviewStep.kind/name/reportTool`), TC-023 (`reads()` declares `request.md`), TC-024 (toolResult `{verdict:"reject"}` → step verdict `"reject"`) are must/should-priority test cases with no test implementations. | Add targeted unit tests in `copy-artifacts.test.ts` for path helpers, in `step-io-contracts.test.ts` for RequestReviewStep reads/writes, and in `executor.test.ts` for the reject verdict derivation. | yes |

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

Implementation quality is high. `RequestReviewStep` correctly follows the judge-step pattern (spec-review / conformance), executor verdict branching is clean and well-isolated, all 4 pipeline transitions are present, resume recopy and archive draft deletion are properly placed. TypeCheck passes and all 3568 tests are green.

Two high-severity test gaps block approval: (1) `draft-move.test.ts` actively tests deprecated move semantics that T-14 requires updating; (2) `recopyDraftToChangeFolder` — the central function behind TC-012 and TC-013 — has zero test coverage. The archive orchestrator test also lacks an assertion for TC-014 draft deletion.

