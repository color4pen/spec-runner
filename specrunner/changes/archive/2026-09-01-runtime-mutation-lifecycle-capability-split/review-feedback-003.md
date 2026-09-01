# Code Review Feedback — runtime-mutation-lifecycle-capability-split — Iteration 3

## Scope

Reviewing `src/core/`, `tests/`, and `architecture/` changes on branch
`refactor/runtime-mutation-lifecycle-capability-split-71d6a83e` against
the spec (`design.md`, `tasks.md`, `test-cases.md`) and Acceptance Criteria
in `request.md`.

---

## Summary

The implementation correctly delivers the core goal: all four mutation/lifecycle
capability interfaces (`StepArtifactLifecycleCapability`, `StepIoValidationCapability`,
`TerminalStateCapability`, `RoundGitEffectsCapability`) are defined in consumer-owned
files, wired via `buildDeps()`, and consumed through `PipelineDeps` capability fields.
The target `unknown` casts and `as PipelineDeps` / `as CommitPushInfra` casts at the
four focus signatures are removed. Verification is green (build / typecheck / test /
lint all pass).

One low-severity structural cleanup issue is identified: stale `runtimeStrategy: undefined`
entries survive in test fixtures. These are suppressed by `as PipelineDeps` casts so they
do not cause compile or runtime failures, but they are misleading and technically contradict
TC-024's requirement that the field be absent.

---

## Evidence Checked

| Item | Status |
|---|---|
| `buildDeps` returns `PipelineDeps` (no cast in `runner.ts`) | ✅ Confirmed |
| `finalizeStepArtifacts` signature: typed `AgentStep`, `CommitPushInfra` (no `unknown`) | ✅ Confirmed |
| `commitFinalState` signature: typed `(cwd, slug, state)` on capability | ✅ Confirmed |
| `commitRoundArtifacts` signature: typed `RoundEgressParams` DTO (no `unknown`) | ✅ Confirmed |
| `PipelineDeps.runtimeStrategy` field removed from `types.ts` | ✅ Confirmed |
| All capability methods required (no `?` except `snapshotMainCheckoutGuard`) | ✅ Confirmed |
| Capability absence expressed via `field | undefined`, not optional methods | ✅ Confirmed |
| `executor.ts` uses `deps.stepArtifact` / `deps.stepIo` (no `deps.runtimeStrategy`) | ✅ Confirmed |
| `pipeline.ts` uses `deps.terminalState?.commitFinalState` (no `deps.runtimeStrategy`) | ✅ Confirmed |
| `parallel-review-round.ts` uses `deps.roundGitEffects` (no `deps.runtimeStrategy`) | ✅ Confirmed |
| `runner.ts` `commitFinalState` call uses `deps.terminalState?.commitFinalState(deps.cwd ?? "", deps.slug, ...)` | ✅ Confirmed |
| Derive helpers co-located with capability interfaces (D5) | ✅ Confirmed |
| LocalRuntime `buildDeps()` injects all 7 capability fields | ✅ Confirmed |
| ManagedRuntime `buildDeps()` injects all 7 capability fields | ✅ Confirmed |
| Contract tests for LocalRuntime (`local-runtime-capabilities.test.ts`) | ✅ Confirmed |
| Contract tests for ManagedRuntime (`managed-runtime-capabilities.test.ts`) | ✅ Confirmed |
| Lifecycle ordering tests (`executor-lifecycle-ordering.test.ts`) | ✅ Confirmed (TC-T15-01 through TC-T15-05) |
| `as unknown as RuntimeStrategy` count unchanged (0 new) | ✅ Confirmed (no new occurrences in src/) |
| Architecture docs updated for R2b | ✅ Confirmed (`architecture/components.md` §RuntimeStrategy updated) |
| R2a read-only capabilities not regressed to full facade | ✅ Confirmed |
| `roundOwnsGitEffects` guard suppresses `finalizeStepArtifacts` in parallel round | ✅ Confirmed |
| ManagedRuntime `listWorktreeChanges` returns `{ kind:"success", paths:[] }` | ✅ Confirmed |
| Verification result: green | ✅ Confirmed (build/typecheck/test/lint all pass) |

---

## Findings

### F-001: Stale `runtimeStrategy: undefined` entries survive in test fixtures

**Severity**: Low  
**Resolution**: Fixable  

Multiple test helper functions include `runtimeStrategy: undefined` in object literals that are cast `as PipelineDeps`. Since `PipelineDeps` no longer declares this field (R2b, TC-024), these properties are dead code that TypeScript silently ignores through the unsafe cast.

Affected locations:

| File | Line | Pattern |
|---|---|---|
| `src/core/pipeline/__tests__/iteration-display.test.ts` | 102 | `runtimeStrategy: undefined,` in `makeDeps()` helper |
| `src/core/pipeline/__tests__/pipeline-one-shot-resume.test.ts` | 95 | same pattern |
| `src/core/step/__tests__/spec-review-fixer-routing.test.ts` | 629, 713 | two fixture sites |
| `tests/unit/absorb-build-fixer/implementer-recovery.test.ts` | 96 | `makeTestDeps()` helper |

Note: references to `runtimeStrategy` as a **local parameter name** in
`prior-round-context.ts`, `post-fix-context.ts`, `custom-reviewer-round-context.ts`,
and `finding-recency.ts` are **not findings** — those parameters are typed
`CommitInspectionCapability | undefined` or `RevisionContentCapability | undefined`,
not `RuntimeStrategy`, and correctly forward R2a capabilities.

**Impact**: No functional impact (tests pass; the field is ignored at runtime). However,
a future reader who sees `runtimeStrategy: undefined` in a `PipelineDeps` fixture could
incorrectly infer the field still exists, undermining the goal of TC-024 ("runtimeStrategy
field absent from PipelineDeps"). The `as PipelineDeps` cast used in these fixtures
suppresses the structural error that would otherwise surface this stale reference.

**Fix**: Remove `runtimeStrategy: undefined` from each affected fixture. The cast
`as PipelineDeps` may still be needed for other missing required fields; the `runtimeStrategy`
property alone can be deleted from each object literal.

---

### F-002 (Observation): Stale comment in `src/core/port/step-types.ts`

**Severity**: Low (observation, no code change required)

Line 63 of `src/core/port/step-types.ts` reads:

```
 * runtimeStrategy is optional — provided at runtime by PipelineDeps; may be absent in tests.
```

This comment appears on the `CliStepDeps` interface JSDoc. Since `runtimeStrategy` no longer
exists in `PipelineDeps`, the comment is now misleading. It should be updated or removed.

This does not affect any behavior and is recorded as an observation only.

---

## 検証した項目

- **Capability interface design**: All four new interfaces (`StepArtifactLifecycleCapability`,
  `StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability`) have
  required methods. `snapshotMainCheckoutGuard?` is correctly the sole optional method on
  `StepArtifactLifecycleCapability` per D6/TC-004.

- **No new mega-interface**: The split produces four focused interfaces in two files
  (`step-capability.ts` / `pipeline-capability.ts`), not a single large replacement.

- **`PipelineDeps` restructuring**: `runtimeStrategy` field is absent from `types.ts`.
  Seven typed capability fields (`stepArtifact`, `stepIo`, `terminalState`, `roundGitEffects`,
  `changedFiles`, `commitInspection`, `revisionContent`) are present.

- **Derive helper co-location (D5)**: `deriveStepArtifactLifecycleCapability` /
  `deriveStepIoValidationCapability` live in `step-capability.ts`; `deriveTerminalStateCapability` /
  `deriveRoundGitEffectsCapability` live in `pipeline-capability.ts`. Pattern consistent with R2a.

- **Command lifecycle ordering**: `deps = this.runtime.buildDeps(...)` in `runner.ts` is
  a direct assignment to `PipelineDeps` — no cast. `terminalState?.commitFinalState` in
  `runner.ts` receives `(deps.cwd ?? "", deps.slug, haltState)`.

- **Step finalize lifecycle**: `roundOwnsGitEffects` gate in `executor.ts` correctly
  suppresses `finalizeStepArtifacts` for coordinator-round members. Sequential steps
  continue to call `deps.stepArtifact.finalizeStepArtifacts(step, state, cwd, slug, ...)`.

- **ManagedRuntime no-op preservation**: All four capability methods on `ManagedRuntime`
  are no-ops with correct return types (`null`, `{ kind:"success", paths:[] }`, etc.).

- **Architecture document**: `components.md` §RuntimeStrategy now explicitly describes R2b
  (mutation/lifecycle consumer capabilities, `PipelineDeps` as capability set not service
  locator, Local/Managed differences confined to concrete runtimes).

---

## 検証できなかった項目

なし。本レビューで対象とした全ての acceptance criteria はソースコード・テストコード・verification-result.md の証跡を元に確認した。

---

## Acceptance Criteria Pass/Fail

| AC | Status |
|---|---|
| Target consumers do not require full `RuntimeStrategy` facade | ✅ Pass |
| `PipelineDeps` does not hold full runtime facade for mutation consumers | ✅ Pass |
| Capabilities are use-case-specific minimum contracts | ✅ Pass |
| Capability methods required; absence via injection value | ✅ Pass |
| `buildDeps` / `finalizeStepArtifacts` / `commitFinalState` / `commitRoundArtifacts` have no domain-payload `unknown` | ✅ Pass |
| Target casts (`as PipelineDeps`, `as CommitPushInfra`, egress restore) removed | ✅ Pass |
| No new `as unknown as RuntimeStrategy` or equivalent forced cast | ✅ Pass |
| R2a read-only consumers not regressed to full facade | ✅ Pass |
| Command / step / terminal / round lifecycle ordering and failure boundaries executable | ✅ Pass |
| Local/Managed capability contract tests present | ✅ Pass |
| Architecture document consistent with implementation | ✅ Pass |
| SpecRunner verification green | ✅ Pass |
| Only changed files committed, no out-of-scope untracked files | ✅ Pass (94 files — all in scope) |
