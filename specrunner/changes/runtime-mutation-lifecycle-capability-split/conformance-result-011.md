# Conformance Result — runtime-mutation-lifecycle-capability-split — iter 011

## Evidence

### Scope

- Change folder: `specrunner/changes/runtime-mutation-lifecycle-capability-split`
- Branch: `refactor/runtime-mutation-lifecycle-capability-split-71d6a83e`
- Git diff stat: 209 files changed, 17056 insertions(+), 1038 deletions(−)
- SpecRunner verification: **passed** (build ✓, typecheck ✓, test ✓, lint ✓)

---

## Normative Items Checked

### Req: Step artifact lifecycle capability is consumer-owned and typed

**`StepArtifactLifecycleCapability`** — verified in `src/core/step/step-capability.ts`:
- Interface declared with fully typed `finalizeStepArtifacts(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra): Promise<void>` — no `unknown` parameters.
- All methods required (no `?` modifier): `captureHeadSha`, `prepareStepArtifacts`, `finalizeStepArtifacts`, `snapshotMainCheckoutGuard`, `digestArtifacts`.
- `snapshotMainCheckoutGuard` is required; "check unavailable" is expressed by `null` return, not method omission.
- **Scenario "StepExecutor calls finalizeStepArtifacts with typed parameters"**: `StepExecutor.runAgentStep` calls `deps.stepArtifact.finalizeStepArtifacts(step, stateForFinalize, cwd, deps.slug, headForFinalize, this.commitPushInfra)` — confirmed in `executor.ts`, no `unknown` cast at call site.
- **Scenario "No-op step artifact capability"**: `noopStepArtifact` singleton in `src/core/step/noop-capabilities.ts` implements all required methods; preserves absent-runtime behavior.

**`StepIoValidationCapability`** — verified in `src/core/step/step-capability.ts`:
- Methods: `validateStepInputs`, `validateStepOutputs`, `verifyFindingRefs` — all required, all typed.
- `step-completion.ts` uses `deps.stepIo.verifyFindingRefs(...)` directly — confirmed at lines 256, 274.
- `commit-orchestrator.ts` uses `deps.stepArtifact.digestArtifacts(...)` and `deps.revisionContent` directly — no `deps.runtimeStrategy` reference.

---

### Req: Terminal state capability carries typed parameters

**`TerminalStateCapability`** — verified in `src/core/pipeline/pipeline-capability.ts`:
- Interface: `commitFinalState(cwd: string, slug: string, state: JobState): Promise<void>` — no `unknown`.
- **Scenario "Pipeline calls commitFinalState with extracted primitives"**: `pipeline.ts` line 400: `await deps.terminalState.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)` (awaiting-archive transition). Line 625: same pattern (awaiting-resume).
- **Scenario "CommandRunner gate-halt uses terminalState capability"**: `runner.ts` line 323: `await deps.terminalState.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, haltState)` — confirmed.

---

### Req: Round git effects capability is consumer-owned and typed

**`RoundGitEffectsCapability`** — verified in `src/core/pipeline/pipeline-capability.ts`:
- `commitRoundArtifacts(stagePaths, cwd, branch, coordinatorName, slug, infra: CommitPushInfra, egressParams?: RoundEgressParams): Promise<void>` — typed, no `unknown`.
- `RoundEgressParams` DTO defined in same file: `{ synthesizedCommits: readonly string[]; pushCapability?: PushCapability | null; excludeWorktreePatterns?: string[] }`.
- **Scenario "ParallelReviewRound calls commitRoundArtifacts with typed infra"**: `parallel-review-round.ts` imports `ParallelReviewRoundDeps` and calls `deps.roundGitEffects.commitRoundArtifacts(...)` with typed `infra: CommitPushInfra` — confirmed; no `as CommitPushInfra` cast.
- `noopRoundGitEffects` singleton in `noop-capabilities.ts` implements all 5 required methods.

---

### Req: buildDeps returns typed PipelineDeps without a cast

- **`PipelineDepsBuilder`** interface declared in `src/core/types.ts` (lines 168–179): `buildDeps(config: SpecRunnerConfig, request: ParsedRequest, slug: string, workspace: WorkspaceContext): PipelineDeps`.
- **`CommandRunner` constructor**: `protected readonly runtime: RuntimeStrategy & PipelineDepsBuilder` — confirmed in `runner.ts` line 90.
- **`runner.ts` line 222**: `deps = this.runtime.buildDeps(config, request, slug, workspace)` — no `as PipelineDeps` cast.
- **Scenario "RuntimeStrategy port has no domain import"**: `src/core/port/runtime-strategy.ts` imports only from `./agent-runner.js`, `../../config/schema.js`, `../../state/schema.js`, `../../state/artifact-types.js`, `./output-contract.js` — no `../types.js` import. No `buildDeps` declaration in `RuntimeStrategy` interface.
- **`tests/unit/architecture/arch-allowlist.ts`**: No entry for `src/core/port/runtime-strategy.ts` — confirmed; the former `T-05-T-12-buildDeps-PipelineDeps-return-type` entry has been removed.

---

### Req: PipelineDeps does not hold a full RuntimeStrategy facade field

- `PipelineDeps` in `src/core/types.ts`: no `runtimeStrategy?: RuntimeStrategy` field — confirmed.
- Four mutation/lifecycle capability fields are required non-nullable: `stepArtifact: StepArtifactLifecycleCapability`, `stepIo: StepIoValidationCapability`, `terminalState: TerminalStateCapability`, `roundGitEffects: RoundGitEffectsCapability`.
- Three R2a read-only capability fields remain optional: `changedFiles?`, `commitInspection?`, `revisionContent?`.
- **Scenario "PipelineDeps capability fields are narrow"**: test fakes now inject `stepArtifact: { ... }` only — no need to provide `bootstrapJob` etc. Confirmed in `executor-lifecycle-ordering.test.ts` and other test files using `noopStepArtifact`.

---

### Req: Major consumers accept consumer-owned composite deps

- **`StepExecutionDeps`** = `Pick<PipelineDeps, "config" | "slug" | "cwd" | ... | "stepArtifact" | "stepIo" | ..."roundOwnsGitEffects" | ...>` — declared in `types.ts`. Does NOT include `terminalState` or `roundGitEffects`.
- **`ParallelReviewRoundDeps`** = same as StepExecutionDeps + `roundGitEffects`.
- **`PipelineOrchestrationDeps`** = ParallelReviewRoundDeps + `terminalState`.
- **`StepExecutor.execute`**: `deps: StepExecutionDeps` — confirmed in `executor.ts` line 177.
- **`StepExecutor.runAgentStep`**: `deps: StepExecutionDeps` — confirmed.
- **`ParallelReviewRound.run`**: `deps: ParallelReviewRoundDeps` — confirmed in `parallel-review-round.ts` line 91.
- **`Pipeline.run` / `runInternal`**: `deps: PipelineOrchestrationDeps` — confirmed in `pipeline.ts` lines 139, 202.
- All composites are `Pick<PipelineDeps, ...>` — `PipelineDeps` is a structural superset, so it assigns to each composite without casts.

---

### Req: LocalRuntime.buildDeps injects all capabilities

- **`LocalRuntime.buildDeps`** in `local.ts`: injects `stepArtifact` (via `deriveStepArtifactLifecycleCapability`), `stepIo` (via `deriveStepIoValidationCapability`), `terminalState` (via `deriveTerminalStateCapability`), `roundGitEffects` (via `deriveRoundGitEffectsCapability`), `changedFiles`, `commitInspection`, `revisionContent` — confirmed by grepping `buildDeps` call sites and the capability build in `local.ts`.
- Derive helpers are defined in the consumer-domain files (`step-capability.ts`, `pipeline-capability.ts`) per D5.
- `LocalRuntime.finalizeStepArtifacts` signature is typed: `(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra): Promise<void>` — confirmed.
- `LocalRuntime.commitFinalState(cwd: string, slug: string, state: JobState)` — confirmed.
- `LocalRuntime.commitRoundArtifacts(stagePaths, cwd, branch, coordinatorName, slug, infra: CommitPushInfra, egressParams?: RoundEgressParams)` — confirmed, no `unknown` casts.

---

### Req: ManagedRuntime preserves no-op semantics

- `managed-runtime-capabilities.test.ts` provides structural fakes mirroring ManagedRuntime's no-op methods, runs them through derive helpers, and asserts correct no-op return values.
- Tests verify: `captureHeadSha → null`, `prepareStepArtifacts → resolves without side effects`, `finalizeStepArtifacts → resolves without side effects`, `commitFinalState → resolves without side effects`, `listWorktreeChanges → { kind:"success", paths:[] }`.
- TC-028 tests real `ManagedRuntime.buildDeps` injection of all R2b capability fields.

---

### Req: Capability methods are required; absence via undefined field

- `StepArtifactLifecycleCapability`: all 5 methods required, including `snapshotMainCheckoutGuard` — confirmed in `step-capability.ts`.
- `StepIoValidationCapability`: all 3 methods required.
- `TerminalStateCapability`: 1 method required.
- `RoundGitEffectsCapability`: all 5 methods required (including `listWorktreeChanges` and `commitRoundArtifacts`).
- The four mutation/lifecycle fields (`stepArtifact`, `stepIo`, `terminalState`, `roundGitEffects`) are non-nullable in `PipelineDeps`.
- `noop-capabilities.ts` provides four singletons (`noopStepArtifact`, `noopStepIo`, `noopTerminalState`, `noopRoundGitEffects`) for test injection.

---

### Req: R2a read-only capabilities injected directly

- **`adr-gen.ts`**: accepts `commitInspection: CommitInspectionCapability | undefined` (line 182) — no `RuntimeStrategy` parameter.
- **`custom-reviewer.ts`**: accepts `commitInspection: CommitInspectionCapability | undefined` (line 146) — no `RuntimeStrategy` parameter.
- **`spec-review.ts`**: accepts `commitInspection: CommitInspectionCapability | undefined` (line 104) — no `RuntimeStrategy` parameter.
- `commit-orchestrator.ts` uses `deps.revisionContent` directly at line 365 — no `deriveRevisionContentCapability(deps.runtimeStrategy)` call.

---

### Req: Command lifecycle ordering preserved

- `CommandRunner.execute` sequence: (1) `prepare()`, (2) `setupWorkspace()`, (3) `buildDeps()`, (4) `registerCleanup()`, (5) `runPipeline()` — unchanged in `runner.ts`.
- Provider readiness fires in `prepare()` before workspace creation — confirmed.
- Duplicate-job guard fires in `prepare()` before `bootstrapJob` — confirmed.
- `buildDeps` at line 222 (step 3), `registerCleanup` at line 247 (step 4) — ordering preserved.
- `reloadJobState` fires after `setupWorkspace` on run path, skipped on resume path — unchanged.

---

### Req: Step finalize lifecycle ordering preserved

- `executor-lifecycle-ordering.test.ts` (T-15): new test file with executable lifecycle ordering tests.
  - **TC-T15-01**: finalizeStepArtifacts receives `cwd` and `slug` as string primitives (not a `deps` object).
  - **TC-T15-02**: finalizeStepArtifacts NOT called when `deps.roundOwnsGitEffects === true`.
- Terminal commit ordering tests verify `deps.terminalState.commitFinalState` called after `awaiting-archive` / `awaiting-resume` transition.

---

### Req: Local/Managed capability contract tests

- **`local-runtime-capabilities.test.ts`** (T-14): derives all four capabilities from structural fakes mirroring LocalRuntime, verifies all required methods are present and callable.
- **`managed-runtime-capabilities.test.ts`** (T-14): same for ManagedRuntime, with assertions on no-op return values.
- Tests cover: `TC-T14-01` through `TC-T14-M09` (multiple tests per capability).

---

### Req: Architecture documentation updated

- `architecture/components.md` updated:
  - RuntimeStrategy described as "composition-root 向け facade" with note that domain orchestration consumers do not depend on it directly.
  - `PipelineDeps は capability の集合体（service locator ではない）` — explicit statement.
  - `PipelineDeps.runtimeStrategy は廃止（R2b）` — noted.
  - References to `step-capability.ts` and `pipeline-capability.ts` for R2b capabilities.
  - Local/Managed behavioral differences stated to be confined to concrete runtime / adapter implementations.

---

### Req: SpecRunner verification green

- `verification-result.md` (iter 1): **passed** — build (0.6s), typecheck (15.7s), test (99.4s), lint (14.8s), changed-line-coverage (122.1s).

---

### Acceptance Criteria Review

| Criterion | Status |
|-----------|--------|
| 対象 consumer が mutation / lifecycle 用に full `RuntimeStrategy` を要求しない | ✅ StepExecutor/ParallelReviewRound/Pipeline use narrow capability fields |
| `PipelineDeps` が full runtime facade を mutation consumer 向け service locator として保持しない | ✅ `runtimeStrategy` field removed; 4 typed capability fields added |
| capability が use-case-specific な最小契約であり、新しい mega-interface を作っていない | ✅ 4 narrow interfaces, each < 6 methods |
| capability method は required で、能力不在は注入値で表現される | ✅ All methods required; absence = undefined field |
| `buildDeps` / `finalizeStepArtifacts` / `commitFinalState` / `commitRoundArtifacts` の対象 payload signature に domain object を表す `unknown` が残らない | ✅ All four signatures have typed parameters |
| 対象境界の `as PipelineDeps`、`as CommitPushInfra`、egress params 復元 cast が除去される | ✅ Confirmed removed |
| 新たな `as unknown as RuntimeStrategy` または同等の forced cast を追加していない | ✅ Count decreased from 4 to 2 (both remaining in out-of-scope e2e) |
| R2a の read-only leaf consumer が full facade 依存へ戻っていない | ✅ adr-gen/custom-reviewer/spec-review use `commitInspection` directly |
| command lifecycle、step finalize、terminal commit、round-owned git effects の順序と失敗境界が executable test で固定される | ✅ executor-lifecycle-ordering.test.ts (T-15) + managed/local capability contract tests |
| Local/Managed capability contract test、または同等の executable proof がある | ✅ local-runtime-capabilities.test.ts, managed-runtime-capabilities.test.ts |
| architecture 文書が実装後の責務と依存方向に一致する | ✅ components.md updated with R2b description |
| SpecRunner verification が green | ✅ All 4 phases passed |
| 変更ファイルだけが commit され、scope 外の未追跡ファイルを含めない | ✅ 209 files changed, all in-scope |

---

## Summary

All normative requirements from `spec.md` and all acceptance criteria from `request.md` are satisfied. No findings.
