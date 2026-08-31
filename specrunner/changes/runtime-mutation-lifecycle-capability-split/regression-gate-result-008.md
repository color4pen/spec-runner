# Regression Gate Result — Iteration 8

**Change**: runtime-mutation-lifecycle-capability-split  
**Date**: 2026-08-31  
**Ledger items**: 25  

---

## Summary

All 25 ledger findings verified. **No regressions detected.**

---

## Evidence

### [1] `8b83c284` — spec.md snapshotMainCheckoutGuard exception

**Status: FIXED**  
`spec.md:110` now includes an explicit **Exception** clause: `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard SHALL be the sole optional method`. The contradiction between the blanket "all methods required" rule and the TC-004 / tasks.md T-02 example is resolved.

---

### [2] `e78bf761` — T-09 double `?.` on verifyFindingRefs

**Status: FIXED**  
`tasks.md:204` now reads: `deps.stepIo?.verifyFindingRefs(...) ?? []` with an inline note "only a single `?.` is needed because `verifyFindingRefs` is a required method on `StepIoValidationCapability` (no second `?.` on the method itself)."

---

### [3] `593fb7ec` — T-06 derive helper file not specified

**Status: FIXED**  
`tasks.md:139` now explicitly states: "Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`. Import the helpers into `local.ts`." Each derive function now maps to its destination file (`step-capability.ts` or `pipeline-capability.ts`).

---

### [4] `b1e9a036` — buildDeps returns `unknown` in port interface

**Status: FIXED**  
`src/core/port/runtime-strategy.ts:400` now declares `buildDeps(...): PipelineDeps`. The `import type { PipelineDeps }` at line 36 is type-only (compile-time erased). The comment at lines 325–328 correctly describes the DSM §3 allowlist entry.

---

### [5] `964864b9` — `as PipelineDeps` cast in runner.ts:222

**Status: FIXED**  
`src/core/command/runner.ts:222` now reads `deps = this.runtime.buildDeps(config, request, slug, workspace);` — no `as PipelineDeps` cast. Confirmed by `grep -n "as PipelineDeps" src/core/command/runner.ts` returning no matches.

---

### [6] `66311801` — RoundGitEffectsCapability optional methods violating D6

**Status: FIXED**  
`src/core/pipeline/pipeline-capability.ts:95`, `:111`, `:128` — `listWorktreeChanges`, `commitRoundArtifacts`, `digestArtifacts` are all required (no `?`). `parallel-review-round.ts` uses field-presence checks (`if (deps.roundGitEffects)`) followed by direct method calls without `?.`.

---

### [7] `e2856da5` — RuntimeStrategy.buildDeps returns `unknown` (duplicate of [4])

**Status: FIXED** — same fix as [4].

---

### [8] `2ab85cb8` — `as PipelineDeps` cast in runner.ts:222 (duplicate of [5])

**Status: FIXED** — same fix as [5].

---

### [9] `2afc3a56` — `_latestBuiltDeps` side-channel / CommitPushInfra missing pushCapability

**Status: FIXED**  
`src/core/runtime/local.ts` — `_latestBuiltDeps` instance field is gone (only a comment at line 155 documents its removal). `src/core/step/commit-push.ts:95` declares `pushCapability?: PushCapability | null` on `CommitPushInfra`. The `finalizeStepArtifacts` path reads `infra.pushCapability` directly.

---

### [10] `2676babe` — RoundGitEffectsCapability optional methods (duplicate of [6])

**Status: FIXED** — same fix as [6].

---

### [11] `f9cadb4a` — Stale `runtimeStrategy: undefined` in test fixtures

**Status: FIXED**  
The four files cited in the finding no longer contain `runtimeStrategy: undefined`:
- `src/core/pipeline/__tests__/iteration-display.test.ts` — no match
- `src/core/pipeline/__tests__/pipeline-one-shot-resume.test.ts` — no match
- `src/core/step/__tests__/spec-review-fixer-routing.test.ts` — only a comment; no property assignment
- `tests/unit/absorb-build-fixer/implementer-recovery.test.ts` — no match

---

### [12] `c759649a` — `as PipelineDeps` cast present (duplicate of [5])

**Status: FIXED** — same fix as [5].

---

### [13] `3cd30b91` — RuntimeStrategy.buildDeps returns `unknown` (duplicate of [4])

**Status: FIXED** — same fix as [4].

---

### [14] `e44e50cc` — TC-T15-05 does not prove compile-time invariant

**Status: FIXED**  
`tests/unit/step/executor-lifecycle-ordering.test.ts:341-353` — TC-T15-05 now creates a `Pick<RuntimeStrategy, "buildDeps">` typed fake that calls through the port interface: `const deps = fake.buildDeps({} as never, {} as never, "", {} as never)`. The result is assigned without any cast, proving the port interface returns `PipelineDeps` directly.

---

### [15] `15eeb57f` — Stale `runtimeStrategy: undefined` entries (duplicate of [11])

**Status: FIXED** — same fix as [11].

---

### [16] `0bbb2081` — buildDeps returns `unknown` + `as PipelineDeps` cast (duplicate of [4]/[5])

**Status: FIXED** — same fixes as [4] and [5].

---

### [17] `f325fc3f` — architecture/components.md says buildDeps returns PipelineDeps but interface returns `unknown`

**Status: FIXED**  
`architecture/components.md:175` now correctly documents: "RuntimeStrategy インターフェース自体が `buildDeps(): PipelineDeps` を宣言する。`import type { PipelineDeps }` は type-only。呼び出し側の `runner.ts` は `as PipelineDeps` キャスト不要でそのまま受け取れる。"

---

### [18] `42e2e998` — TC-T15-05 title contradicts TC-021/TC-022

**Status: FIXED**  
`tests/unit/step/executor-lifecycle-ordering.test.ts:341` — test title is now "RuntimeStrategy.buildDeps() returns PipelineDeps directly; no cast needed in domain code (DSM §3 via allowlist)". The comment block explains the DSM §3 allowlist approach and that runner.ts no longer needs the cast, correctly aligning with TC-021 and TC-022.

---

### [19] `6c02fc17` — TC-008 prepareStepArtifacts ordering not pinned by spy test

**Status: FIXED**  
`tests/unit/step/executor-lifecycle-ordering.test.ts:222-279` — TC-T15-06 uses `vi.fn()` spies for both `prepareStepArtifacts` and `runner.run`. A shared `callOrder: string[]` array records call sequence. Test asserts `callOrder[0] === "prepareStepArtifacts"` and `callOrder[1] === "runner.run"`.

---

### [20] `0361ce52` — Stale runtimeStrategy comments in step-types.ts / no-op-detect.ts

**Status: FIXED**  
`grep -n "runtimeStrategy" src/core/port/step-types.ts` — no matches.  
`grep -n "runtimeStrategy" src/core/step/no-op-detect.ts` — no matches.

---

### [21] `dfe5963e` — TerminalStateCapability test fake wrong signature (local)

**Status: FIXED**  
`src/core/runtime/__tests__/local-runtime-capabilities.test.ts:43` now reads: `async commitFinalState(_cwd: string, _slug: string, _state: JobState): Promise<void> {}`. The `cwd` is `string` (not `string | undefined`), and the required `_state: JobState` parameter is present.

---

### [22] `8bfa5251` — makeTerminalStateSource wrong signature (managed, duplicate of [21])

**Status: FIXED**  
`src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:59` has the same corrected signature: `async commitFinalState(_cwd: string, _slug: string, _state: JobState): Promise<void> {}`.

---

### [23] `8a31005a` — Terminal publication breaks documented cwd fallback (pipeline.ts)

**Status: FIXED**  
`src/core/pipeline/pipeline.ts:399` and `:623` both now use `deps.cwd ?? process.cwd()` instead of an empty string. The backward-compatible fallback is restored.

---

### [24] `290e6a63` — Terminal publication violates cwd fallback (local.ts)

**Status: FIXED**  
`src/core/runtime/local.ts:790` declares `async commitFinalState(cwd: string, slug: string, state: JobState)`. The method takes `cwd` as an explicit `string` parameter (passed from the caller after applying the `?? process.cwd()` fallback in `pipeline.ts`). `LocalRuntime.cwd` is not used.

---

### [25] `eda3048d` — Optional cwd causes terminal publication to be skipped

**Status: FIXED**  
Same fix as [23] — both halt paths in `pipeline.ts` now pass `deps.cwd ?? process.cwd()`, ensuring `commitFinalState` is always called with a non-empty cwd.

---

## Checked: 25 / Skipped: 0 / Unverified: 0
