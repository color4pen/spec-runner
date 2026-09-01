# Regression Gate Result — Iteration 1

**Branch**: refactor/runtime-mutation-lifecycle-capability-split-71d6a83e
**Date**: 2026-08-30

## Summary

All 11 ledger findings verified. No regressions detected.

---

## Finding-by-Finding Verification

### [1] `8b83c284` — spec.md snapshotMainCheckoutGuard exception missing
- **File**: specrunner/changes/runtime-mutation-lifecycle-capability-split/spec.md:108
- **Status**: FIXED
- **Evidence**: spec.md line 110 now contains an explicit `**Exception**` clause: "This exception exists because the method's fail-open semantics require a `null` return value (not capability absence) when the check cannot be performed." The contradiction with TC-004 is resolved.

### [2] `e78bf761` — T-09 double `?.` on required method verifyFindingRefs
- **File**: specrunner/changes/runtime-mutation-lifecycle-capability-split/tasks.md:204
- **Status**: FIXED
- **Evidence**: tasks.md T-09 now reads: "Note: only a single `?.` is needed because `verifyFindingRefs` is a required method on `StepIoValidationCapability` (no second `?.` on the method itself)." The actual step-completion.ts implementation uses `deps.stepIo.verifyFindingRefs(...)` (no optional chaining on the method itself — `stepIo` itself may be absent via field, method is required).

### [3] `593fb7ec` — T-06 omits helper definition file, contradicts D5
- **File**: specrunner/changes/runtime-mutation-lifecycle-capability-split/tasks.md:139
- **Status**: FIXED
- **Evidence**: tasks.md T-06 line 139 now explicitly states: "Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`. Import the helpers into `local.ts`."

### [4] `b1e9a036` — buildDeps return type `unknown` in RuntimeStrategy port
- **File**: src/core/port/runtime-strategy.ts:394
- **Status**: FIXED
- **Evidence**: runtime-strategy.ts line 395 now declares `): PipelineDeps;` — the `unknown` return type has been replaced. JSDoc at lines 382–389 confirms the import cycle was broken.

### [5] `964864b9` — `as PipelineDeps` cast still present in runner.ts:222
- **File**: src/core/command/runner.ts:222
- **Status**: FIXED
- **Evidence**: Grep for `as PipelineDeps` in runner.ts returns no matches. Line 222 now reads `deps = this.runtime.buildDeps(config, request, slug, workspace);` with no cast.

### [6] `66311801` — RoundGitEffectsCapability has optional methods
- **File**: src/core/pipeline/pipeline-capability.ts:92
- **Status**: FIXED
- **Evidence**: Grep for `listWorktreeChanges?`, `commitRoundArtifacts?`, `digestArtifacts?` in pipeline-capability.ts returns no matches. All three methods are now declared without `?` modifier.

### [7] `e2856da5` — buildDeps return type `unknown` (duplicate finding)
- **File**: src/core/port/runtime-strategy.ts:394
- **Status**: FIXED
- **Evidence**: Same as [4] — return type is now `PipelineDeps`.

### [8] `2ab85cb8` — `as PipelineDeps` cast in runner.ts:222 (duplicate finding)
- **File**: src/core/command/runner.ts:222
- **Status**: FIXED
- **Evidence**: Same as [5] — cast removed.

### [9] `2afc3a56` — `_latestBuiltDeps` side-channel not removed; CommitPushInfra not extended
- **File**: src/core/runtime/local.ts:161
- **Status**: FIXED
- **Evidence**: local.ts lines 152–160 show `_latestBuiltDeps` has been eliminated and replaced with `_currentConfig: SpecRunnerConfig | null` and `_currentRequest: ParsedRequest | null`. commit-push.ts lines 87–94 show `CommitPushInfra` now has a `pushCapability` field (the R2b threading approach).

### [10] `2676babe` — RoundGitEffectsCapability optional methods (duplicate finding)
- **File**: src/core/pipeline/pipeline-capability.ts:92
- **Status**: FIXED
- **Evidence**: Same as [6] — all three methods are now required.

### [11] `f9cadb4a` — Stale `runtimeStrategy: undefined` in test fixtures
- **Files**: iteration-display.test.ts:102, pipeline-one-shot-resume.test.ts:95, spec-review-fixer-routing.test.ts:629+713, implementer-recovery.test.ts:96
- **Status**: FIXED
- **Evidence**: Grep for `runtimeStrategy` in all four originally-flagged files returns no matches (or only a comment string in spec-review-fixer-routing.test.ts — not a property assignment). The dead field has been removed from all identified fixtures.

---

## Evidence Summary

| # | Ref | Severity | Status |
|---|-----|----------|--------|
| 1 | `8b83c284` | MEDIUM | Fixed |
| 2 | `e78bf761` | LOW | Fixed |
| 3 | `593fb7ec` | LOW | Fixed |
| 4 | `b1e9a036` | HIGH | Fixed |
| 5 | `964864b9` | HIGH | Fixed |
| 6 | `66311801` | MEDIUM | Fixed |
| 7 | `e2856da5` | HIGH | Fixed |
| 8 | `2ab85cb8` | HIGH | Fixed |
| 9 | `2afc3a56` | HIGH | Fixed |
| 10 | `2676babe` | MEDIUM | Fixed |
| 11 | `f9cadb4a` | LOW | Fixed |

**Verdict**: No regressions. All 11 findings are resolved in the current code.
