# Regression Gate Result — Iteration 014

## Summary

37 ledger findings verified. **1 regression found** (finding [28]).

---

## Verification Results

### [1] `8b83c284` — spec.md contradiction with optional snapshotMainCheckoutGuard — ✅ FIXED

**Evidence**: `spec.md` line 138 now explicitly states "All methods in a capability interface SHALL be required (no `?` modifier), `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` included: 'the check cannot be performed' SHALL be expressed by the method returning `null` (no-op implementations explicitly return `null`), never by omitting the method." `tasks.md` line 41 also states "No method in either interface is optional (`snapshotMainCheckoutGuard` included — null return expresses 'cannot check')". No contradiction with any test cases.

---

### [2] `e78bf761` — T-09 double `?.` on required verifyFindingRefs — ✅ FIXED

**Evidence**: `step-completion.ts` lines 256 and 274 use `deps.stepIo.verifyFindingRefs(...)` (no double `?.`). `tasks.md` line 204 was updated to note "only a single `?.` is needed because `verifyFindingRefs` is a required method on `StepIoValidationCapability`".

---

### [3] `593fb7ec` — T-06 derive helper definition location unspecified — ✅ FIXED

**Evidence**: `tasks.md` line 139 now explicitly states: "Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`." and lists the canonical location for each derive helper.

---

### [4] `b1e9a036` — buildDeps returns `unknown` in port interface — ✅ FIXED

**Evidence**: `runtime-strategy.ts` no longer declares `buildDeps` and has no import from `../types.js`. T-18 moved `buildDeps()` to `PipelineDepsBuilder` interface in `types.ts`, which returns `PipelineDeps` directly.

---

### [5] `964864b9` — `as PipelineDeps` cast in runner.ts:222 — ✅ FIXED

**Evidence**: `runner.ts` line 222 reads `deps = this.runtime.buildDeps(config, request, slug, workspace);` — no `as PipelineDeps` cast. Confirmed via grep returning no matches.

---

### [6] `66311801` — RoundGitEffectsCapability optional methods — ✅ FIXED

**Evidence**: `pipeline-capability.ts` lines 95, 111, 128 show `listWorktreeChanges`, `commitRoundArtifacts`, and `digestArtifacts` are all required (no `?` modifier). JSDoc comments state "Required — D6: all capability methods are required."

---

### [7] `e2856da5` — RuntimeStrategy.buildDeps port interface returns `unknown` — ✅ FIXED (same as [4])

---

### [8] `2ab85cb8` — `as PipelineDeps` cast in runner.ts:222 — ✅ FIXED (same as [5])

---

### [9] `2afc3a56` — `_latestBuiltDeps` not removed; CommitPushInfra missing pushCapability — ✅ FIXED

**Evidence**: `grep _latestBuiltDeps local.ts` returns no matches. `commit-push.ts` line 95: `pushCapability?: PushCapability | null` field present in `CommitPushInfra`.

---

### [10] `2676babe` — RoundGitEffectsCapability optional methods — ✅ FIXED (same as [6])

---

### [11] `f9cadb4a` — Stale `runtimeStrategy: undefined` in test fixtures — ✅ FIXED

**Evidence**: `grep -r "runtimeStrategy: undefined"` across `src/` and `tests/` returns no matches.

---

### [12] `c759649a` — `as PipelineDeps` cast in runner.ts:222 — ✅ FIXED (same as [5])

---

### [13] `3cd30b91` — RuntimeStrategy.buildDeps returns `unknown` — ✅ FIXED (same as [4])

---

### [14] `e44e50cc` — TC-T15-05 doesn't prove compile-time invariant — ✅ FIXED

**Evidence**: `executor-lifecycle-ordering.test.ts` lines 346-358 now test `PipelineDepsBuilder.buildDeps()` through the domain interface: `const fake: Pick<PipelineDepsBuilder, "buildDeps"> = { buildDeps: () => makeBaseDeps() }; const deps = fake.buildDeps(...)`. This correctly exercises the domain interface and verifies the return type without a cast.

---

### [15] `15eeb57f` — Stale `runtimeStrategy: undefined` in fixtures — ✅ FIXED (same as [11])

---

### [16] `0bbb2081` — buildDeps returns `unknown` and `as PipelineDeps` — ✅ FIXED (same as [4] and [5])

---

### [17] `f325fc3f` — Architecture doc says buildDeps returns PipelineDeps (typed) but RuntimeStrategy interface returns `unknown` — ✅ FIXED

**Evidence**: The `RuntimeStrategy` interface no longer declares `buildDeps` at all (T-18). `PipelineDepsBuilder` in `types.ts` declares `buildDeps(): PipelineDeps`. The original discrepancy (interface returns `unknown` while doc says typed, forcing `as PipelineDeps` in runner.ts) no longer exists. Note: components.md line 175 still attributes `buildDeps()` to `RuntimeStrategy` interface rather than `PipelineDepsBuilder`, but this is a different documentation debt from the original finding's stated problem.

---

### [18] `42e2e998` — TC-T15-05 title/comment contradicts TC-021/TC-022 — ✅ FIXED

**Evidence**: The test title at line 347 now reads "TC-T15-05: PipelineDepsBuilder.buildDeps() returns PipelineDeps directly; no cast needed in domain code (T-18)" — correctly describing T-18 semantics. No reference to `unknown` return type or required `as PipelineDeps` cast.

---

### [19] `6c02fc17` — TC-008 ordering test not pinned by spy — ✅ FIXED

**Evidence**: `executor-lifecycle-ordering.test.ts` lines 228-286 contain TC-T15-06 which uses `vi.fn()` spies and a shared `callOrder: string[]` array to verify `prepareStepArtifacts` is called before `runner.run()`. Line 284: `expect(callOrder[0]).toBe("prepareStepArtifacts")`.

---

### [20] `0361ce52` — Stale `runtimeStrategy` in step-types.ts comments — ✅ FIXED

**Evidence**: `grep "runtimeStrategy"` in `step-types.ts` returns no matches. Same for `no-op-detect.ts`.

---

### [21] `dfe5963e` — TerminalStateCapability test fake wrong signature — ✅ FIXED

**Evidence**: `local-runtime-capabilities.test.ts` line 43: `async commitFinalState(_cwd: string, _slug: string, _state: JobState): Promise<void> {}` — correct signature with all three required parameters.

---

### [22] `8bfa5251` — makeTerminalStateSource wrong commitFinalState signature — ✅ FIXED (same as [21])

**Evidence**: `managed-runtime-capabilities.test.ts` line 59: `async commitFinalState(_cwd: string, _slug: string, _state: JobState): Promise<void> {}` — correct signature.

---

### [23] `d99ce9e8` — Stale `runtimeStrategy` field name in finding-recency.ts — ✅ FIXED

**Evidence**: `grep "runtimeStrategy"` in `finding-recency.ts` returns no matches.

---

### [24] `efd2995e` — Test local variables named `runtimeStrategy` for RoundGitEffectsCapability — ✅ FIXED

**Evidence**: `grep "runtimeStrategy"` in `parallel-review-round-invalidation.test.ts` returns no matches.

---

### [25] `b0910a21` — `as never` forced casts on `roundGitEffects` — ✅ FIXED

**Evidence**: `parallel-review-round-git-effects.test.ts` line 221: `roundGitEffects: runtimeStrategy` — no `as never` cast. `makeRuntimeStrategy()` at line 140-161 returns an object containing only `RoundGitEffectsCapability` methods (captureHeadSha, listChangedFiles, digestArtifacts, listWorktreeChanges, commitRoundArtifacts) with no extraneous methods. The function return type is inferred structurally as matching `RoundGitEffectsCapability`.

---

### [26] `a039a195` — StepExecutor/CommitOrchestrator collaborators cite RuntimeStrategy — ✅ FIXED

**Evidence**: `components.md` line 67 (StepExecutor 協調): "AgentRunner（port）/ Step / CommitOrchestrator（永続）/ EventBus / StepArtifactLifecycleCapability（artifact finalize）/ StepIoValidationCapability（output gate）". Line 73 (CommitOrchestrator 協調): "StepExecutor / ParallelReviewRound（producer）/ JobStateStore（永続）/ RoundGitEffectsCapability（git seam）/ CommitInspectionCapability（commit inspection）/ EventBus". Neither references `RuntimeStrategy` as a collaborator.

---

### [27] `c1117b7c` — components.md references RuntimeStrategy.validateStepInputs/validateStepOutputs — ✅ FIXED

**Evidence**: `components.md` line 60: "reads の required 入力は StepExecutor が実行前に `StepIoValidationCapability.validateStepInputs`（`deps.stepIo` 経由）で存在を検証". Line 66: "`writes()` 宣言 + `outputContracts()` を `StepIoValidationCapability.validateStepOutputs`（`deps.stepIo` 経由）に渡して検証". Both now correctly reference `StepIoValidationCapability`.

---

### [28] `a7219270` — Optional chaining on required `terminalState` field at pipeline.ts:625 — ❌ REGRESSION

**Evidence**: `pipeline.ts` line 625: `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state);`

`PipelineOrchestrationDeps.terminalState` is a required non-nullable field (inherited from `PipelineDeps.terminalState: TerminalStateCapability` — no `?` modifier, `types.ts` line 118). The `?.` optional chain is redundant and contradicts D6 ("capability absence expressed by injection value, not optional chaining on required methods"). Compare with line 400 in the same file which correctly calls `deps.terminalState.commitFinalState(...)` without `?.`. This creates asymmetry within the same file and reader confusion about whether `terminalState` can be absent at runtime. The fix is to remove `?` from the call at line 625.

---

### [29] `8a31005a` — Terminal publication breaks the cwd fallback — ✅ FIXED

**Evidence**: `pipeline.ts` line 400: `await deps.terminalState.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state);` — `process.cwd()` fallback present. `runner.ts` line 323: same pattern. `local.ts` `commitFinalState(cwd: string, ...)` receives typed `cwd` from the caller.

---

### [30] `290e6a63` — Terminal publication still violates cwd fallback — ✅ FIXED

**Evidence**: `local.ts` `commitFinalState` receives `cwd: string` (not `string | undefined`) from `pipeline.ts`/`runner.ts` call sites, both of which pass `deps.cwd ?? process.cwd()`.

---

### [31] `eda3048d` — Optional cwd causes terminal publication to be skipped — ✅ FIXED

**Evidence**: All three call sites in `pipeline.ts` (line 400) and `runner.ts` (line 323) use `deps.cwd ?? process.cwd()` fallback.

---

### [32] `5b1f4daf` — Optional cwd causes terminal publication to be skipped — ✅ FIXED (same as [31])

---

### [33] `3c0d794e` — Safety capabilities injectable as undefined — ✅ FIXED

**Evidence**: `types.ts` lines 101, 110, 118, 127: `stepArtifact: StepArtifactLifecycleCapability`, `stepIo: StepIoValidationCapability`, `terminalState: TerminalStateCapability`, `roundGitEffects: RoundGitEffectsCapability` — all required non-nullable fields (no `?` modifier).

---

### [34] `b8d2f45f` — Per-build artifact capability uses mutable last workspace state — ✅ FIXED

**Evidence**: `local.ts` comment at line 780-783: "capturedSlugOpts is the slugOpts snapshot taken at buildDeps() time, not from this.slugStoreOpts() at call time. This prevents job A's capability from reading job B's mutable workspace/store context." The `doFinalizeStepArtifacts` method at line 785 receives `capturedSlugOpts` as a parameter captured at capability construction time.

---

### [35] `9ae34775` — snapshotMainCheckoutGuard optional in required capability — ✅ FIXED

**Evidence**: `step-capability.ts` line 82: `snapshotMainCheckoutGuard(cwd: string, config: SpecRunnerConfig): Promise<MainCheckoutGuardSnapshot | null>;` — required method (no `?`). JSDoc at line 76-80 explains null return expresses "guard unavailable."

---

### [36] `a6c0413c` — DSM violation ports→domain import in runtime-strategy.ts — ✅ FIXED

**Evidence**: `runtime-strategy.ts` imports: only `import type { AgentRunner }`, `import type { SpecRunnerConfig }`, `import type { JobState, RequestInfo, RepositoryInfo }`, `import type { ArtifactRef }`, `import type { OutputContract, OutputCheckResult }`. No import from `../types.js`. No entry for `runtime-strategy.ts` in `arch-allowlist.ts`.

---

### [37] `e473aa28` — Consumers still receive full PipelineDeps — ✅ FIXED

**Evidence**: `executor.ts` `produceResult` at line 131: `deps: StepExecutionDeps`. `ParallelReviewRound` uses `ParallelReviewRoundDeps`. `Pipeline.run` at line 139: `deps: PipelineOrchestrationDeps`. All three consumer-owned composite deps types are Pick<PipelineDeps, ...> narrowing to only the fields each consumer reads.

---

## Evidence Summary

| # | Ref | Severity | File | Status |
|---|-----|----------|------|--------|
| 1 | `8b83c284` | MEDIUM | spec.md:108 | ✅ Fixed |
| 2 | `e78bf761` | LOW | tasks.md:204 | ✅ Fixed |
| 3 | `593fb7ec` | LOW | tasks.md:139 | ✅ Fixed |
| 4 | `b1e9a036` | HIGH | runtime-strategy.ts:394 | ✅ Fixed |
| 5 | `964864b9` | HIGH | runner.ts:222 | ✅ Fixed |
| 6 | `66311801` | MEDIUM | pipeline-capability.ts:92 | ✅ Fixed |
| 7 | `e2856da5` | HIGH | runtime-strategy.ts:394 | ✅ Fixed |
| 8 | `2ab85cb8` | HIGH | runner.ts:222 | ✅ Fixed |
| 9 | `2afc3a56` | HIGH | local.ts:161 | ✅ Fixed |
| 10 | `2676babe` | MEDIUM | pipeline-capability.ts:92 | ✅ Fixed |
| 11 | `f9cadb4a` | LOW | iteration-display.test.ts:102 | ✅ Fixed |
| 12 | `c759649a` | HIGH | runner.ts:222 | ✅ Fixed |
| 13 | `3cd30b91` | HIGH | runtime-strategy.ts:21 | ✅ Fixed |
| 14 | `e44e50cc` | MEDIUM | executor-lifecycle-ordering.test.ts:260 | ✅ Fixed |
| 15 | `15eeb57f` | LOW | iteration-display.test.ts:102 | ✅ Fixed |
| 16 | `0bbb2081` | HIGH | runtime-strategy.ts:388 | ✅ Fixed |
| 17 | `f325fc3f` | MEDIUM | architecture/components.md:175 | ✅ Fixed |
| 18 | `42e2e998` | MEDIUM | executor-lifecycle-ordering.test.ts:267 | ✅ Fixed |
| 19 | `6c02fc17` | MEDIUM | executor-lifecycle-ordering.test.ts:130 | ✅ Fixed |
| 20 | `0361ce52` | LOW | step-types.ts:63 | ✅ Fixed |
| 21 | `dfe5963e` | LOW | local-runtime-capabilities.test.ts:42 | ✅ Fixed |
| 22 | `8bfa5251` | LOW | local-runtime-capabilities.test.ts:42 | ✅ Fixed |
| 23 | `d99ce9e8` | LOW | finding-recency.ts:226 | ✅ Fixed |
| 24 | `efd2995e` | LOW | parallel-review-round-invalidation.test.ts:214 | ✅ Fixed |
| 25 | `b0910a21` | MEDIUM | parallel-review-round-git-effects.test.ts:219 | ✅ Fixed |
| 26 | `a039a195` | LOW | architecture/components.md:67 | ✅ Fixed |
| 27 | `c1117b7c` | MEDIUM | architecture/components.md:60 | ✅ Fixed |
| 28 | `a7219270` | LOW | pipeline.ts:625 | ❌ **REGRESSION** |
| 29 | `8a31005a` | MEDIUM | pipeline.ts:399 | ✅ Fixed |
| 30 | `290e6a63` | MEDIUM | local.ts:791 | ✅ Fixed |
| 31 | `eda3048d` | MEDIUM | pipeline.ts:399 | ✅ Fixed |
| 32 | `5b1f4daf` | MEDIUM | pipeline.ts:400 | ✅ Fixed |
| 33 | `3c0d794e` | HIGH | types.ts:97 | ✅ Fixed |
| 34 | `b8d2f45f` | MEDIUM | local.ts:781 | ✅ Fixed |
| 35 | `9ae34775` | HIGH | step-capability.ts:81 | ✅ Fixed |
| 36 | `a6c0413c` | HIGH | runtime-strategy.ts:36 | ✅ Fixed |
| 37 | `e473aa28` | MEDIUM | executor.ts:131 | ✅ Fixed |
