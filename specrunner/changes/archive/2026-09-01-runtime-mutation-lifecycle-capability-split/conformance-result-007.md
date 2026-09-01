# Conformance Result — runtime-mutation-lifecycle-capability-split — Iteration 7

## Evidence Summary

### Files Reviewed

- `src/core/port/runtime-strategy.ts` (port interface, capability definitions, `buildDeps` return type)
- `src/core/types.ts` (`PipelineDeps` — `runtimeStrategy` field removed, 7 capability fields added)
- `src/core/step/step-capability.ts` (new: `StepArtifactLifecycleCapability`, `StepIoValidationCapability`, derive helpers)
- `src/core/pipeline/pipeline-capability.ts` (new: `TerminalStateCapability`, `RoundGitEffectsCapability`, `RoundEgressParams`, derive helpers)
- `src/core/runtime/local.ts` (`buildDeps` injection, typed `finalizeStepArtifacts`/`commitFinalState`/`commitRoundArtifacts`)
- `src/core/runtime/managed.ts` (`buildDeps` injection, no-op typed signatures)
- `src/core/step/executor.ts` (uses `deps.stepArtifact`, `deps.stepIo`, `deps.changedFiles`)
- `src/core/pipeline/pipeline.ts` (uses `deps.terminalState?.commitFinalState(cwd, slug, state)`)
- `src/core/pipeline/parallel-review-round.ts` (uses `deps.roundGitEffects`)
- `src/core/command/runner.ts` (no `as PipelineDeps` cast; gate-halt uses `deps.terminalState`)
- `src/core/step/adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts` (accept `CommitInspectionCapability | undefined`)
- `src/core/step/step-context-builder.ts` (passes `deps.commitInspection` to `prepareRoundContext`)
- `src/core/step/commit-orchestrator.ts` (uses `deps.stepArtifact`, `deps.revisionContent`)
- `src/core/runtime/__tests__/local-runtime-capabilities.test.ts` (T-14 contract tests)
- `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts` (T-14 contract tests + TC-028)
- `tests/unit/step/executor-lifecycle-ordering.test.ts` (T-15 lifecycle ordering tests)
- `architecture/components.md` (R2b documentation)
- `specrunner/changes/runtime-mutation-lifecycle-capability-split/verification-result.md` (green: 831/831 tests)

---

## Normative Requirement Verification

### Spec: StepArtifactLifecycleCapability — typed parameters

**Status: PASS**

`src/core/step/step-capability.ts` defines `StepArtifactLifecycleCapability` with:
- `finalizeStepArtifacts(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra): Promise<void>` — no `unknown` at any parameter position.
- `snapshotMainCheckoutGuard?` is the sole optional method (fail-open semantics justified by spec exception clause).
- All other methods are required.

`StepExecutor.executor.ts` line 466: `if (!deps.stepArtifact) return;` — when `stepArtifact` is absent, `finalizeStepArtifacts` is not called.
`StepExecutor.executor.ts` line 467: `await deps.stepArtifact.finalizeStepArtifacts(step, stateForFinalize, cwd, deps.slug, headForFinalize, {...})` — typed `cwd: string`, `deps.slug: string`.

Scenario "skips finalize when capability is absent": line 466 guard covers this path. ✅
Scenario "finalizeStepArtifacts is called with typed parameters": line 467 confirms no cast. ✅

---

### Spec: TerminalStateCapability — typed parameters

**Status: PASS**

`src/core/pipeline/pipeline-capability.ts` defines:
```
commitFinalState(cwd: string, slug: string, state: JobState): Promise<void>
```

`pipeline.ts` line 399: `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)` — string primitives, no `deps` object forwarded. ✅
`pipeline.ts` line 623: same pattern. ✅
`runner.ts` line 322: `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, haltState)` — gate-halt path uses `terminalState`. ✅

---

### Spec: RoundGitEffectsCapability — typed parameters

**Status: PASS**

`src/core/pipeline/pipeline-capability.ts` defines:
```
commitRoundArtifacts(stagePaths: string[], cwd: string, branch: string, coordinatorName: string, slug: string, infra: CommitPushInfra, egressParams?: RoundEgressParams): Promise<void>
```
`RoundEgressParams` is a domain-neutral DTO (no `unknown`).

`parallel-review-round.ts` line 464: `await deps.roundGitEffects.commitRoundArtifacts(...)` with typed `infra: CommitPushInfra`. ✅
No `as CommitPushInfra` cast at the call site. ✅

---

### Spec: buildDeps returns typed PipelineDeps without cast

**Status: PASS**

`src/core/port/runtime-strategy.ts` line 395–400:
```ts
buildDeps(config: SpecRunnerConfig, request: ParsedRequest, slug: string, workspace: WorkspaceContext): PipelineDeps;
```
Return type is `PipelineDeps` (not `unknown`). ✅

`runner.ts` line 222: `deps = this.runtime.buildDeps(config, request, slug, workspace)` — no `as PipelineDeps` cast. ✅

---

### Spec: PipelineDeps does not hold a full RuntimeStrategy facade field

**Status: PASS**

`src/core/types.ts` — `runtimeStrategy?: RuntimeStrategy` field absent. The seven capability fields present:
- `stepArtifact?: StepArtifactLifecycleCapability`
- `stepIo?: StepIoValidationCapability`
- `terminalState?: TerminalStateCapability`
- `roundGitEffects?: RoundGitEffectsCapability`
- `changedFiles?: ChangedFilesCapability`
- `commitInspection?: CommitInspectionCapability`
- `revisionContent?: RevisionContentCapability`

Test fake in `parallel-review-round-invalidation.test.ts` — the `makeDeps` function only requires `roundGitEffects` capability (no `bootstrapJob`, `persistJobState`, etc.). ✅

---

### Spec: LocalRuntime.buildDeps injects all capabilities into PipelineDeps

**Status: PASS**

`src/core/runtime/local.ts` line 632–641: all 7 fields injected:
- `stepArtifact: deriveStepArtifactLifecycleCapability(this)` ✅
- `stepIo: deriveStepIoValidationCapability(this)` ✅
- `terminalState: deriveTerminalStateCapability(this)` ✅
- `roundGitEffects: deriveRoundGitEffectsCapability(this)` ✅
- `changedFiles: { canDeriveChangedFiles: ..., listChangedFiles: ... }` ✅
- `commitInspection: deriveCommitInspectionCapability(this)` ✅
- `revisionContent: deriveRevisionContentCapability(this)` ✅

TC-028 in `managed-runtime-capabilities.test.ts` verifies the real `ManagedRuntime.buildDeps()` produces all 7 fields. ✅

---

### Spec: ManagedRuntime preserves existing no-op semantics in capabilities

**Status: PASS**

`src/core/runtime/managed.ts`:
- `prepareStepArtifacts`: no-op body. ✅
- `finalizeStepArtifacts`: no-op body (typed signature: `_step: AgentStep, _infra: CommitPushInfra`). ✅
- `commitFinalState(cwd, slug, state)`: no-op body. ✅
- `listWorktreeChanges`: returns `{ kind: "success", paths: [] }`. ✅
- `commitRoundArtifacts`: no-op body. ✅

`managed-runtime-capabilities.test.ts` lines 181–194: `listWorktreeChanges` asserted to return `{ kind: "success", paths: [] }`. `commitRoundArtifacts` asserted to be no-op. ✅

---

### Spec: Capability methods are required; absence expressed via undefined field

**Status: PASS**

`StepArtifactLifecycleCapability` — only `snapshotMainCheckoutGuard?` is optional (sole exception). ✅
`StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability` — all methods required. ✅

`local-runtime-capabilities.test.ts` TC-T14-11: test proves compile-time optional chaining on `terminalState?: TerminalStateCapability`. ✅

---

### Spec: R2a read-only capabilities are injected directly, not re-derived from facade

**Status: PASS**

`step-context-builder.ts` line 200: `await step.prepareRoundContext(state, cwd, deps.commitInspection)` — passes `deps.commitInspection` directly. ✅

`adr-gen.ts` line 182: parameter signature `commitInspection: CommitInspectionCapability | undefined`. ✅
`custom-reviewer.ts` line 146: parameter signature `commitInspection: CommitInspectionCapability | undefined`. ✅
`spec-review.ts` line 104: parameter signature `commitInspection: CommitInspectionCapability | undefined`. ✅

No `deriveCommitInspectionCapability(deps.runtimeStrategy)` call appears in any consumer. Grep `deps.runtimeStrategy` returns no matches in production source. ✅

---

### Spec: Command lifecycle ordering is preserved after capability split

**Status: PASS**

`executor-lifecycle-ordering.test.ts`:
- TC-T15-05: proves `buildDeps()` returns `PipelineDeps` directly without cast (DSM §3 via allowlist). ✅
- TC-T15-03: proves `terminalState?.commitFinalState(cwd, slug, state)` receives string primitives. ✅
- TC-T15-04: proves `terminalState` absent — optional chain evaluates to undefined. ✅

`runner.ts` ordering: `assertProviderReadiness` → `prepare()` → `setupWorkspace` → `buildDeps` → `registerCleanup` → pipeline is unchanged. ✅

---

### Spec: Step finalize lifecycle ordering is preserved

**Status: PASS**

`executor-lifecycle-ordering.test.ts`:
- TC-T15-01: `finalizeStepArtifacts` receives `cwd: string` and `slug: string` as string primitives. ✅
- TC-T15-02: `finalizeStepArtifacts` is NOT called when `deps.roundOwnsGitEffects === true`. ✅
- TC-T15-06: `prepareStepArtifacts` is called before `runner.run()`. ✅

`executor.ts` line 458: `if (!deps.roundOwnsGitEffects)` guard confirmed. ✅

---

### Acceptance Criteria Checklist

| Criterion | Status |
|---|---|
| 対象 consumer が mutation / lifecycle 用に full `RuntimeStrategy` を要求しない | ✅ `deps.runtimeStrategy` absent from all production consumers |
| `PipelineDeps` が full runtime facade を mutation consumer 向け service locator として保持しない | ✅ `runtimeStrategy` field removed; 7 capability fields added |
| capability が use-case-specific な最小契約であり、新しい mega-interface を作っていない | ✅ 4 narrow interfaces (StepArtifact, StepIo, TerminalState, RoundGitEffects) |
| capability method は required で、能力不在は注入値で表現される | ✅ sole optional: `snapshotMainCheckoutGuard?` (per spec exception) |
| `buildDeps` / `finalizeStepArtifacts` / `commitFinalState` / `commitRoundArtifacts` の対象 payload signature に domain object を表す `unknown` が残らない | ✅ All four addressed: `buildDeps` returns `PipelineDeps`; others removed from port |
| 対象境界の `as PipelineDeps`、`as CommitPushInfra`、egress params 復元 cast が除去される | ✅ All three target casts removed from production code |
| 新たな `as unknown as RuntimeStrategy` または同等の forced cast を追加していない | ✅ Count decreased from 4 to 2; no new occurrences added |
| R2a の read-only leaf consumer が full facade 依存へ戻っていない | ✅ `deps.commitInspection`, `deps.revisionContent`, `deps.changedFiles` used directly |
| command lifecycle、step finalize、terminal commit、round-owned git effects の順序と失敗境界が executable test で固定される | ✅ `executor-lifecycle-ordering.test.ts` (T-15) covers all four boundaries |
| Local/Managed capability contract test、または同等の executable proof がある | ✅ `local-runtime-capabilities.test.ts` + `managed-runtime-capabilities.test.ts` (T-14, TC-028) |
| architecture 文書が実装後の責務と依存方向に一致する | ✅ `architecture/components.md` updated with R2b, facade/capability distinction, no-service-locator |
| SpecRunner verification が green | ✅ 831/831 tests passed; build/typecheck/lint all passed |
| 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない | ✅ diff shows only expected files touched per tasks.md |

---

## Observations (plan divergence, not findings)

- **`runtimeStrategy` variable name in test files**: Several test files (e.g., `parallel-review-round-invalidation.test.ts`, `parallel-review-round-git-effects.test.ts`) use a local variable named `runtimeStrategy` for what is actually injected as `roundGitEffects: runtimeStrategy as never`. This is a naming artifact (variables named before the field was renamed) but is correct in behavior — the value is injected into the `roundGitEffects` field, not a `runtimeStrategy` field. TypeScript enforces this via `as never`.

- **e2e test migration**: `pipeline-integration.test.ts` and `custom-reviewers-e2e.test.ts` no longer use `as unknown as RuntimeStrategy` (migrated to capability fields). The tasks.md note said not to change these, but since `PipelineDeps.runtimeStrategy` was removed, migration was required. No new `as unknown as RuntimeStrategy` occurrences were added (count went from 4 to 2). The acceptance criterion "not added" is met.

- **`prior-round-context.ts` parameter name**: The function `derivePriorRoundContext` still uses the parameter name `runtimeStrategy` internally (typed as `CommitInspectionCapability | undefined`). This is a legacy naming artifact; the type is correct and the calling convention correctly passes `commitInspection`.

- **DSM allowlist**: `src/core/port/runtime-strategy.ts` imports `PipelineDeps` from `../types.ts` via `import type`. This is documented in the file header as a type-only exception (erased at runtime, no module cycle). The arch-allowlist.ts entry covers this.

---

## Conclusion

All normative requirements from `request.md` and `spec.md` are met. The implementation correctly:
1. Removes `PipelineDeps.runtimeStrategy` and introduces 7 typed capability fields
2. Removes `unknown`-typed parameters from `finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` at the port level
3. Removes `buildDeps(): unknown` — now returns `PipelineDeps`
4. Eliminates `as PipelineDeps`, `as CommitPushInfra`, and egress params restore casts from production code
5. Provides typed no-op implementations in `ManagedRuntime`
6. Provides contract tests (T-14) and lifecycle ordering tests (T-15)
7. Updates `architecture/components.md` to reflect post-R2b responsibility model
8. Passes verification (831/831 tests green)
