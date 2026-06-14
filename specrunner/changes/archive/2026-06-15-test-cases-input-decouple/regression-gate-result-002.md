# Regression Gate Result — Iteration 2

- **verdict**: approved

## Findings Ledger Verification

### [MEDIUM] TC-009 not covered: custom reviewer composition path untested
- **Status**: FIXED — still present
- **Evidence**: `tests/unit/core/command/pipeline-run-input-completeness.test.ts` lines 318–400 contain a dedicated `describe("TC-009 / T-08-4: custom reviewer composition …")` block with 3 tests. Each test overrides the global `loadReviewerDefinitions` mock via `vi.mocked(loadReviewerDefinitions).mockResolvedValueOnce([fakeReviewerDef])` to inject a real `ReviewerDefinition`, triggering `composeReviewerDescriptor` to append a custom reviewer step. The tests assert that `DescriptorInputCompletenessError` is thrown from `prepare()`, that `bootstrapJob` is NOT called, and that violation details include the custom reviewer step name (`tc009-fake`) and an unsatisfied path (`design.md` or `tasks.md`). The previously untested composition path is now exercised.

### [LOW] makeCleanDescriptor hardcodes request.md path instead of using requestMdPath()
- **Status**: FIXED — still present
- **Evidence**: `makeCleanDescriptor()` at line 101 now reads `reads: (_state, deps) => [{ path: requestMdPath(deps.slug) }]` (line 106), using the `requestMdPath` function imported from `src/util/paths.js` (line 30). The hardcoded template literal `specrunner/changes/${deps.slug}/request.md` is gone.

## Summary

No regressions found. Both fixes from iteration 1 remain intact in the current code. The descriptor input-completeness test suite is complete and covers the custom reviewer composition path (TC-009) and uses path utilities rather than hardcoded strings.
