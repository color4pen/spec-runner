# Implementation Notes: stepcontext-type-separation

## Status

- **result**: completed
- **tasks_completed**: 16/16
- **timestamp**: 2026-05-06 23:05

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `src/core/types.ts` | modified | Added `StepContext` interface with 5 fields; `PipelineDeps` now `extends StepContext`, removed duplicate field definitions |
| `src/core/step/types.ts` | modified | `StepDeps` alias changed from `PipelineDeps` to `StepContext`; updated import |
| `src/adapter/claude-code/agent-runner.ts` | modified | Removed all 4 `undefined as any` casts; `buildMessage`/`resultFilePath` deps use `stepCtx: StepContext` |
| `src/adapter/managed-agent/agent-runner.ts` | rewritten | Removed `JobStateStore`; `runProposeStyle`/`runPollingStyle` return pure `AgentRunResult` without `_updatedState`; error handling via `throwWrappedError`/`attachStateAndRethrow` |
| `src/core/step/executor.ts` | modified | Added `store.update` at top (TC-012); removed `_updatedState` branch; added `.catch()` to normalize thrown errors; added `${step.name}-failed` history entry on error; added `propose-started`/`propose-verdict` history entries; records `result.sessionId` and `result.agentBranch` |
| `src/core/pipeline/pipeline.ts` | modified | Added `status: "awaiting-merge"` on `nextStep === "end"` (was previously set by old `ManagedAgentRunner.runProposeStyle`) |
| `src/core/step/spec-fixer.ts` | modified | Added `completionVerdict: "approved"` to enable spec-fixer → spec-review loop transition |
| `tests/pipeline.test.ts` | modified | TC-035: updated history assertions to `propose-started`/`propose-verdict` (executor-generated); TC-040: changed to stderr assertion |
| `tests/unit/step/executor.test.ts` | modified | Updated NO_COMMIT_DETECTED history entry check from `spec-fixer-no-commit-detected` to `spec-fixer-failed` (executor now generates generic error entries) |
| `tests/unit/core/step/types.test.ts` | modified | Removed `client`/`githubClient`/`sleepFn` from `makeMinimalDeps()` |
| `tests/unit/step/build-fixer.test.ts` | modified | Same `makeMinimalDeps()` fix |
| `tests/unit/step/code-fixer.test.ts` | modified | Same `makeMinimalDeps()` fix |
| `tests/unit/step/code-review.test.ts` | modified | Same `makeMinimalDeps()` fix |
| `tests/unit/step/implementer.test.ts` | modified | Same `makeMinimalDeps()` fix |
| `tests/unit/step/pr-create.test.ts` | modified | Same `makeMinimalDeps()` fix |
| `tests/unit/step/review-exit-contract.test.ts` | modified | Fixed both `makeDeps()` functions |
| `tests/unit/step/verification.test.ts` | modified | Same `makeMinimalDeps()` fix |

## Blocked Tasks

None.

## Deviations from Spec

- **spec-fixer `completionVerdict`**: The spec did not mention adding `completionVerdict: "approved"` to `SpecFixerStep`. This was required because the old `ManagedAgentRunner` returned `_updatedState` with `verdict: null` and the pipeline's `getStepOutcome` default path returned "approved" for non-propose steps. After removal of `_updatedState`, the executor now converts null verdict to "escalation" before storing, breaking the spec-fixer loop. Adding `completionVerdict: "approved"` restores the correct behavior declaratively, consistent with `build-fixer`/`code-fixer` patterns.

- **`${step.name}-failed` history entry**: The spec (TC-017) describes `step-started`/`step-complete` entries. When an error occurs, the executor now adds a `${step.name}-failed` entry instead. This replaces the old adapter-specific `spec-fixer-no-commit-detected` entry with a uniform pattern across all steps.

## Module Analysis Adoption

| Recommendation | Decision | Rationale |
|----------------|----------|-----------|
| StepContext 5 fields only | adopted | Exactly `config`, `slug`, `cwd?`, `request`, `repo` — no extras |
| PipelineDeps extends StepContext | adopted | Liskov substitution preserved; pipeline code unchanged |
| Executor as sole state persistence authority | adopted | All `JobStateStore` removed from `ManagedAgentRunner` |
| `_updatedState` removal | adopted | Port interface `AgentRunResult` has no private extension fields |

## Fix History

None (initial implementation).
