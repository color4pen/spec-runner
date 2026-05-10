# Implementation Notes: centralize-change-path

## Status

- **result**: completed
- **tasks_completed**: 34/34
- **timestamp**: 2026-05-10

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/util/paths.ts` | created | Path utility module with 8 functions: `changeFolderPath`, `specReviewResultPath`, `reviewFeedbackPath`, `verificationResultPath`, `prCreateResultPath`, `requestMdPath`, `changesDirRel`, `specsDirRel` |
| `tests/util/paths.test.ts` | created | Unit tests for all path functions (TC-001 through TC-011); fixed import from `bun:test` to `vitest` |
| `src/core/step/spec-review.ts` | modified | `buildFindingsPath` delegates to `specReviewResultPath` |
| `src/core/step/code-review.ts` | modified | `buildReviewFeedbackPath` delegates to `reviewFeedbackPath`; message uses `changeFolderPath` |
| `src/core/step/verification.ts` | modified | `resultFilePath` and `parseResult` use `verificationResultPath` |
| `src/core/step/pr-create.ts` | modified | `resultFilePath` uses `prCreateResultPath` |
| `src/core/verification/runner.ts` | modified | Output path uses `verificationResultPath` |
| `src/core/verification/propagate.ts` | modified | `sourceFile` and `VERIFICATION_RESULT_REL_PATH` use `verificationResultPath` |
| `src/core/step/implementer.ts` | modified | Message uses `changeFolderPath` |
| `src/core/step/spec-fixer.ts` | modified | Message uses `changeFolderPath`; fallback uses `specReviewResultPath` |
| `src/core/step/code-fixer.ts` | modified | Message uses `changeFolderPath` |
| `src/core/step/build-fixer.ts` | modified | Message uses `changeFolderPath` |
| `src/prompts/propose-system.ts` | modified | Static prompt uses module-level `_changesDir`/`_specsDir` constants from `changesDirRel()`/`specsDirRel()` |
| `src/prompts/spec-review-system.ts` | modified | Static prompt uses `_changesDir`; message uses `specReviewResultPath` |
| `src/prompts/test-case-gen-system.ts` | modified | Uses `changeFolderPath` for `changeFolder` variable |
| `src/prompts/code-review-system.ts` | modified | Static prompt uses `_changesDir` |
| `src/core/finish/archive-openspec.ts` | modified | Uses `changeFolderPath` for change folder; `changesDirRel` for git add arg |
| `src/core/finish/preflight.ts` | modified | Uses `changeFolderPath` for existence check |
| `src/cli/finish.ts` | modified | Uses `requestMdPath` for request.md path |
| `src/git/dynamic-context.ts` | modified | Uses `specsDirRel`/`changesDirRel` for directory traversal |
| `src/errors.ts` | modified | `specReviewResultNotFoundError`/`codeReviewResultNotFoundError` use `specReviewResultPath`/`reviewFeedbackPath` |
| `src/adapter/managed-agent/agent-runner.ts` | modified | Uses `changeFolderPath` (renamed local var to `changeFolderRelPath`) |
| `src/core/command/runner.ts` | modified | Fallback path uses `specReviewResultPath` |
| `src/core/pr-create/body-template.ts` | modified | `resultPathTemplate` functions use `specReviewResultPath`/`verificationResultPath`/`reviewFeedbackPath`; test-cases reference uses `changeFolderPath` |
| `tests/core/steps/spec-review.test.ts` | modified | Uses `specReviewResultPath` from paths.ts |
| `tests/unit/step/code-review.test.ts` | modified | Uses `reviewFeedbackPath`, `changeFolderPath` |
| `tests/pipeline-integration.test.ts` | modified | Uses `verificationResultPath`, `prCreateResultPath` |
| `tests/test-case-gen-step.test.ts` | modified | Uses `changeFolderPath` |
| `tests/prompts/spec-fixer-system.test.ts` | modified | Uses `specReviewResultPath` |
| `tests/cli-run-verdict.test.ts` | modified | Uses `changeFolderPath` |
| `tests/spec-review-step.test.ts` | modified | Uses `specReviewResultPath` |
| `tests/finish-archive-openspec.test.ts` | modified | Uses `changeFolderPath` |
| `tests/store/job-state-store.test.ts` | modified | Uses `specReviewResultPath` |
| `tests/state/io.test.ts` | modified | Uses `changeFolderPath` |
| `tests/state/helpers.test.ts` | modified | Uses `specReviewResultPath` |
| `tests/prompts/dynamic-context-prompts.test.ts` | modified | Uses `reviewFeedbackPath` |
| `tests/unit/core/pr-create/body-template.test.ts` | modified | Uses `specReviewResultPath`, `verificationResultPath`, `reviewFeedbackPath` |
| `tests/unit/core/pipeline/pipeline.transitions.test.ts` | modified | Uses `changeFolderPath`, `verificationResultPath`, `reviewFeedbackPath` |
| `tests/core/step/step-interface.test.ts` | modified | Uses `specReviewResultPath` |
| `tests/unit/core/step/types.test.ts` | modified | Uses `verificationResultPath` |
| `tests/git/dynamic-context.test.ts` | modified | Uses `changesDirRel`, `specsDirRel` |
| `tests/unit/adapter/github/get-raw-file.test.ts` | modified | Uses `specReviewResultPath` |
| `tests/unit/adapter/github/verify-path.test.ts` | modified | Uses `changeFolderPath` |
| `tests/unit/adapter/managed-agent/agent-runner.test.ts` | modified | Uses `specReviewResultPath` |
| `tests/unit/core/verification/propagate.test.ts` | modified | Uses `verificationResultPath` |
| `tests/unit/step/build-fixer.test.ts` | modified | Uses `verificationResultPath`, `changeFolderPath` |
| `tests/unit/step/code-fixer.test.ts` | modified | Uses `reviewFeedbackPath`, `changeFolderPath` |
| `tests/unit/step/verification.test.ts` | modified | Uses `verificationResultPath` |
| `tests/unit/step/pr-create.test.ts` | modified | Uses `prCreateResultPath` |
| `tests/unit/step/review-exit-contract.test.ts` | modified | Uses `specReviewResultPath`, `reviewFeedbackPath`, `changeFolderPath` |
| `tests/unit/step/implementer.test.ts` | modified | Uses `changeFolderPath` |
| `tests/unit/adapter/claude-code/agent-runner.test.ts` | modified | Uses `specReviewResultPath` |
| `tests/unit/adapter/claude-code/agent-runner-executor-integration.test.ts` | modified | Uses `specReviewResultPath`, `changeFolderPath` |
| `tests/core/pipeline/pipeline.test.ts` | modified | Uses `changeFolderPath`, `reviewFeedbackPath`, `verificationResultPath`, `prCreateResultPath` |
| `tests/schema.test.ts` | modified | Uses `changeFolderPath` |
| `openspec/changes/centralize-change-path/tasks.md` | modified | All tasks marked complete |

## Blocked Tasks

None.

## Deviations from Spec

**Extra files**: `src/core/command/runner.ts`, `src/core/pr-create/body-template.ts`, and additional test files not listed in tasks.md also had `openspec/changes/` path literals. These were updated to satisfy the must acceptance criteria TC-030/TC-031/TC-032 (no remaining path literals outside paths.ts implementation).

**bun:test → vitest**: `tests/util/paths.test.ts` was originally created with `import from 'bun:test'` but the project test runner is Vitest. Fixed import to use `vitest` so the test file runs under the existing test suite.
