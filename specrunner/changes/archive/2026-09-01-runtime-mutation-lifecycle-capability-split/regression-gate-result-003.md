# Regression Gate Result — Iteration 3

**Date**: 2026-08-30
**Branch**: refactor/runtime-mutation-lifecycle-capability-split-71d6a83e
**Ledger size**: 16 findings

## Summary

All 16 ledger findings have been resolved. No regressions detected.

---

## Finding-by-Finding Evidence

### [1] `8b83c284` — spec.md exception clause for snapshotMainCheckoutGuard
**Status**: FIXED

`spec.md:108–110` now reads:
> All methods in a capability interface SHALL be required (no `?` modifier). … **Exception**: `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` SHALL be the sole optional method (`?` modifier is permitted).

The exception clause is present; no contradiction with TC-004.

---

### [2] `e78bf761` — T-09 double `?.` on required method
**Status**: FIXED

`tasks.md:204` now explicitly notes: *"only a single `?.` is needed because `verifyFindingRefs` is a required method on `StepIoValidationCapability` (no second `?.` on the method itself)."*

---

### [3] `593fb7ec` — T-06 derive helper file placement
**Status**: FIXED

`tasks.md:139` now reads: *"Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`."* File targets (`step-capability.ts` / `pipeline-capability.ts`) are explicit.

---

### [4] `b1e9a036` — buildDeps returns `unknown` in RuntimeStrategy port
**Status**: FIXED

`src/core/port/runtime-strategy.ts:391–396`:
```typescript
buildDeps(
  config: SpecRunnerConfig,
  request: ParsedRequest,
  slug: string,
  workspace: WorkspaceContext,
): PipelineDeps;
```
Return type is `PipelineDeps`, not `unknown`.

---

### [5] `964864b9` — `as PipelineDeps` cast in runner.ts:222
**Status**: FIXED

`src/core/command/runner.ts:222`:
```typescript
deps = this.runtime.buildDeps(config, request, slug, workspace);
```
No cast present.

---

### [6] `66311801` — RoundGitEffectsCapability optional methods
**Status**: FIXED

`src/core/pipeline/pipeline-capability.ts:94,110,127`:
- `listWorktreeChanges(cwd: string): Promise<WorktreeInspectionResult>;` — no `?`
- `commitRoundArtifacts(...): Promise<void>;` — no `?`
- `digestArtifacts(...): Promise<ArtifactRef[]>;` — no `?`

All three methods are now required per D6.

---

### [7] `e2856da5` — Duplicate of [4]
**Status**: FIXED (same evidence as [4])

---

### [8] `2ab85cb8` — Duplicate of [5]
**Status**: FIXED (same evidence as [5])

---

### [9] `2afc3a56` — `_latestBuiltDeps` side-channel and missing `pushCapability`
**Status**: FIXED

- `src/core/runtime/local.ts:155–159`: Comment confirms `_latestBuiltDeps` is replaced by `_currentConfig` / `_currentRequest`; the field is absent.
- `src/core/step/commit-push.ts:95`: `CommitPushInfra` now declares `pushCapability?: PushCapability | null`.
- `commit-push.ts:528–545`: `pushCapability` is read from `infra.pushCapability`, not from a cached deps reference.

---

### [10] `2676babe` — Duplicate of [6]
**Status**: FIXED (same evidence as [6])

---

### [11] `f9cadb4a` — Stale `runtimeStrategy: undefined` in named test fixtures
**Status**: FIXED

Searched all four specifically named files:
- `src/core/pipeline/__tests__/iteration-display.test.ts` — no `runtimeStrategy: undefined` present
- `src/core/pipeline/__tests__/pipeline-one-shot-resume.test.ts` — no match
- `src/core/step/__tests__/spec-review-fixer-routing.test.ts` — no `runtimeStrategy: undefined` (only a comment)
- `tests/unit/absorb-build-fixer/implementer-recovery.test.ts` — no match

---

### [12] `c759649a` — Duplicate of [5]
**Status**: FIXED (same evidence as [5])

---

### [13] `3cd30b91` — Duplicate of [4]
**Status**: FIXED (same evidence as [4])

---

### [14] `e44e50cc` — TC-T15-05 compile-time proof via port interface
**Status**: FIXED

`tests/unit/step/executor-lifecycle-ordering.test.ts:265–277`:
```typescript
const fake: Pick<RuntimeStrategy, "buildDeps"> = {
  buildDeps: () => makeBaseDeps(),
};
const deps: PipelineDeps = fake.buildDeps({} as never, {} as never, "", {} as never);
```
The test now calls through a `RuntimeStrategy`-typed interface; if `buildDeps` returned `unknown`, this assignment would be a compile error.

---

### [15] `15eeb57f` — Duplicate of [11]
**Status**: FIXED (same evidence as [11])

---

### [16] `8a31005a` — Terminal publication cwd fallback
**Status**: FIXED

`src/core/pipeline/pipeline.ts:399,623`:
```typescript
await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state);
```
Both `commitFinalState` call sites use `deps.cwd ?? process.cwd()`, restoring the documented fallback.

---

## Evidence Summary

| Checked | Skipped | Unverified |
|---------|---------|------------|
| 16      | 0       | 0          |
