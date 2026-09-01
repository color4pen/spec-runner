# Conformance Result — runtime-mutation-lifecycle-capability-split — iter 10

## Checked items

### request.md Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| 対象 consumer が mutation / lifecycle 用に full `RuntimeStrategy` を要求しない | ✅ PASS | `executor.ts`, `pipeline.ts`, `parallel-review-round.ts` contain zero `deps.runtimeStrategy` references; all use narrow capability fields (`deps.stepArtifact`, `deps.stepIo`, `deps.terminalState`, `deps.roundGitEffects`) |
| `PipelineDeps` が full runtime facade を mutation consumer 向け service locator として保持しない | ✅ PASS | `src/core/types.ts` — `runtimeStrategy?: RuntimeStrategy` field removed; replaced by 7 typed capability fields. Import of `RuntimeStrategy` from types.ts eliminated. |
| capability が use-case-specific な最小契約であり、新しい mega-interface を作っていない | ✅ PASS | Four separate interfaces created: `StepArtifactLifecycleCapability` (5 methods), `StepIoValidationCapability` (3 methods), `TerminalStateCapability` (1 method), `RoundGitEffectsCapability` (5 methods). No single mega-interface present. |
| capability method は required で、能力不在は注入値で表現される | ✅ PASS | All methods required in `step-capability.ts` and `pipeline-capability.ts`. `snapshotMainCheckoutGuard?` is the sole documented exception (fail-open semantics require null result, not capability absence — spec explicitly permits this). Capability absence expressed via `deps.stepArtifact` / `deps.terminalState` etc. being `undefined`. |
| `buildDeps` / `finalizeStepArtifacts` / `commitFinalState` / `commitRoundArtifacts` の対象 payload signature に domain object を表す `unknown` が残らない | ✅ PASS | `buildDeps` returns `PipelineDeps` in the port interface (runtime-strategy.ts line 395-400). `finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` removed from `RuntimeStrategy` port; their typed counterparts live on capability interfaces. No domain-payload `unknown` remains. |
| 対象境界の `as PipelineDeps`、`as CommitPushInfra`、egress params 復元 cast が除去される | ✅ PASS | `runner.ts` — no `as PipelineDeps` cast (grep confirms zero matches in production src). `local.ts commitRoundArtifacts` — no `as CommitPushInfra` cast; `infra` directly typed as `CommitPushInfra`. Egress params restore cast removed; `egressParams` directly typed as `RoundEgressParams | undefined`. |
| 新たな `as unknown as RuntimeStrategy` または同等の forced cast を追加していない | ✅ PASS | No new forced casts in production source. The 4 pre-existing `as unknown as RuntimeStrategy` occurrences remain only in out-of-scope full-pipeline e2e mocks. |
| R2a の read-only leaf consumer が full facade 依存へ戻っていない | ✅ PASS | `adr-gen.ts` (line 182), `custom-reviewer.ts` (line 146), `spec-review.ts` (line 104) all accept `commitInspection: CommitInspectionCapability | undefined` directly. `commit-orchestrator.ts` uses `deps.stepArtifact.digestArtifacts` and `deps.revisionContent` directly. `step-completion.ts` uses `deps.stepIo.verifyFindingRefs`. No `deriveCommitInspectionCapability(deps.runtimeStrategy)` call at consumer sites. |
| command lifecycle、step finalize、terminal commit、round-owned git effects の順序と失敗境界が executable test で固定される | ✅ PASS | `tests/unit/step/executor-lifecycle-ordering.test.ts` (354 lines, T-15): TC-T15-01 (finalizeStepArtifacts receives string cwd/slug), TC-T15-02 (finalize skipped for roundOwnsGitEffects=true), TC-T15-03 (terminalState.commitFinalState receives string cwd/slug), TC-T15-04 (absent terminalState optional chain), TC-T15-05 (buildDeps type-safe DSM proof), TC-T15-06 (prepareStepArtifacts before runner.run ordering). `parallel-review-round-git-effects.test.ts` covers round git effects ordering. |
| Local/Managed capability contract test、または同等の executable proof がある | ✅ PASS | `src/core/runtime/__tests__/local-runtime-capabilities.test.ts` (187 lines): compile-time + runtime proofs for all 4 capabilities. `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts` (291 lines): mirrors local tests plus runtime assertions for managed no-op semantics (`prepareStepArtifacts`, `finalizeStepArtifacts`, `commitFinalState` resolve without side effects; `listWorktreeChanges` returns `{kind:"success", paths:[]}`). |
| architecture 文書が実装後の責務と依存方向に一致する | ✅ PASS | `architecture/components.md` updated: `RuntimeStrategy` described as "composition root 向け facade", `PipelineDeps` described as not a service locator, R2b capabilities listed (`StepArtifactLifecycleCapability`, `StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability`), Local/Managed behavioral differences noted as confined to concrete runtime/adapter layer. |
| SpecRunner verification が green | ✅ PASS | verification-result.md (iter 1): build ✅, typecheck ✅, test ✅, lint ✅, changed-line-coverage ✅ |
| 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない | ✅ PASS | git diff main...HEAD --stat shows 149 files changed; all are implementation files, test files, pipeline artifacts (conformance-result-*.md, spec.md, design.md, tasks.md, state.json, etc.) — no unrelated untracked files included. |

### spec.md Requirements

| Requirement | Scenario(s) | Status | Evidence |
|-------------|-------------|--------|----------|
| Step artifact lifecycle capability is consumer-owned and typed | TC-T15-01 (typed params), StepExecutor skips finalize when absent | ✅ PASS | `step-capability.ts`: `finalizeStepArtifacts(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string \| null, infra: CommitPushInfra)`. `executor.ts` line 466-467: `if (!deps.stepArtifact) return` guard. TC-T15-01 asserts cwd and slug are string primitives. |
| Terminal state capability carries typed parameters | Pipeline calls `commitFinalState` with primitives; CommandRunner gate-halt uses `terminalState` | ✅ PASS | `pipeline.ts` lines 400, 625: `deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)`. `runner.ts` line 323: `deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, haltState)`. No `deps` object forwarded. TC-T15-03 asserts string primitives. |
| Round git effects capability is consumer-owned and typed | `ParallelReviewRound` calls `commitRoundArtifacts` with typed infra | ✅ PASS | `parallel-review-round.ts` lines 464-476: `deps.roundGitEffects?.commitRoundArtifacts(stagePaths, cwd, branch, coordinatorName, deps.slug, infra, egressParams)` with `infra: CommitPushInfra` typed, `egressParams: RoundEgressParams` typed. No `as CommitPushInfra` cast. |
| buildDeps returns typed PipelineDeps without a cast | CommandRunner assigns buildDeps result without cast | ✅ PASS | `runtime-strategy.ts` lines 395-400: `buildDeps(...): PipelineDeps`. `runner.ts` line 222: `deps = this.runtime.buildDeps(...)` — no `as PipelineDeps` cast. TC-T15-05 compile-time proof. |
| PipelineDeps does not hold a full RuntimeStrategy facade field | Test fake implements only `StepArtifactLifecycleCapability` | ✅ PASS | `types.ts`: no `runtimeStrategy?: RuntimeStrategy` field. Test fakes in `executor-lifecycle-ordering.test.ts` inject only the specific capability field needed (e.g., `stepArtifact: { captureHeadSha, prepareStepArtifacts, finalizeStepArtifacts, digestArtifacts }`). |
| LocalRuntime.buildDeps injects all capabilities into PipelineDeps | LocalRuntime provides all capabilities | ✅ PASS | `local.ts` buildDeps (lines 607-646): all 7 fields injected (`stepArtifact`, `stepIo`, `terminalState`, `roundGitEffects`, `changedFiles`, `commitInspection`, `revisionContent`). local-runtime-capabilities.test.ts verifies. |
| ManagedRuntime preserves existing no-op semantics in capabilities | ManagedRuntime capability no-ops match prior behavior | ✅ PASS | `managed.ts`: `prepareStepArtifacts` no-op (line ~372), `finalizeStepArtifacts` no-op (line ~375-384), `commitFinalState` no-op (line ~389), `listWorktreeChanges` returns `{kind:"success", paths:[]}` (line 644-646), `commitRoundArtifacts` no-op (line 654-664). managed-runtime-capabilities.test.ts asserts each no-op. |
| Capability methods are required; absence is expressed via undefined field | Compile-time enforcement of complete capability fake | ✅ PASS | `step-capability.ts` and `pipeline-capability.ts`: all methods have required signatures (no `?`). `snapshotMainCheckoutGuard?` is the sole documented exception (spec explicitly permits). All method-absent type errors caught at compile time (typecheck passes). |
| R2a read-only capabilities are injected directly, not re-derived from facade | step-completion uses injected CommitInspection; adr-gen/custom-reviewer/spec-review parameter types narrowed | ✅ PASS | `step-completion.ts` lines 243, 256, 274: uses `deps.stepIo.verifyFindingRefs`. `adr-gen.ts` line 182, `custom-reviewer.ts` line 146, `spec-review.ts` line 104: all accept `commitInspection: CommitInspectionCapability \| undefined` — no `RuntimeStrategy` param, no `deriveCommitInspectionCapability` derivation at call site. |
| Command lifecycle ordering is preserved after capability split | buildDeps returns PipelineDeps without observable ordering change | ✅ PASS | `runner.ts` execute sequence unchanged. TC-T15-05 (compile-time proof of buildDeps type). `pipeline-run.ts` continues to use `this.runtime.assertNoDuplicateLiveJob` and `this.runtime.bootstrapJob` via full RuntimeStrategy — no change to command lifecycle ordering. |
| Step finalize lifecycle ordering is preserved | finalizeStepArtifacts skipped for roundOwnsGitEffects members | ✅ PASS | `executor.ts` lines 462-468: `if (deps.roundOwnsGitEffects) return` guard before `deps.stepArtifact?.finalizeStepArtifacts(...)`. TC-T15-02 asserts finalize not called when `roundOwnsGitEffects=true`. TC-T15-06 asserts `prepareStepArtifacts` before `runner.run`. |

## Metrics observed

| Metric | Value |
|--------|-------|
| New capability interfaces | 4 (`StepArtifactLifecycleCapability`, `StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability`) |
| `PipelineDeps.runtimeStrategy` production references | 0 |
| Domain-payload `unknown` in 4 target signatures | 0 (3 methods removed from port, buildDeps return type fixed) |
| `as PipelineDeps` casts in production code | 0 |
| `as CommitPushInfra` casts in production `commitRoundArtifacts` | 0 |
| Egress params restore casts in production code | 0 |
| New `as unknown as RuntimeStrategy` forced casts | 0 |
| Capability contract test files | 2 (`local-runtime-capabilities.test.ts`, `managed-runtime-capabilities.test.ts`) |
| Lifecycle ordering test file | 1 (`executor-lifecycle-ordering.test.ts`, 354 lines, 6 test cases) |
| Verification result | passed (build, typecheck, test, lint, changed-line-coverage all ✅) |

## Findings

None.
