# Regression Gate Result — Iteration 012

**Date**: 2026-08-31
**Branch**: refactor/runtime-mutation-lifecycle-capability-split-71d6a83e
**Ledger size**: 30 findings

## Summary

All 30 ledger findings have been verified as **fixed** in the current codebase. No regressions detected.

---

## Evidence

### [1] `8b83c284` — spec.md exception clause for snapshotMainCheckoutGuard — FIXED
- **File**: `specrunner/changes/runtime-mutation-lifecycle-capability-split/spec.md:108`
- **Evidence**: Lines 108–110 now contain the explicit exception: "**Exception**: `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` SHALL be the sole optional method (`?` modifier is permitted)." The contradiction between the general rule and TC-004/tasks.md T-02 AC is resolved.

### [2] `e78bf761` — T-09 double `?.` on required method verifyFindingRefs — FIXED
- **File**: `specrunner/changes/runtime-mutation-lifecycle-capability-split/tasks.md:204`
- **Evidence**: T-09 now reads "only a single `?.` is needed because `verifyFindingRefs` is a required method on `StepIoValidationCapability` (no second `?.` on the method itself)." Confirmed in production code `step-completion.ts:256` which uses `deps.stepIo.verifyFindingRefs(...)` — no double `?.`.

### [3] `593fb7ec` — T-06 derive helper placement not explicit — FIXED
- **File**: `specrunner/changes/runtime-mutation-lifecycle-capability-split/tasks.md:139`
- **Evidence**: T-06 now explicitly states "Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`." with per-helper mappings to `step-capability.ts` / `pipeline-capability.ts`.

### [4] `b1e9a036` — buildDeps returns `unknown` in RuntimeStrategy port interface — FIXED
- **File**: `src/core/port/runtime-strategy.ts:394`
- **Evidence**: Line 395–400 shows `buildDeps(...)`: `PipelineDeps`. The JSDoc (lines 388–394) documents the `import type` cycle resolution. Return type is `PipelineDeps`, not `unknown`.

### [5] `964864b9` — `as PipelineDeps` cast in runner.ts:222 — FIXED
- **File**: `src/core/command/runner.ts:222`
- **Evidence**: Grep for `as PipelineDeps` in `runner.ts` returns no matches. Line 222 now reads `deps = this.runtime.buildDeps(config, request, slug, workspace);` — no cast.

### [6] `66311801` — RoundGitEffectsCapability methods optional — FIXED
- **File**: `src/core/pipeline/pipeline-capability.ts:92`
- **Evidence**: Methods `listWorktreeChanges` (line 95), `commitRoundArtifacts` (line 111), and `digestArtifacts` (line 128) are all declared without `?`. Each has a JSDoc comment noting "Required — D6: all capability methods are required."

### [7] `e2856da5` — same as [4] — FIXED

### [8] `2ab85cb8` — same as [5] — FIXED

### [9] `2afc3a56` — `_latestBuiltDeps` and CommitPushInfra.pushCapability — FIXED
- **File**: `src/core/runtime/local.ts:161` / `src/core/step/commit-push.ts:66`
- **Evidence**: `_latestBuiltDeps` appears only in a comment (line 155) describing what was replaced; no instance field assignment. `CommitPushInfra` (commit-push.ts:95) now declares `pushCapability?: PushCapability | null`. Lines 765–777 in local.ts use `this._currentConfig` / `this._currentRequest` stably set in `buildDeps`, with pushCapability threaded via `finalInfra`.

### [10] `2676babe` — same as [6] — FIXED

### [11] `f9cadb4a` — Stale `runtimeStrategy: undefined` in test fixtures — FIXED
- **File**: `src/core/pipeline/__tests__/iteration-display.test.ts:102`
- **Evidence**: Grep for `runtimeStrategy: undefined` in the four named files (iteration-display.test.ts, pipeline-one-shot-resume.test.ts, spec-review-fixer-routing.test.ts, implementer-recovery.test.ts) returns no matches.

### [12] `c759649a` — same as [5] — FIXED

### [13] `3cd30b91` — same as [4] — FIXED

### [14] `e44e50cc` — TC-T15-05 does not prove compile-time invariant — FIXED
- **File**: `tests/unit/step/executor-lifecycle-ordering.test.ts:260`
- **Evidence**: TC-T15-05 now creates a `Pick<RuntimeStrategy, "buildDeps">` typed fake and calls `fake.buildDeps(...)` through the port interface. The test assigns the result directly to `const deps` (no cast needed) and asserts `deps.slug === "test-slug"`. The test title now reads "RuntimeStrategy.buildDeps() returns PipelineDeps directly; no cast needed in domain code (DSM §3 via allowlist)."

### [15] `15eeb57f` — same as [11] — FIXED

### [16] `0bbb2081` — same as [4]+[5] — FIXED

### [17] `f325fc3f` — architecture doc claims buildDeps returns PipelineDeps (inaccurate for interface) — FIXED
- **File**: `architecture/components.md:175`
- **Evidence**: Line 175 now explicitly states "`RuntimeStrategy` インターフェース自体が `buildDeps(): PipelineDeps` を宣言する" and explains the `import type` erasure, confirming both the interface and concrete implementations return typed `PipelineDeps`.

### [18] `42e2e998` — TC-T15-05 title/comment contradicts TC-021/TC-022 — FIXED
- **File**: `tests/unit/step/executor-lifecycle-ordering.test.ts:267`
- **Evidence**: The test title and comment block (lines 341–353) now state the change: "This PR (D3/T-05/T-12) changed buildDeps() to return PipelineDeps directly…runner.ts no longer needs the `as PipelineDeps` cast (AC TC-022)." No redundant `as PipelineDeps` cast in the test body.

### [19] `6c02fc17` — TC-008 prepareStepArtifacts ordering not pinned by spy test — FIXED
- **File**: `tests/unit/step/executor-lifecycle-ordering.test.ts:130`
- **Evidence**: TC-T15-06 (lines 222–279) uses `vi.fn()` spies on both `prepareStepArtifacts` and `runner.run`, records call order into a shared `callOrder: string[]` array, and asserts `callOrder[0] === "prepareStepArtifacts"` and `callOrder[1] === "runner.run"`.

### [20] `0361ce52` — Stale runtimeStrategy references in comments — FIXED
- **File**: `src/core/port/step-types.ts:63`
- **Evidence**: `CliStepDeps` JSDoc (line 63) no longer mentions `runtimeStrategy`. `no-op-detect.ts` line 27 now says "deps.changedFiles is available (ChangedFilesCapability injected)" instead of referencing `runtimeStrategy`.

### [21] `dfe5963e` — TerminalStateCapability fake signature mismatch — FIXED
- **File**: `src/core/runtime/__tests__/local-runtime-capabilities.test.ts:42`
- **Evidence**: `makeTerminalStateSource()` at line 41–44 now declares `commitFinalState(_cwd: string, _slug: string, _state: JobState): Promise<void>` — correct `string` type (not `string | undefined`) and the `_state: JobState` third parameter is present.

### [22] `8bfa5251` — same as [21] — FIXED
- **File**: `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:58`
- **Evidence**: Same fix confirmed in managed-runtime-capabilities.test.ts.

### [23] `d99ce9e8` — Stale `runtimeStrategy` field name in RecordFindingRecencyParams — FIXED
- **File**: `src/core/step/finding-recency.ts:226`
- **Evidence**: Line 226 now reads `revisionContent: RevisionContentCapability | undefined`. Grep for `runtimeStrategy.*RevisionContentCapability` returns no matches. Same for `prior-round-context.ts`, `custom-reviewer-round-context.ts`, `post-fix-context.ts` — all renamed to their capability type names.

### [24] `efd2995e` — Test local variables named `runtimeStrategy` in invalidation test — FIXED
- **File**: `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts:214`
- **Evidence**: Grep for `const runtimeStrategy` / `let runtimeStrategy` in the file returns no matches. Variables are now named `roundGitEffects` matching their type.

### [25] `b0910a21` — `as never` forced casts on `roundGitEffects` in git-effects.test.ts — FIXED
- **File**: `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts:219`
- **Evidence**: `makeRuntimeStrategy()` at line 142 now explicitly returns `RoundGitEffectsCapability` and includes only the 5 interface methods plus `listChangedFiles`. The `makeDeps()` function at line 178 passes `roundGitEffects: undefined` with typed overrides. No `roundGitEffects: runtimeStrategy as never` pattern in the file. The 11 remaining `as never` casts are for unrelated fields (`config`, `agent`, `githubClient`, etc.).

### [26] `a039a195` — Architecture doc collaborator lists cite RuntimeStrategy — FIXED
- **File**: `architecture/components.md:67`
- **Evidence**: Line 67 (StepExecutor) now reads "協調: AgentRunner（port）/ Step / CommitOrchestrator（永続）/ EventBus / StepArtifactLifecycleCapability（artifact finalize）/ StepIoValidationCapability（output gate）." Line 73 (CommitOrchestrator) now reads "協調: StepExecutor / ParallelReviewRound（producer）/ JobStateStore（永続）/ RoundGitEffectsCapability（git seam）/ CommitInspectionCapability（commit inspection）/ EventBus."

### [27] `8a31005a` — Terminal publication cwd fallback broken in pipeline.ts — FIXED
- **File**: `src/core/pipeline/pipeline.ts:399`
- **Evidence**: Line 400 reads `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state);`. Both terminal paths (awaiting-archive at line 400, halt path at line 625) now use `deps.cwd ?? process.cwd()`.

### [28] `290e6a63` — Terminal publication cwd fallback in local.ts — FIXED
- **File**: `src/core/runtime/local.ts:791`
- **Evidence**: The adapter now receives `cwd: string` passed from the call site (pipeline.ts uses `deps.cwd ?? process.cwd()`). The production value is always correctly resolved before calling `commitFinalState`.

### [29] `eda3048d` — Optional cwd causes terminal publication skipped — FIXED
- **File**: `src/core/pipeline/pipeline.ts:399`
- **Evidence**: Both terminal call sites use `deps.cwd ?? process.cwd()` fallback, so `commitFinalState` is always called (not suppressed) when `terminalState` is present. Omitting `deps.cwd` no longer suppresses publication.

### [30] `5b1f4daf` — same as [29] — FIXED
- **File**: `src/core/pipeline/pipeline.ts:400`
- **Evidence**: Same fix at both pipeline terminal paths and the halt path at line 625.

---

## Verdict

No regressions. All 30 ledger findings are confirmed fixed in iteration 12.
