# Implementation Notes: 2026-04-29-executor-cleanup

## Status

- **result**: completed
- **tasks_completed**: 49/49
- **timestamp**: 2026-04-29 23:30

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/core/step/executor.ts` | modified | Helper extraction, cast/fallback removal. 900 → 675 LOC |
| `src/core/step/executor-helpers.ts` | created | 5 cohesive helpers: createSessionWithHistory, recordFailedStepResult, attachStateAndRethrow, throwWrappedError, failStepWithError |
| `src/core/step/spec-review.ts` | modified | fetchSpecReviewResult decoupled from PipelineDeps; removed PipelineDeps import |
| `src/core/types.ts` | modified | githubFetch removed, githubClient made required |
| `src/core/agent/definition.ts` | modified | Added AGENT_TOOLSET_TYPE const |
| `src/core/agent/registry.ts` | modified | Removed `as StepName` cast; added step.name vs role mismatch guard |
| `src/core/agent/hash.ts` | modified | canonicalJson skips undefined values |
| `src/core/pipeline/run.ts` | created | runPipeline / runProposePipeline moved from deleted pipeline.ts |
| `src/core/pipeline/index.ts` | modified | Re-exports runPipeline / runProposePipeline from run.ts |
| `src/core/pipeline.ts` | deleted | Moved to pipeline/run.ts (directory-form migration, 1 commit) |
| `src/core/session.ts` | deleted | @deprecated (b) test-only; test migrated to direct SDK mock |
| `src/sdk/sessions.ts` | modified | Deleted deprecated SDK-calling functions (c) zero-ref; kept narrowing helpers |
| `src/state/store.ts` | modified | Deleted updateJobState / persistJobState @deprecated functions (b); inlined persistJobState |
| `src/cli/run.ts` | modified | Added createGitHubClient wiring; githubClient passed to runPipeline |
| `tests/pipeline.test.ts` | modified | TC-035~042 migrated from githubFetch to buildMockGithubClient |
| `tests/pipeline-integration.test.ts` | modified | All tests migrated from buildGithubFetch to buildMockGithubClient |
| `tests/spec-review-step.test.ts` | modified | Migrated from githubFetch to buildMockGithubClient |
| `tests/spec-review-fetch.test.ts` | modified | Updated to FetchSpecReviewResultParams; added production-path-is-executor comment |
| `tests/core/steps/spec-review.test.ts` | modified | githubFetch → githubClient mock |
| `tests/completion.test.ts` | modified | TC-034: startProposeSession → direct mockStreamEvents |
| `tests/state-store.test.ts` | modified | updateJobState → JobStateStore.update() |
| `tests/cli-stdout-snapshot.test.ts` | modified | Added required githubClient to makeMinimalDeps |
| `tests/core/pipeline/pipeline.test.ts` | modified | Added required githubClient to makeMinimalDeps |
| `tests/core/step/step-interface.test.ts` | modified | Added required githubClient to makeMinimalDeps |
| `tests/error-codes.test.ts` | modified | Added required githubClient to PipelineDeps |
| `tests/unit/step/executor.test.ts` | modified | Added required githubClient to PipelineDeps |
| `tests/unit/step/executor-helpers.test.ts` | created | Unit tests for all 5 executor helpers |
| `tests/unit/agent/hash.test.ts` | created | Tests for canonicalJson including undefined skip |
| `tests/unit/agent/registry.test.ts` | modified | Added mismatch test |

## Blocked Tasks

None. All 49 tasks completed.

## Deviations from Spec

1. **fetchSpecReviewResult signature change**: Per D5, `fetchSpecReviewResult` export is maintained for TC-012/013/014/015. However, to allow removing `githubFetch` from `PipelineDeps`, the function signature was changed from `(deps: PipelineDeps, ...)` to `(params: FetchSpecReviewResultParams, ...)`. `FetchSpecReviewResultParams` is a narrower type with only `{ githubFetch?, sleepFn?, repo, config }`. Tests updated accordingly. The function behavior is identical.

2. **RawConfig.agent field kept (category d)**: `config/schema.ts:80` has `@deprecated` on `RawConfig.agent`. Since `migrate.ts:77` directly accesses `raw.agent` as a typed field (not via `unknown` cast), deleting the field would cause a TypeScript error. The field is (d) schema field, not (b) or (c). Decision: keep with `@deprecated` annotation. The `delete toSave["agent"]` in `config/store.ts` ensures it is never written back. This is documented as the only remaining `@deprecated` annotation.

## @deprecated Residual Debt

| Symbol | File | Category | Decision |
|--------|------|----------|----------|
| `RawConfig.agent` | `src/config/schema.ts:80` | (d) schema field | Kept. `migrate.ts:77` accesses `raw.agent` by typed reference. Unconditional migration runs at load time (`applyMigration` in `config/store.ts`). Field never written back (`delete toSave["agent"]` in store.ts:86). Deletion would require migrate.ts to use `(raw as Record<string,unknown>)["agent"]` — not worth the obscurity. |

## fetchSpecReviewResult Decision

- **Export maintained**: TC-012/013/014/015 in `tests/spec-review-fetch.test.ts` call `fetchSpecReviewResult` directly. Per design D5, these tests are preserved.
- **Production path**: `StepExecutor.runPollingStyleStep` now uses `deps.githubClient.getRawFile` exclusively. The `fetchSpecReviewResult` function is no longer called by any production code path.
- **Signature decoupled**: Changed from `(deps: PipelineDeps)` to `(params: FetchSpecReviewResultParams)` to allow removing `githubFetch` from `PipelineDeps`.

## Module Analysis Adoption

| Recommendation | Decision | Rationale |
|----------------|----------|-----------|
| Extract `createSessionWithHistory` | Adopted | Wired into `runProposeStyleStep`. Polling-style retained inline (structurally different: 2-phase create+send, session update deferred post-poll). |
| Extract `recordFailedStepResult` | Adopted | Eliminates 3 identical pushStepResult patterns |
| Extract `attachStateAndRethrow` | Adopted | Eliminates 6 identical `(err as Record)["state"] = state; throw err` patterns |
| Extract `throwWrappedError` | Adopted | Eliminates 2 wrappedErr construction patterns |
| Extract `failStepWithError` | Adopted | Consolidates appendHistory + pushStepResult + fail + persist + throw sequence |
| Delete `verifyBranchLegacy` / `verifyChangeFolderLegacy` | Adopted | ~134 LOC removed; all tests migrated to buildMockGithubClient; githubClient now required |

## LOC Reduction

| Phase | executor.ts LOC | Delta |
|-------|-----------------|-------|
| Before (Phase A start) | ~900 | — |
| After Phase B (helper extraction) | 828 | −72 |
| After Phase E (verify*Legacy deletion) | 675 | −153 |
| After MEDIUM #1 fix (createSessionWithHistory wired) | 647 | −28 |
| **Total reduction** | — | **−253 LOC** |

Target was 750-800 LOC. Final 647 LOC is 103 below lower bound — well within spec.

## Fix History

| Retry | Findings Applied | Files Modified |
|-------|-----------------|---------------|
| — | Initial implementation | — |
| 1 | MEDIUM #1 (review-feedback-001): Wire `createSessionWithHistory` into `runProposeStyleStep`; add TC-NEW-helpers-005/006 | `src/core/step/executor.ts` (675→647 LOC), `tests/unit/step/executor-helpers.test.ts` (296→298 tests) |
