# Regression Gate Result — Iteration 11

**Branch**: refactor/runtime-mutation-lifecycle-capability-split-71d6a83e
**Date**: 2026-08-31
**Ledger items checked**: 30

---

## Summary

30 findings from the ledger were verified against the current code. 27 findings are FIXED. 3 findings remain present in the current code ([27], [29], [30]).

---

## Verification Evidence

### [1] spec.md contradiction with snapshotMainCheckoutGuard exception
- **Status**: FIXED
- **Evidence**: `spec.md:108–110` contains explicit exception clause: "**Exception**: `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` SHALL be the sole optional method (`?` modifier is permitted)." The contradiction is resolved.

### [2] T-09 double `?.` on required `verifyFindingRefs`
- **Status**: FIXED
- **Evidence**: `tasks.md:204` reads "Note: only a single `?.` is needed because `verifyFindingRefs` is a required method on `StepIoValidationCapability` (no second `?.` on the method itself)." No double optional-chain.

### [3] T-06 missing file specification for derive helpers
- **Status**: FIXED
- **Evidence**: `tasks.md:139` now states "Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`." Target files named explicitly.

### [4] buildDeps return type `unknown` in RuntimeStrategy port interface
- **Status**: FIXED
- **Evidence**: `src/core/port/runtime-strategy.ts:395–400` — `buildDeps(...)` declares return type `PipelineDeps` (not `unknown`). JSDoc explains `import type` is type-only with no runtime cycle.

### [5] `as PipelineDeps` cast still present after buildDeps call
- **Status**: FIXED
- **Evidence**: `src/core/command/runner.ts:222` — `deps = this.runtime.buildDeps(config, request, slug, workspace);` — no `as PipelineDeps` cast.

### [6] RoundGitEffectsCapability optional methods violating D6
- **Status**: FIXED
- **Evidence**: `src/core/pipeline/pipeline-capability.ts:95,111,128` — `listWorktreeChanges`, `commitRoundArtifacts`, `digestArtifacts` are all required (no `?`). JSDoc explicitly says "Required — D6" for each.

### [7] RuntimeStrategy.buildDeps returns unknown — duplicate of [4]
- **Status**: FIXED (same fix as [4])

### [8] `as PipelineDeps` cast at runner.ts:222 — duplicate of [5]
- **Status**: FIXED (same fix as [5])

### [9] `_latestBuiltDeps` side-channel not removed; `CommitPushInfra` missing `pushCapability`
- **Status**: FIXED
- **Evidence**: `src/core/runtime/local.ts:155–161` — `_latestBuiltDeps` is gone; only `_currentConfig` and `_currentRequest` remain. `src/core/step/commit-push.ts` — `pushCapability?: PushCapability | null` present on `CommitPushInfra`.

### [10] RoundGitEffectsCapability optional methods — duplicate of [6]
- **Status**: FIXED (same fix as [6])

### [11] Stale `runtimeStrategy: undefined` in PipelineDeps test fixtures
- **Status**: FIXED
- **Evidence**: `grep -r "runtimeStrategy: undefined"` in `src/` and `tests/` returns no matches.

### [12] `as PipelineDeps` cast — TC-021 non-compliant — duplicate of [5]
- **Status**: FIXED (same fix as [5])

### [13] RuntimeStrategy.buildDeps returns unknown — TC-022 non-compliant — duplicate of [4]
- **Status**: FIXED (same fix as [4])

### [14] TC-T15-05 does not prove compile-time invariant
- **Status**: FIXED
- **Evidence**: `tests/unit/step/executor-lifecycle-ordering.test.ts:341–353` — TC-T15-05 creates a `Pick<RuntimeStrategy, "buildDeps">` fake and calls through the port interface, returning typed `PipelineDeps` without any cast. The test proves the port interface returns `PipelineDeps` directly.

### [15] Stale runtimeStrategy entries in test fixtures — duplicate of [11]
- **Status**: FIXED (same fix as [11])

### [16] buildDeps `unknown` + `as PipelineDeps` cast — duplicate of [4] and [5]
- **Status**: FIXED (same fixes as [4] and [5])

### [17] Architecture doc misleading about buildDeps return type
- **Status**: FIXED
- **Evidence**: `architecture/components.md:175` now states "RuntimeStrategy インターフェース自体が `buildDeps(): PipelineDeps` を宣言する" with explanation of `import type` being type-only. No longer implies a discrepancy between interface and concrete level.

### [18] TC-T15-05 title/comment describes old behavior
- **Status**: FIXED
- **Evidence**: `tests/unit/step/executor-lifecycle-ordering.test.ts:325–353` — Title now reads "RuntimeStrategy.buildDeps() returns PipelineDeps directly; no cast needed in domain code (DSM §3 via allowlist)". No redundant `as PipelineDeps` cast in the test body. Comment block correctly explains `import type` erases at compile time.

### [19] TC-008 prepareStepArtifacts ordering not pinned by spy test
- **Status**: FIXED
- **Evidence**: `tests/unit/step/executor-lifecycle-ordering.test.ts:222–279` — TC-T15-06 added with `vi.fn()` spies on both `prepareStepArtifacts` and `runner.run`, and a shared `callOrder: string[]` array that asserts `callOrder[0] === "prepareStepArtifacts"` and `callOrder[1] === "runner.run"`.

### [20] Stale `runtimeStrategy` references in comments (step-types.ts, no-op-detect.ts)
- **Status**: FIXED
- **Evidence**: No `runtimeStrategy` references found in `src/core/port/step-types.ts` or `src/core/step/no-op-detect.ts`.

### [21] TerminalStateCapability test fake wrong signature
- **Status**: FIXED
- **Evidence**: `src/core/runtime/__tests__/local-runtime-capabilities.test.ts:43` — `makeTerminalStateSource()` now declares `commitFinalState(_cwd: string, _slug: string, _state: JobState): Promise<void>` — correct type and arity.

### [22] makeTerminalStateSource fake wrong commitFinalState signature — duplicate of [21]
- **Status**: FIXED (same fix as [21])

### [23] Stale `runtimeStrategy` field name in RecordFindingRecencyParams
- **Status**: FIXED
- **Evidence**: No `runtimeStrategy` field references found in `src/core/step/finding-recency.ts`.

### [24] Test local variables named `runtimeStrategy` in parallel-review-round-invalidation.test.ts
- **Status**: FIXED
- **Evidence**: No `runtimeStrategy` references found in `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts`.

### [25] `as never` forced casts on `roundGitEffects` in test sites
- **Status**: FIXED
- **Evidence**: `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:142` — `makeRuntimeStrategy()` explicitly returns `RoundGitEffectsCapability` (typed). Call sites pass `roundGitEffects: runtimeStrategy` without `as never` cast. The helper includes only the 5 interface methods.

### [26] StepExecutor and CommitOrchestrator collaborator lists cite `RuntimeStrategy`
- **Status**: FIXED
- **Evidence**: `architecture/components.md:67` — StepExecutor collaborators now list "StepArtifactLifecycleCapability（artifact finalize）/ StepIoValidationCapability（output gate）". Line 73 — CommitOrchestrator now lists "RoundGitEffectsCapability（git seam）/ CommitInspectionCapability（commit inspection）". No stale `RuntimeStrategy` references.

### [27] Terminal publication breaks the documented cwd fallback
- **Status**: STILL PRESENT
- **Evidence**: `src/core/pipeline/pipeline.ts:400` and `src/core/command/runner.ts:323–325` both use `if (deps.terminalState && deps.cwd)` as a guard — commitFinalState is silently skipped when `deps.cwd` is absent rather than falling back to `process.cwd()`. No `deps.cwd ?? process.cwd()` expression exists in either file.

### [28] Terminal publication still violates the documented cwd fallback — local.ts adapter
- **Status**: FIXED
- **Evidence**: `src/core/runtime/local.ts:791` — `commitFinalState(cwd: string, ...)` uses `const effectiveCwd = cwd;`. The adapter correctly uses the passed `cwd` parameter, not `this.cwd`. The concern about using the wrong cwd (LocalRuntime.cwd instead of the caller-supplied cwd) is resolved.

### [29] Optional cwd causes terminal publication to be skipped
- **Status**: STILL PRESENT
- **Evidence**: Same as [27]: `src/core/pipeline/pipeline.ts:400,627` — both awaiting-archive and awaiting-resume paths use `if (deps.terminalState && deps.cwd)` guard. When `deps.cwd` is absent (undefined/empty string), `commitFinalState` is silently skipped instead of using `process.cwd()` fallback. The existing test at TC-T15-04 locks in the skip behavior rather than the fallback behavior.

### [30] Optional cwd causes terminal publication to be skipped — duplicate of [29]
- **Status**: STILL PRESENT
- **Evidence**: Same as [27] and [29]. `src/core/pipeline/pipeline.ts` lines 400 and 627 both lack the `deps.cwd ?? process.cwd()` pattern. `src/core/command/runner.ts` halt path (line 323) also uses `if (deps.cwd)` guard without fallback.

---

## Conclusion

3 findings remain present: [27], [29], [30] (all related to the missing `deps.cwd ?? process.cwd()` fallback at pipeline terminal paths and runner halt path). All other 27 findings are FIXED.
