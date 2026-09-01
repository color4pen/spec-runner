# Conformance Result — runtime-mutation-lifecycle-capability-split — Iteration 8

## Files Reviewed

- `src/core/port/runtime-strategy.ts` (port interface; `buildDeps` return type; R2a/R2b capability declarations)
- `src/core/types.ts` (`PipelineDeps` — `runtimeStrategy` removed; 7 capability fields present)
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
- `src/core/step/no-op-detect.ts` (accepts `ChangedFilesCapability` as second parameter)
- `src/core/runtime/__tests__/local-runtime-capabilities.test.ts` (T-14 contract tests)
- `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts` (T-14 contract tests + TC-028 buildDeps integration)
- `tests/unit/step/executor-lifecycle-ordering.test.ts` (T-15 lifecycle ordering tests)
- `tests/unit/architecture/arch-allowlist.ts` (DSM allowlist entry for `runtime-strategy.ts → types.ts` import type)
- `architecture/components.md` (R2b documentation)
- `specrunner/changes/runtime-mutation-lifecycle-capability-split/verification-result.md` (passed)

---

## Normative Requirement Verification

### Spec: StepArtifactLifecycleCapability — typed parameters

**Status: PASS**

`src/core/step/step-capability.ts` defines `StepArtifactLifecycleCapability` with:
- `finalizeStepArtifacts(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra): Promise<void>` — all parameters explicitly typed; no `unknown`.
- `snapshotMainCheckoutGuard?` is the sole optional method (spec exception: fail-open semantics require `null` result, not capability absence). ✅
- All other methods required (no `?` modifier). ✅

`executor.ts` line 466: `if (!deps.stepArtifact) return;` guard — finalize skipped when capability absent (scenario: "skips finalize when capability is absent"). ✅
`executor.ts` line 467: `await deps.stepArtifact.finalizeStepArtifacts(step, stateForFinalize, cwd, deps.slug, headForFinalize, {...})` — `cwd: string` (extracted once at top of `runAgentStep`), `deps.slug: string`. No cast. ✅

---

### Spec: TerminalStateCapability — typed parameters

**Status: PASS**

`src/core/pipeline/pipeline-capability.ts` declares:
```ts
commitFinalState(cwd: string, slug: string, state: JobState): Promise<void>
```

`pipeline.ts` line 399: `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)` — string primitives; no `deps` object forwarded. ✅
`pipeline.ts` line 623: same pattern (second terminal transition). ✅
`runner.ts` line 322: `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, haltState)` — gate-halt path uses `terminalState` capability. ✅

Scenario "CommandRunner gate-halt uses terminalState capability": confirmed. ✅

---

### Spec: RoundGitEffectsCapability — typed parameters

**Status: PASS**

`src/core/pipeline/pipeline-capability.ts` declares:
```ts
commitRoundArtifacts(
  stagePaths: string[], cwd: string, branch: string, coordinatorName: string,
  slug: string, infra: CommitPushInfra, egressParams?: RoundEgressParams
): Promise<void>
```
`RoundEgressParams` is a domain-neutral DTO (`synthesizedCommits: readonly string[]`, `pushCapability?: PushCapability | null`, `excludeWorktreePatterns?: string[]`). No `unknown`. ✅

`parallel-review-round.ts` line 464: `await deps.roundGitEffects.commitRoundArtifacts(toStage, cwd, branch, coordinatorName, deps.slug, infra, { synthesizedCommits: ..., pushCapability: ..., excludeWorktreePatterns: ... })` — `infra` is typed `CommitPushInfra`; egress params constructed inline as typed literal. No `as CommitPushInfra` cast; no `as unknown`. ✅

---

### Spec: buildDeps returns typed PipelineDeps without cast

**Status: PASS**

`src/core/port/runtime-strategy.ts` lines 395–400:
```ts
buildDeps(
  config: SpecRunnerConfig,
  request: ParsedRequest,
  slug: string,
  workspace: WorkspaceContext,
): PipelineDeps;
```
Return type is `PipelineDeps` (not `unknown`). DSM-allowlist documents the `import type { PipelineDeps }` from domain layer as a type-only exception (erased at runtime). ✅

`runner.ts` line 222: `deps = this.runtime.buildDeps(config, request, slug, workspace)` — no `as PipelineDeps` cast. ✅

TC-T15-05 in `executor-lifecycle-ordering.test.ts`: runtime-port-level call `fake.buildDeps(...)` returns `PipelineDeps` directly without cast — confirmed at compile time. ✅

---

### Spec: PipelineDeps does not hold a full RuntimeStrategy facade field

**Status: PASS**

`src/core/types.ts`: `runtimeStrategy?: RuntimeStrategy` is absent. Seven capability fields are present:
- `stepArtifact?: StepArtifactLifecycleCapability`
- `stepIo?: StepIoValidationCapability`
- `terminalState?: TerminalStateCapability`
- `roundGitEffects?: RoundGitEffectsCapability`
- `changedFiles?: ChangedFilesCapability`
- `commitInspection?: CommitInspectionCapability`
- `revisionContent?: RevisionContentCapability`

No production file references `deps.runtimeStrategy` (grep returns no matches in `src/`). ✅

Test fake narrowness confirmed: test fakes in capability contract tests only implement the specific capability interface they test — no `bootstrapJob`, `persistJobState`, or other unrelated methods required. ✅

---

### Spec: LocalRuntime.buildDeps injects all capabilities into PipelineDeps

**Status: PASS**

`src/core/runtime/local.ts` lines 631–641: all 7 capability fields injected:
- `stepArtifact: deriveStepArtifactLifecycleCapability(this)` ✅
- `stepIo: deriveStepIoValidationCapability(this)` ✅
- `terminalState: deriveTerminalStateCapability(this)` ✅
- `roundGitEffects: deriveRoundGitEffectsCapability(this)` ✅
- `changedFiles: { canDeriveChangedFiles: () => this.canDeriveChangedFiles(), listChangedFiles: (...) => this.listChangedFiles(...) }` ✅
- `commitInspection: deriveCommitInspectionCapability(this)` ✅
- `revisionContent: deriveRevisionContentCapability(this)` ✅

`LocalRuntime` has `listCommitChangedFiles` and `readRevisionContent` (required by `RealRuntimeStrategy`), so `deriveCommitInspectionCapability` and `deriveRevisionContentCapability` return non-undefined values. All 7 fields non-undefined for LocalRuntime. ✅

Derive helpers defined in the capability interface files (D5 convention), not in `local.ts`. ✅

---

### Spec: ManagedRuntime preserves existing no-op semantics in capabilities

**Status: PASS**

`src/core/runtime/managed.ts`:
- `finalizeStepArtifacts(_step: AgentStep, _state: JobState, _cwd: string, _slug: string, _headBeforeStep: string | null, _infra: CommitPushInfra)`: no-op body. ✅
- `commitFinalState(_cwd: string, _slug: string, _state: JobState)`: no-op body. ✅
- `listWorktreeChanges(_cwd: string)`: returns `{ kind: "success", paths: [] }`. ✅
- `commitRoundArtifacts(_stagePaths, _cwd, _branch, _coordinatorName, _slug, _infra: CommitPushInfra, _egressParams?: RoundEgressParams)`: no-op body. ✅

`managed-runtime-capabilities.test.ts` (TC-028) exercises the real `ManagedRuntime.buildDeps()` with mock HTTP clients, verifying that `deps.changedFiles.canDeriveChangedFiles()` returns `false` (structural non-derivability preserved), and that all 7 capability fields are non-undefined. ✅

---

### Spec: Capability methods are required; absence expressed via undefined field

**Status: PASS**

- `StepArtifactLifecycleCapability`: `snapshotMainCheckoutGuard?` is the sole optional method. All others required. ✅
- `StepIoValidationCapability`: all methods required. ✅
- `TerminalStateCapability`: `commitFinalState` required. ✅
- `RoundGitEffectsCapability`: all methods required. ✅

Consumers use field presence guard (`deps.stepArtifact ?` / `deps.terminalState?.`) not method presence guard (`?.method?.(...)`). ✅

`local-runtime-capabilities.test.ts` TC-T14-11 proves `terminalState: undefined` compiles and optional chain evaluates to `undefined` without throwing. ✅

---

### Spec: R2a read-only capabilities injected directly, not re-derived from facade

**Status: PASS**

`step-context-builder.ts` line 200: `await step.prepareRoundContext(state, cwd, deps.commitInspection)` — passes `deps.commitInspection` directly (no `deriveCommitInspectionCapability(deps.runtimeStrategy)` at call site). ✅

`adr-gen.ts` line 182: parameter `commitInspection: CommitInspectionCapability | undefined` — no `runtimeStrategy: RuntimeStrategy` parameter. ✅
`custom-reviewer.ts` line 146: same replacement. ✅
`spec-review.ts` line 104: same replacement. ✅

`commit-orchestrator.ts` line 344: `deps.revisionContent` used directly. ✅
`commit-orchestrator.ts` lines 318–323: `deps.stepArtifact.digestArtifacts(...)` used. ✅

No `deriveCommitInspectionCapability(deps.runtimeStrategy)` or similar derive-from-facade call appears in any consumer. ✅

---

### Spec: Command lifecycle ordering preserved after capability split

**Status: PASS**

`runner.ts` ordering verified unchanged:
1. `assertProviderReadiness` → before `prepare()` → no job state/worktree created on failure. ✅
2. `prepare()` → calls `assertNoDuplicateLiveJob` before `bootstrapJob`. ✅
3. `setupWorkspace` failure → `persistJobState` with `failed` state before cleanup handle. ✅
4. `buildDeps` → then `registerCleanup` (dependency assembly before cleanup registration). ✅
5. `reloadJobState` after `setupWorkspace` on run path; not called on resume path. ✅

`executor-lifecycle-ordering.test.ts`:
- TC-T15-03: `terminalState?.commitFinalState(cwd, slug, state)` receives string primitives at gate-halt path. ✅
- TC-T15-04: `terminalState` absent — optional chain evaluates to `undefined` (no throw). ✅
- TC-T15-05: `buildDeps()` returns `PipelineDeps` directly; no cast needed. ✅

---

### Spec: Step finalize lifecycle ordering preserved

**Status: PASS**

`executor.ts` ordering:
1. `deps.stepArtifact?.prepareStepArtifacts(cwd, slug, step.name, state)` (line 339) — before agent run. ✅
2. `deps.stepArtifact?.finalizeStepArtifacts(...)` (line 467) — after agent success and output gate pass. ✅
3. `captureHeadSha` for commit OID (line 512) — after `finalizeStepArtifacts`. ✅
4. `!deps.roundOwnsGitEffects` guard (line 458) — prevents `finalizeStepArtifacts` for coordinator members. ✅

`executor-lifecycle-ordering.test.ts`:
- TC-T15-01: `finalizeStepArtifacts` called with `cwd: string` and `slug: string` primitives (not `deps` object). ✅
- TC-T15-02: `finalizeStepArtifacts` NOT called when `roundOwnsGitEffects === true`. ✅
- TC-T15-06: `prepareStepArtifacts` called before `runner.run()` (call-order counter confirms). ✅

---

## Acceptance Criteria Checklist

| Criterion | Status |
|---|---|
| 対象 consumer が mutation / lifecycle 用に full `RuntimeStrategy` を要求しない | ✅ `deps.runtimeStrategy` absent from all production consumers |
| `PipelineDeps` が full runtime facade を mutation consumer 向け service locator として保持しない | ✅ `runtimeStrategy` field removed; 7 capability fields added |
| capability が use-case-specific な最小契約であり、新しい mega-interface を作っていない | ✅ 4 narrow interfaces (StepArtifact, StepIo, TerminalState, RoundGitEffects) |
| capability method は required で、能力不在は注入値で表現される | ✅ sole optional: `snapshotMainCheckoutGuard?` (per spec exception clause) |
| `buildDeps` / `finalizeStepArtifacts` / `commitFinalState` / `commitRoundArtifacts` の対象 payload signature に domain object を表す `unknown` が残らない | ✅ `buildDeps` → `PipelineDeps`; other 3 removed from port (typed in capability interfaces) |
| 対象境界の `as PipelineDeps`、`as CommitPushInfra`、egress params 復元 cast が除去される | ✅ All three target casts removed from production code |
| 新たな `as unknown as RuntimeStrategy` または同等の forced cast を追加していない | ✅ Count decreased from 4 to 2; no new occurrences added |
| R2a の read-only leaf consumer が full facade 依存へ戻っていない | ✅ `deps.commitInspection`, `deps.revisionContent`, `deps.changedFiles` used directly |
| command lifecycle、step finalize、terminal commit、round-owned git effects の順序と失敗境界が executable test で固定される | ✅ `executor-lifecycle-ordering.test.ts` (T-15) covers all four boundaries |
| Local/Managed capability contract test、または同等の executable proof がある | ✅ `local-runtime-capabilities.test.ts` + `managed-runtime-capabilities.test.ts` (T-14, TC-028) |
| architecture 文書が実装後の責務と依存方向に一致する | ✅ `architecture/components.md` updated with R2b, facade/capability distinction, no-service-locator |
| SpecRunner verification が green | ✅ build / typecheck / test / lint all passed (verification-result.md) |
| 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない | ✅ diff stat shows only expected implementation and test files touched |

---

## Observations (plan divergence — not findings)

- **`runtimeStrategy` variable name in test files** (`no-op-detect-exemption.test.ts`): uses a local variable named `runtimeStrategy` for a `ChangedFilesCapability`-shaped fake, passed `as never` to `detectNoOp`. This is a stale variable name (the actual object has `listChangedFiles`, which is what `detectNoOp` uses). Behavior is correct; `as never` is a test-internal cast with no production impact.

- **`as unknown as RuntimeStrategy` count**: baseline was 4 occurrences (all in out-of-scope full-pipeline e2e mocks per tasks.md §T-13). After migration, count decreased to 2 in `pipeline-sole-committer-e2e.test.ts`. The other 2 were in `pipeline-integration.test.ts` and `custom-reviewers-e2e.test.ts` where `PipelineDeps.runtimeStrategy` removal forced migration to capability fields — no new forced casts added. Requirement "not added" is met.

- **DSM allowlist**: `src/core/port/runtime-strategy.ts` imports `PipelineDeps` via `import type` from `../types.ts`. Documented in file header and arch-allowlist entry (`tracking: "T-05-T-12-buildDeps-PipelineDeps-return-type"`). `import type` is erased at compile time — no runtime module dependency created. Architecturally neutral per the DSM definition (runtime coupling only).

- **runner-fidelity-gate.test.ts**: The mock `runtime` object includes `commitFinalState` as a top-level method, but `capturedDeps` (returned by `buildDeps`) does not inject `terminalState`. When the gate-halt path calls `deps.terminalState?.commitFinalState(...)`, the optional chain evaluates to `undefined` (no-op). This is acceptable for the test's purpose (testing the gate decision, not the terminal commit path).

---

## Conclusion

All normative requirements from `request.md` (Acceptance Criteria) and `spec.md` (Requirements/Scenarios) are satisfied. The implementation:

1. Removes `PipelineDeps.runtimeStrategy` and replaces it with 7 typed capability fields.
2. Removes domain-payload `unknown` from all 4 target signatures — `buildDeps` returns `PipelineDeps`; `finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` moved to typed consumer-owned capability interfaces.
3. Eliminates `as PipelineDeps`, `as CommitPushInfra`, and egress-params restore casts from production code.
4. Provides typed no-op implementations in `ManagedRuntime` with preserved semantics.
5. Provides T-14 contract tests (Local/Managed capability satisfaction) and T-15 lifecycle ordering tests.
6. Updates `architecture/components.md` to reflect the post-R2b responsibility model.
7. Passes SpecRunner verification (build / typecheck / test / lint all green).
