# Regression Gate Result — Iteration 10

**Branch**: refactor/runtime-mutation-lifecycle-capability-split-71d6a83e
**Date**: 2026-08-31
**Ledger items checked**: 28

## Summary

All 28 findings from the ledger were verified against the current code. No regressions were detected.

---

## Verification Evidence

### [1] spec.md contradiction with TC-004 (snapshotMainCheckoutGuard exception)
- **Status**: FIXED
- **Evidence**: `spec.md:108–110` now contains an explicit exception clause: "**Exception**: `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` SHALL be the sole optional method (`?` modifier is permitted)." The contradiction is resolved.

### [2] T-09 double `?.` on required `verifyFindingRefs`
- **Status**: FIXED
- **Evidence**: `tasks.md:204` now reads "Note: only a single `?.` is needed because `verifyFindingRefs` is a required method on `StepIoValidationCapability` (no second `?.` on the method itself)." No double optional-chain remains.

### [3] T-06 missing file specification for derive helpers
- **Status**: FIXED
- **Evidence**: `tasks.md:139` now explicitly states "Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`. Import the helpers into `local.ts`:" with named target files for each helper.

### [4] buildDeps return type `unknown` in RuntimeStrategy port interface
- **Status**: FIXED
- **Evidence**: `src/core/port/runtime-strategy.ts:395–400` — `buildDeps(...)` now declares return type `PipelineDeps` (not `unknown`). JSDoc correctly explains `import type` is type-only with no runtime cycle.

### [5] `as PipelineDeps` cast still present after buildDeps call
- **Status**: FIXED
- **Evidence**: `src/core/command/runner.ts:222` — `deps = this.runtime.buildDeps(config, request, slug, workspace);` — no `as PipelineDeps` cast present.

### [6] RoundGitEffectsCapability optional methods violating D6
- **Status**: FIXED
- **Evidence**: `src/core/pipeline/pipeline-capability.ts:95,111,128` — `listWorktreeChanges`, `commitRoundArtifacts`, `digestArtifacts` are all required (no `?`). JSDoc explicitly says "Required — D6" for each method.

### [7] RuntimeStrategy.buildDeps returns unknown — duplicate of [4]
- **Status**: FIXED (same fix as [4])

### [8] `as PipelineDeps` cast at runner.ts:222 — duplicate of [5]
- **Status**: FIXED (same fix as [5])

### [9] `_latestBuiltDeps` side-channel not removed; `CommitPushInfra` missing `pushCapability`
- **Status**: FIXED
- **Evidence**: `src/core/runtime/local.ts:155–161` — `_latestBuiltDeps` is gone; only `_currentConfig` and `_currentRequest` remain (with comment noting the replacement). `src/core/step/commit-push.ts:95` — `pushCapability?: PushCapability | null` is present on `CommitPushInfra`.

### [10] RoundGitEffectsCapability optional methods — duplicate of [6]
- **Status**: FIXED (same fix as [6])

### [11] Stale `runtimeStrategy: undefined` in PipelineDeps test fixtures
- **Status**: FIXED
- **Evidence**: `src/core/pipeline/__tests__/iteration-display.test.ts`, `pipeline-one-shot-resume.test.ts`, `parallel-review-round-invalidation.test.ts`, `tests/unit/absorb-build-fixer/implementer-recovery.test.ts` — no `runtimeStrategy` references found in any of these files.

### [12] `as PipelineDeps` cast — TC-021 non-compliant — duplicate of [5]
- **Status**: FIXED (same fix as [5])

### [13] RuntimeStrategy.buildDeps returns unknown — TC-022 non-compliant — duplicate of [4]
- **Status**: FIXED (same fix as [4])

### [14] TC-T15-05 does not prove compile-time invariant
- **Status**: FIXED
- **Evidence**: `tests/unit/step/executor-lifecycle-ordering.test.ts:341–353` — TC-T15-05 now creates a `Pick<RuntimeStrategy, "buildDeps">` fake and calls through the port interface `fake.buildDeps(...)`, returning a typed `PipelineDeps` without any cast. This correctly proves the port interface returns `PipelineDeps`.

### [15] Stale runtimeStrategy entries in test fixtures — duplicate of [11]
- **Status**: FIXED (same fix as [11])

### [16] buildDeps `unknown` + `as PipelineDeps` cast — duplicate of [4] and [5]
- **Status**: FIXED (same fixes as [4] and [5])

### [17] Architecture doc misleading about buildDeps return type
- **Status**: FIXED
- **Evidence**: `architecture/components.md:175` now accurately states the `RuntimeStrategy` interface itself declares `buildDeps(): PipelineDeps` with a `import type` that is type-only. No longer implies the interface-level return is different from the concrete level.

### [18] TC-T15-05 title/comment describes old behavior
- **Status**: FIXED
- **Evidence**: `tests/unit/step/executor-lifecycle-ordering.test.ts:325–352` — The test title now reads "RuntimeStrategy.buildDeps() returns PipelineDeps directly; no cast needed in domain code (DSM §3 via allowlist)" and the comment block correctly explains `import type` erases at compile time. The test no longer contains a redundant `as PipelineDeps` cast.

### [19] TC-008 prepareStepArtifacts ordering not pinned by spy test
- **Status**: FIXED
- **Evidence**: `tests/unit/step/executor-lifecycle-ordering.test.ts:222–279` — TC-T15-06 added with `vi.fn()` spies on both `prepareStepArtifacts` and `runner.run`, and a shared `callOrder: string[]` array that asserts `callOrder[0] === "prepareStepArtifacts"` before `callOrder[1] === "runner.run"`.

### [20] Stale `runtimeStrategy` references in comments (step-types.ts, no-op-detect.ts)
- **Status**: FIXED
- **Evidence**: `src/core/port/step-types.ts:308` — Now reads "Only effective when deps.changedFiles is available". No stale `runtimeStrategy` references in `no-op-detect.ts`.

### [21] TerminalStateCapability test fake wrong signature
- **Status**: FIXED
- **Evidence**: `src/core/runtime/__tests__/local-runtime-capabilities.test.ts:43` — `makeTerminalStateSource()` now declares `commitFinalState(_cwd: string, _slug: string, _state: JobState): Promise<void>` — correct type and arity.

### [22] makeTerminalStateSource fake wrong commitFinalState signature — duplicate of [21]
- **Status**: FIXED (same fix as [21])

### [23] Stale `runtimeStrategy` field name in RecordFindingRecencyParams and other params
- **Status**: FIXED
- **Evidence**: No `runtimeStrategy.*Capability` pattern found in `src/core/step/`. The field has been renamed to match the capability type.

### [24] Test local variables named `runtimeStrategy` in parallel-review-round-invalidation.test.ts
- **Status**: FIXED
- **Evidence**: `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` — zero `runtimeStrategy` references found.

### [25] Terminal publication breaks cwd fallback in pipeline.ts
- **Status**: FIXED
- **Evidence**: `src/core/pipeline/pipeline.ts:399,623` — both `commitFinalState` call sites now use `deps.cwd ?? process.cwd()`.

### [26] Terminal publication violates cwd fallback in local.ts
- **Status**: FIXED
- **Evidence**: `src/core/runtime/local.ts:790` — `commitFinalState(cwd: string, ...)` takes a `string` (not `string | undefined`). The caller (pipeline.ts and runner.ts) supplies `deps.cwd ?? process.cwd()` before calling, ensuring a valid cwd is always passed.

### [27] Optional cwd causes terminal publication to be skipped
- **Status**: FIXED
- **Evidence**: `src/core/pipeline/pipeline.ts:399` — `deps.cwd ?? process.cwd()` ensures fallback. No skipping of `commitFinalState` when `deps.cwd` is absent.

### [28] Optional cwd causes terminal publication to be skipped — duplicate of [27]
- **Status**: FIXED (same fix as [27])

---

## Conclusion

No regressions detected. All 28 ledger findings are fixed in the current iteration.
