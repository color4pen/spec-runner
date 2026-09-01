# Conformance Result — runtime-mutation-lifecycle-capability-split — Iteration 9

## Resume Context

This iteration is a budget-recovery resume. The previous iteration (008) produced an `approved` verdict; the pipeline budget was then exhausted before the PR-create step. The code-fixer applied the following targeted fixes after iteration 008:

1. **`deps.cwd ?? process.cwd()` fallback** — verified present at both `pipeline.ts` terminal transitions (lines 400, 625) and at `runner.ts` gate-halt path (line 323).
2. **`as-never` casts in `parallel-review-round-git-effects.test.ts`** — resolved by code-fixer; remaining `as never` occurrences are standard test-infra casts (`config: {} as never`, `githubClient: {} as never`, etc.) — not the banned `as unknown as RuntimeStrategy` pattern.
3. **`architecture/components.md` collaborator lists** — updated to include `StepArtifactLifecycleCapability` / `StepIoValidationCapability` (StepExecutor row, line 67) and `RoundGitEffectsCapability` (CommitOrchestrator/ParallelReviewRound row, line 73).

## Files Reviewed (Iteration 9)

- `src/core/port/runtime-strategy.ts` — `buildDeps` return type `PipelineDeps`; three domain-payload methods absent
- `src/core/types.ts` — `runtimeStrategy` field absent; seven capability fields present
- `src/core/step/step-capability.ts` — `StepArtifactLifecycleCapability`, `StepIoValidationCapability`, derive helpers
- `src/core/pipeline/pipeline-capability.ts` — `TerminalStateCapability`, `RoundGitEffectsCapability`, `RoundEgressParams`, derive helpers
- `src/core/runtime/local.ts` — `buildDeps` injects all 7 capability fields
- `src/core/runtime/managed.ts` — typed no-op signatures; no-op semantics preserved
- `src/core/step/executor.ts` — uses `deps.stepArtifact`, `deps.stepIo`, `deps.changedFiles`; no `deps.runtimeStrategy`
- `src/core/pipeline/pipeline.ts` — `deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)` at lines 400 and 625
- `src/core/pipeline/parallel-review-round.ts` — uses `deps.roundGitEffects` throughout; no `deps.runtimeStrategy`
- `src/core/command/runner.ts` — no `as PipelineDeps` cast; gate-halt path uses `deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, haltState)` at line 323
- `src/core/step/adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts` — accept `CommitInspectionCapability | undefined`
- `src/core/runtime/__tests__/local-runtime-capabilities.test.ts` — T-14 contract tests
- `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts` — T-14 contract tests + TC-028 buildDeps integration
- `tests/unit/step/executor-lifecycle-ordering.test.ts` — T-15 lifecycle ordering tests
- `architecture/components.md` — R2b documentation with updated collaborator lists

---

## Normative Requirement Verification

### Spec: StepArtifactLifecycleCapability — typed parameters

**Status: PASS**

`step-capability.ts` defines `StepArtifactLifecycleCapability` with all method signatures explicitly typed (no `unknown`). `snapshotMainCheckoutGuard?` is the sole optional method (spec exception: fail-open semantics). All other methods required.

`executor.ts` line 466–467: `if (!deps.stepArtifact) return; await deps.stepArtifact.finalizeStepArtifacts(step, stateForFinalize, cwd, deps.slug, headForFinalize, {...})` — `cwd: string` extracted at top of `runAgentStep`; no cast. ✅

---

### Spec: TerminalStateCapability — typed parameters

**Status: PASS**

`pipeline-capability.ts` declares `commitFinalState(cwd: string, slug: string, state: JobState): Promise<void>`.

- `pipeline.ts` line 400: `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)` ✅
- `pipeline.ts` line 625: same pattern (second terminal transition) ✅
- `runner.ts` line 323: `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, haltState)` — gate-halt path ✅

No `deps` object forwarded as parameter. String primitives only.

---

### Spec: RoundGitEffectsCapability — typed parameters

**Status: PASS**

`pipeline-capability.ts` declares `commitRoundArtifacts(..., infra: CommitPushInfra, egressParams?: RoundEgressParams): Promise<void>`. `RoundEgressParams` is a domain-neutral DTO with no `unknown`.

`parallel-review-round.ts` line 464: `await deps.roundGitEffects.commitRoundArtifacts(toStage, cwd, branch, coordinatorName, deps.slug, infra, { synthesizedCommits: ..., pushCapability: ..., excludeWorktreePatterns: ... })` — `infra` typed; egress params constructed inline as typed literal. No `as CommitPushInfra` cast. ✅

---

### Spec: buildDeps returns typed PipelineDeps without cast

**Status: PASS**

`runtime-strategy.ts` lines 395–400: `buildDeps(config, request, slug, workspace): PipelineDeps` — no `unknown`. ✅

`runner.ts` line 222: `deps = this.runtime.buildDeps(config, request, slug, workspace)` — no `as PipelineDeps` cast. ✅

---

### Spec: PipelineDeps does not hold a full RuntimeStrategy facade field

**Status: PASS**

`types.ts`: `runtimeStrategy?: RuntimeStrategy` is absent. Seven capability fields present (`stepArtifact`, `stepIo`, `terminalState`, `roundGitEffects`, `changedFiles`, `commitInspection`, `revisionContent`). No production file references `deps.runtimeStrategy` (grep returns no matches in `src/`). ✅

---

### Spec: LocalRuntime.buildDeps injects all capabilities into PipelineDeps

**Status: PASS**

`local.ts`: all 7 capability fields injected via `derive*Capability(this)` helpers. Helpers are defined in the capability interface files (D5 convention), not in `local.ts`. ✅

---

### Spec: ManagedRuntime preserves existing no-op semantics in capabilities

**Status: PASS**

`managed.ts` typed no-op signatures confirmed: `finalizeStepArtifacts` (no-op), `commitFinalState` (no-op), `listWorktreeChanges` returns `{ kind: "success", paths: [] }`, `commitRoundArtifacts` (no-op). All match prior behavior. ✅

`managed-runtime-capabilities.test.ts` (TC-028, TC-T14-M07 through TC-T14-M11) exercises real `ManagedRuntime.buildDeps()` and verifies no-op semantics. ✅

---

### Spec: Capability methods are required; absence expressed via undefined field

**Status: PASS**

`StepArtifactLifecycleCapability`: `snapshotMainCheckoutGuard?` is sole optional method. All others required. ✅  
`StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability`: all methods required. ✅

Consumers use field-presence guard (`deps.stepArtifact ?` / `deps.terminalState?.`), not method-presence guard. ✅

---

### Spec: R2a read-only capabilities injected directly, not re-derived from facade

**Status: PASS**

`adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts`: accept `CommitInspectionCapability | undefined` parameter — no `runtimeStrategy: RuntimeStrategy` parameter. ✅  
`step-context-builder.ts` line 200: passes `deps.commitInspection` directly. ✅  
`commit-orchestrator.ts`: uses `deps.stepArtifact.digestArtifacts(...)` and `deps.revisionContent` directly. ✅

No `deriveCommitInspectionCapability(deps.runtimeStrategy)` at any consumer call site. ✅

---

### Spec: Command lifecycle ordering preserved after capability split

**Status: PASS**

`runner.ts` ordering unchanged: `assertProviderReadiness` → before `prepare()`, `assertNoDuplicateLiveJob` before `bootstrapJob`, `setupWorkspace` failure → `persistJobState` before cleanup handle, `buildDeps` → `registerCleanup`, `reloadJobState` after `setupWorkspace` on run path only.

`executor-lifecycle-ordering.test.ts`: TC-T15-03 (gate-halt terminalState call), TC-T15-04 (absent terminalState), TC-T15-05 (buildDeps no cast). ✅

---

### Spec: Step finalize lifecycle ordering preserved

**Status: PASS**

`executor.ts`:
1. `deps.stepArtifact?.prepareStepArtifacts(...)` (line 339) — before agent run ✅
2. `deps.stepArtifact?.finalizeStepArtifacts(...)` (line 467) — after agent success and output gate pass ✅
3. `captureHeadSha` for commit OID (line 512) — after `finalizeStepArtifacts` ✅
4. `!deps.roundOwnsGitEffects` guard (line 458) — prevents `finalizeStepArtifacts` for coordinator members ✅

`executor-lifecycle-ordering.test.ts`: TC-T15-01, TC-T15-02, TC-T15-06 all pass. ✅

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
| 新たな `as unknown as RuntimeStrategy` または同等の forced cast を追加していない | ✅ No new forced casts added (count decreased overall) |
| R2a の read-only leaf consumer が full facade 依存へ戻っていない | ✅ `deps.commitInspection`, `deps.revisionContent`, `deps.changedFiles` used directly |
| command lifecycle、step finalize、terminal commit、round-owned git effects の順序と失敗境界が executable test で固定される | ✅ `executor-lifecycle-ordering.test.ts` (T-15) covers all four boundaries |
| Local/Managed capability contract test、または同等の executable proof がある | ✅ `local-runtime-capabilities.test.ts` + `managed-runtime-capabilities.test.ts` (T-14, TC-028) |
| architecture 文書が実装後の責務と依存方向に一致する | ✅ `architecture/components.md` updated with R2b, facade/capability distinction, collaborator lists |
| SpecRunner verification が green | ✅ Verified by regression-gate (approved, iteration 12) |
| 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない | ✅ diff stat shows only expected implementation and test files |

---

## Observations (plan divergence — not findings)

- **`as-never` casts in test files**: `parallel-review-round-git-effects.test.ts` and other test files use `as never` for standard test-infrastructure objects (`config: {} as never`, `githubClient: {} as never`, etc.). These are normal TypeScript minimal-fixture patterns — not the banned `as unknown as RuntimeStrategy` pattern. No finding.

- **`as unknown as RuntimeStrategy` count**: Per iteration 008 observation, count decreased from 4 to 2 occurrences; the 2 remaining are in `pipeline-sole-committer-e2e.test.ts`. These are the out-of-scope full-pipeline e2e mocks explicitly excluded by tasks.md §T-13. No new forced casts added.

- **DSM allowlist**: `runtime-strategy.ts` imports `PipelineDeps` via `import type` from `types.ts`. This `import type` is compile-time-only (erased at runtime). Documented in `arch-allowlist.ts` with tracking entry `T-05-T-12-buildDeps-PipelineDeps-return-type`.

---

## Conclusion

All normative requirements from `request.md` Acceptance Criteria and `spec.md` Requirements/Scenarios are satisfied. No new findings. The implementation:

1. Removes `PipelineDeps.runtimeStrategy` and replaces it with 7 typed capability fields.
2. Removes domain-payload `unknown` from all 4 target signatures — `buildDeps` returns `PipelineDeps`; `finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` moved to typed consumer-owned capability interfaces.
3. Eliminates `as PipelineDeps`, `as CommitPushInfra`, and egress-params restore casts from production code.
4. Provides typed no-op implementations in `ManagedRuntime` with preserved semantics.
5. Provides T-14 contract tests (Local/Managed capability satisfaction) and T-15 lifecycle ordering tests.
6. Updates `architecture/components.md` with R2b responsibility model.
7. `deps.cwd ?? process.cwd()` fallback is consistently applied at all three terminal-commit call sites.
