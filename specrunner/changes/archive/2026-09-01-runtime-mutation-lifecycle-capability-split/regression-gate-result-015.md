# Regression Gate Result — Iteration 015

**Branch**: refactor/runtime-mutation-lifecycle-capability-split-71d6a83e
**Date**: 2026-08-31

## Summary

All 37 ledger findings verified against current code. No regressions detected.

---

## Verification Evidence

### [1] `8b83c284` — spec.md vs TC-004 contradiction on snapshotMainCheckoutGuard — ✅ FIXED

spec.md line 138 now explicitly includes `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` as required: "All methods in a capability interface SHALL be required (no `?` modifier), `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` included: 'the check cannot be performed' SHALL be expressed by the method returning `null`." test-cases.md TC-004 now says "snapshotMainCheckoutGuard included — null return expresses 'cannot check'". No contradiction.

### [2] `e78bf761` — T-09 double ?. on verifyFindingRefs — ✅ FIXED

tasks.md line 204 now notes "only a single `?.` is needed because `verifyFindingRefs` is a required method." step-completion.ts lines 256, 274 use `deps.stepIo.verifyFindingRefs(...)` — single call, no double `?.`.

### [3] `593fb7ec` — T-06 missing helper file specification — ✅ FIXED

tasks.md T-06 line 139 now says: "Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`. Import the helpers into `local.ts`."

### [4] `b1e9a036` — buildDeps still returns unknown in RuntimeStrategy port — ✅ FIXED

`buildDeps()` has been moved entirely off `RuntimeStrategy` (runtime-strategy.ts) to the domain-owned `PipelineDepsBuilder` interface in `types.ts` (T-18). `PipelineDepsBuilder.buildDeps()` returns `PipelineDeps` directly. `runtime-strategy.ts` has no import from `types.ts` and no `buildDeps` declaration.

### [5] `964864b9` — as PipelineDeps cast in runner.ts:222 — ✅ FIXED

runner.ts line 222: `deps = this.runtime.buildDeps(config, request, slug, workspace);` — no `as PipelineDeps` cast. The call resolves through `PipelineDepsBuilder` (typed return), so no cast is needed.

### [6] `66311801` — RoundGitEffectsCapability optional methods — ✅ FIXED

pipeline-capability.ts lines 95, 111, 128: `listWorktreeChanges`, `commitRoundArtifacts`, `digestArtifacts` are all required (no `?` modifier). JSDoc comments confirm "Required — D6: all capability methods are required."

### [7] `e2856da5` — RuntimeStrategy.buildDeps returns unknown (duplicate of [4]) — ✅ FIXED

Same as [4]. `buildDeps` is in `PipelineDepsBuilder` (types.ts) returning `PipelineDeps`. `runtime-strategy.ts` has no `buildDeps` declaration and no import of `PipelineDeps`.

### [8] `2ab85cb8` — as PipelineDeps cast in runner.ts:222 (duplicate of [5]) — ✅ FIXED

Same as [5]. No `as PipelineDeps` cast present in runner.ts.

### [9] `2afc3a56` — _latestBuiltDeps side-channel not removed — ✅ FIXED

`_latestBuiltDeps` is absent from local.ts (grep returns no results). `CommitPushInfra.pushCapability` field exists in commit-push.ts line 95: `pushCapability?: PushCapability | null;`. `finalizeStepArtifacts` no longer reads from instance state.

### [10] `2676babe` — RoundGitEffectsCapability optional methods (duplicate of [6]) — ✅ FIXED

Same as [6]. All three methods are required. parallel-review-round.ts uses field-presence checks, not method-presence checks.

### [11] `f9cadb4a` — Stale runtimeStrategy: undefined in test fixtures — ✅ FIXED

Grep for `runtimeStrategy: undefined` in src/ and tests/ returns zero results in source files (only appears in markdown result files). All four affected test files confirmed clean.

### [12] `c759649a` — as PipelineDeps cast in runner.ts (TC-021) — ✅ FIXED

runner.ts has no `as PipelineDeps` cast. TC-021 satisfied.

### [13] `3cd30b91` — RuntimeStrategy.buildDeps returns unknown (TC-022) — ✅ FIXED

TC-022 satisfied: `PipelineDepsBuilder.buildDeps()` in types.ts returns `PipelineDeps`. `runtime-strategy.ts` has no `buildDeps` at all.

### [14] `e44e50cc` — TC-T15-05 does not prove compile-time invariant — ✅ FIXED

TC-T15-05 (lines 346–359) now uses `const fake: Pick<PipelineDepsBuilder, "buildDeps">` and calls `fake.buildDeps(...)` — this actually exercises the domain interface (PipelineDepsBuilder), proving the typed return without cast.

### [15] `15eeb57f` — Stale runtimeStrategy: undefined in test fixtures (duplicate of [11]) — ✅ FIXED

Same as [11]. No `runtimeStrategy: undefined` in test fixture source files.

### [16] `0bbb2081` — buildDeps returns unknown and as PipelineDeps cast remains — ✅ FIXED

Same as [4]/[5]. Both resolved: buildDeps returns PipelineDeps via PipelineDepsBuilder, cast eliminated.

### [17] `f325fc3f` — Architecture doc claims buildDeps() returns PipelineDeps but interface returns unknown — ✅ FIXED

The original issue was "interface returns unknown, runner.ts requires cast." Now PipelineDepsBuilder.buildDeps() returns PipelineDeps (typed), no cast in runner.ts. The underlying correctness issue is resolved.

### [18] `42e2e998` — TC-T15-05 title contradicts TC-021/TC-022 — ✅ FIXED

TC-T15-05 has been completely rewritten (lines 346–359). Title is now "PipelineDepsBuilder.buildDeps() returns PipelineDeps directly; no cast needed in domain code (T-18)". No reference to `unknown` return or `as PipelineDeps` cast.

### [19] `6c02fc17` — TC-008 prepareStepArtifacts ordering not pinned by spy — ✅ FIXED

TC-T15-06 (lines 228–286) uses a vi.fn() spy for `prepareStepArtifacts` and a shared `callOrder` array. Assertions at lines 284–285: `expect(callOrder[0]).toBe("prepareStepArtifacts")` and `expect(callOrder[1]).toBe("runner.run")`.

### [20] `0361ce52` — Stale runtimeStrategy references in step-types.ts/no-op-detect.ts — ✅ FIXED

Grep for `runtimeStrategy` in step-types.ts and no-op-detect.ts returns no results.

### [21] `dfe5963e` — makeTerminalStateSource fake wrong signature (local-runtime-capabilities.test.ts) — ✅ FIXED

local-runtime-capabilities.test.ts line 43: `async commitFinalState(_cwd: string, _slug: string, _state: JobState): Promise<void> {}` — correct three-parameter signature.

### [22] `8bfa5251` — makeTerminalStateSource fake wrong signature (duplicate of [21]) — ✅ FIXED

managed-runtime-capabilities.test.ts line 59: same correct signature `(_cwd: string, _slug: string, _state: JobState)`.

### [23] `d99ce9e8` — Stale runtimeStrategy field name in RecordFindingRecencyParams — ✅ FIXED

Grep for `runtimeStrategy` in finding-recency.ts, prior-round-context.ts, custom-reviewer-round-context.ts, post-fix-context.ts returns no results.

### [24] `efd2995e` — Test local variables named runtimeStrategy in parallel-review-round-invalidation.test.ts — ✅ FIXED

Grep for `runtimeStrategy` in parallel-review-round-invalidation.test.ts returns no results.

### [25] `b0910a21` — as never forced casts on roundGitEffects in parallel-review-round-git-effects.test.ts — ✅ FIXED

`makeRuntimeStrategy()` returns a properly structured object. Test sites use `roundGitEffects: runtimeStrategy` without `as never`. No `roundGitEffects.*never` or `runtimeStrategy.*never` patterns found.

### [26] `a039a195` — Architecture doc collaborator lists cite RuntimeStrategy after R2b — ✅ FIXED

components.md line 67: StepExecutor collaborators now list `StepArtifactLifecycleCapability（artifact finalize）/ StepIoValidationCapability（output gate）`. Line 73: CommitOrchestrator lists `RoundGitEffectsCapability（git seam）`. No `RuntimeStrategy` in these lists.

### [27] `c1117b7c` — Architecture doc references RuntimeStrategy.validateStepInputs/Outputs — ✅ FIXED

components.md lines 60, 66 now correctly reference `StepIoValidationCapability.validateStepInputs` and `validateStepOutputs` (via `deps.stepIo`), not `RuntimeStrategy.*`.

### [28] `a7219270` — Optional chaining on required terminalState at pipeline.ts:625 — ✅ FIXED

pipeline.ts line 625: `await deps.terminalState.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state);` — no `?.` on terminalState. Consistent with line 400.

### [29] `8a31005a` — Terminal publication breaks documented cwd fallback (pipeline.ts:399) — ✅ FIXED

pipeline.ts line 400: `await deps.terminalState.commitFinalState(deps.cwd ?? process.cwd(), ...)`. The `?? process.cwd()` fallback is present.

### [30] `290e6a63` — Terminal publication uses wrong cwd (local.ts:791) — ✅ FIXED

local.ts `commitFinalState(cwd: string, slug: string, state: JobState)` — cwd is a required string parameter supplied by callers with `deps.cwd ?? process.cwd()`. No instance-level cwd substitution.

### [31] `eda3048d` — Optional cwd causes terminal publication to be skipped — ✅ FIXED

All three terminal paths use `deps.cwd ?? process.cwd()`: pipeline.ts:400, pipeline.ts:625, runner.ts:323.

### [32] `5b1f4daf` — Optional cwd causes terminal publication to be skipped (duplicate of [31]) — ✅ FIXED

Same as [31]. The `?? process.cwd()` fallback is present at all call sites.

### [33] `3c0d794e` — Production-required safety capabilities can be injected as undefined — ✅ FIXED

types.ts lines 101, 110, 118, 127: `stepArtifact: StepArtifactLifecycleCapability`, `stepIo: StepIoValidationCapability`, `terminalState: TerminalStateCapability`, `roundGitEffects: RoundGitEffectsCapability` — all required non-nullable fields. Comments confirm "Required non-nullable field."

### [34] `b8d2f45f` — Per-build artifact capability resolves ledger persistence through mutable last workspace state — ✅ FIXED

local.ts `buildStepArtifactCapability()` (line 659) captures `capturedSlugOpts` at construction time from the `buildDeps` parameters (lines 668–670). Comment at line 651 confirms: "This prevents job A's capability from reading job B's mutable workspace/store context."

### [35] `9ae34775` — Main-checkout drift guard remains optional inside required capability — ✅ FIXED

step-capability.ts lines 82–85: `snapshotMainCheckoutGuard(cwd: string, config: SpecRunnerConfig): Promise<MainCheckoutGuardSnapshot | null>;` — required method (no `?`). Comment: "Required: null return means guard unavailable."

### [36] `a6c0413c` — Typed buildDeps violates ports→domain DSM via new allowlist — ✅ FIXED

`buildDeps()` moved to `PipelineDepsBuilder` in `types.ts` (domain layer). `runtime-strategy.ts` imports only from `../../state/artifact-types.js` — no import from `../types.js`. No new DSM allowlist exemption needed.

### [37] `e473aa28` — Use-case consumers still receive full PipelineDeps — ✅ FIXED

- `StepExecutor.produceResult()` uses `StepExecutionDeps` (Pick<PipelineDeps, ...>)
- `ParallelReviewRound.run()` uses `ParallelReviewRoundDeps` (Pick<PipelineDeps, ...>)  
- `Pipeline` methods use `PipelineOrchestrationDeps` (Pick<PipelineDeps, ...>)
All three composite types defined in types.ts as narrowed Pick subsets.

---

## Evidence Summary

- **Checked**: 37 findings
- **Regressions**: 0
- **Skipped**: 0
