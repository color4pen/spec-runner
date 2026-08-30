# Regression Gate Result — Iteration 6

## Summary

All 22 ledger findings were verified against the current branch code. No regressions detected.

---

## Evidence

### [1] `8b83c284` — spec.md snapshotMainCheckoutGuard exception — FIXED
`spec.md:108–110` now explicitly adds the exception clause: "Exception: `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` SHALL be the sole optional method (`?` modifier is permitted)."  Verified at line 110.

### [2] `e78bf761` — T-09 double `?.` on verifyFindingRefs — FIXED
`tasks.md:204` now reads: "Note: only a single `?.` is needed because `verifyFindingRefs` is a required method on `StepIoValidationCapability` (no second `?.` on the method itself)." Correct single-`?.` pattern documented.

### [3] `593fb7ec` — T-06 derive helper location not explicit — FIXED
`tasks.md` T-06 now reads: "Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`." Specific file placements are enumerated.

### [4] `b1e9a036` — buildDeps returns unknown in RuntimeStrategy — FIXED
`src/core/port/runtime-strategy.ts:400` declares `): PipelineDeps;` and line 36 has `import type { PipelineDeps }`. No `unknown` return type.

### [5] `964864b9` — `as PipelineDeps` cast in runner.ts:222 — FIXED
`src/core/command/runner.ts:222` reads `deps = this.runtime.buildDeps(config, request, slug, workspace);` — no cast present.

### [6] `66311801` — RoundGitEffectsCapability optional methods — FIXED
`src/core/pipeline/pipeline-capability.ts:96,112,129`: `listWorktreeChanges`, `commitRoundArtifacts`, `digestArtifacts` are all required (no `?` modifier). JSDoc confirms "Required — D6".

### [7] `e2856da5` — RuntimeStrategy.buildDeps returns unknown — FIXED
Same as [4]: interface declares `): PipelineDeps;` with type-only import.

### [8] `2ab85cb8` — `as PipelineDeps` cast at runner.ts:222 — FIXED
Same as [5]: no cast in runner.ts.

### [9] `2afc3a56` — `_latestBuiltDeps` side-channel and CommitPushInfra without pushCapability — FIXED
`src/core/runtime/local.ts`: grep for `_latestBuiltDeps` returns only a comment reference ("R2b: _latestBuiltDeps is replaced"). The field is not assigned or read. `src/core/step/commit-push.ts:95`: `pushCapability?: PushCapability | null` is present on `CommitPushInfra`.

### [10] `2676babe` — RoundGitEffectsCapability optional methods — FIXED
Same as [6]: all three methods are required in the interface.

### [11] `f9cadb4a` — Stale runtimeStrategy: undefined in iteration-display.test.ts — FIXED
Grep for `runtimeStrategy: undefined` in `src/core/pipeline/__tests__/iteration-display.test.ts` returns no results. Same for pipeline-one-shot-resume.test.ts, spec-review-fixer-routing.test.ts, implementer-recovery.test.ts.

### [12] `c759649a` — `as PipelineDeps` cast — FIXED
Same as [5].

### [13] `3cd30b91` — RuntimeStrategy.buildDeps returns unknown — FIXED
Same as [4].

### [14] `e44e50cc` — TC-T15-05 not proving compile-time invariant — FIXED
`tests/unit/step/executor-lifecycle-ordering.test.ts:341`: test now creates `const fake: Pick<RuntimeStrategy, "buildDeps"> = { buildDeps: () => makeBaseDeps() }` and calls `fake.buildDeps(...)`. This calls through the port interface, proving the return type is `PipelineDeps` without a cast.

### [15] `15eeb57f` — Stale runtimeStrategy: undefined in test fixtures — FIXED
Same as [11]: no such references in the named files.

### [16] `0bbb2081` — buildDeps returns unknown, as PipelineDeps cast — FIXED
Same as [4] and [5].

### [17] `f325fc3f` — architecture/components.md incorrect about buildDeps — FIXED
`architecture/components.md:175` now states: "`RuntimeStrategy` インターフェース自体が `buildDeps(): PipelineDeps` を宣言する" — correctly representing the interface (not just concrete implementations).

### [18] `42e2e998` — TC-T15-05 title contradicts TC-021/TC-022 — FIXED
`tests/unit/step/executor-lifecycle-ordering.test.ts:341`: test title now reads "RuntimeStrategy.buildDeps() returns PipelineDeps directly; no cast needed in domain code (DSM §3 via allowlist)". Comment block describes correct new behavior.

### [19] `6c02fc17` — TC-008 ordering not pinned by spy test — FIXED
`tests/unit/step/executor-lifecycle-ordering.test.ts:222` (TC-T15-06): test uses `vi.fn()` spy with a `callOrder: string[]` counter. Asserts `callOrder[0] === "prepareStepArtifacts"` and `callOrder[1] === "runner.run"`.

### [20] `0361ce52` — Stale runtimeStrategy references in step-types.ts — FIXED
Grep for `runtimeStrategy` in `src/core/port/step-types.ts` returns no results. `src/core/step/no-op-detect.ts` uses `changedFiles: ChangedFilesCapability` (not runtimeStrategy) at line 36.

### [21] `8a31005a` — Terminal publication cwd fallback broken in pipeline.ts — FIXED
`src/core/pipeline/pipeline.ts:399,623`: both calls use `deps.terminalState?.commitFinalState(deps.cwd, deps.slug, state)` — passing `deps.cwd` (which is `string | undefined`). `TerminalStateCapability.commitFinalState` signature accepts `cwd: string | undefined`.

### [22] `290e6a63` — Terminal publication cwd fallback in local.ts — FIXED
`src/core/runtime/local.ts:790`: `async commitFinalState(cwd: string | undefined, slug: string, state: JobState)` with `const effectiveCwd = cwd ?? this.cwd;`. Undefined `cwd` properly falls back to `this.cwd`.

---

## Verdict

No regressions detected. All 22 findings are resolved in the current code.
