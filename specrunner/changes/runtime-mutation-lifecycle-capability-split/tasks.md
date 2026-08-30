# Tasks: RuntimeStrategy mutation/lifecycle capability split (R2b)

## T-01: Baseline audit and metric capture

- [ ] Record the current baseline (against `main@660d48fb`) for all required before/after metrics:
  - `src/core/port/runtime-strategy.ts` line count and `unknown` token count
  - `RuntimeStrategy` method count (base interface)
  - Count of production files importing `RuntimeStrategy` directly
  - Count of mutation/lifecycle full-interface consumers (files using `PipelineDeps.runtimeStrategy` for mutation)
  - Count of `PipelineDeps.runtimeStrategy` call sites in production code
  - Count of domain-payload `unknown` in the 4 target signatures
  - Count of `as PipelineDeps` / `as CommitPushInfra` / egress-params restore casts
  - Confirm `as unknown as RuntimeStrategy` is still 4 occurrences in e2e test files only (out of scope)
- [ ] Note: these are for PR documentation; do not make code changes in this task

**Acceptance Criteria**:
- Before-state metrics are written down (can be in a draft PR comment or a local scratch file reviewed during PR creation)
- All four target signatures confirmed with exact `unknown` token positions matching the fact-check attestation

---

## T-02: Define step-layer capability interfaces

- [ ] Create `src/core/step/step-capability.ts` (new file)
- [ ] Define `StepArtifactLifecycleCapability` interface with required methods:
  - `captureHeadSha(cwd: string): Promise<string | null>`
  - `prepareStepArtifacts(cwd: string, slug: string, stepName: string, state: JobState): Promise<void>`
  - `finalizeStepArtifacts(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra): Promise<void>`
  - `snapshotMainCheckoutGuard?(cwd: string, config: SpecRunnerConfig): Promise<MainCheckoutGuardSnapshot | null>` (optional: fail-open semantics require null result, not capability absence)
  - `digestArtifacts(refs: { path: string }[], cwd: string, branch: string | null): Promise<ArtifactRef[]>`
- [ ] Define `StepIoValidationCapability` interface with required methods:
  - `validateStepInputs(inputs: RequiredInput[], cwd: string, branch: string | null): Promise<void>`
  - `validateStepOutputs(contracts: OutputContract[], cwd: string, branch: string | null, excludeWorktreePatterns?: string[]): Promise<OutputCheckResult>`
  - `verifyFindingRefs(refs: FindingRef[], cwd: string, branch: string | null): Promise<FindingRef[]>`
- [ ] Ensure all imported types (AgentStep, CommitPushInfra, JobState, ArtifactRef, RequiredInput, OutputContract, OutputCheckResult, FindingRef, MainCheckoutGuardSnapshot, SpecRunnerConfig) are correctly imported from their source modules
- [ ] Verify TypeScript compiles with the new file (`bun run typecheck`)

**Acceptance Criteria**:
- `StepArtifactLifecycleCapability` and `StepIoValidationCapability` compile without errors
- No method in either interface uses `unknown` for domain payloads
- `snapshotMainCheckoutGuard?` is the only optional method (fail-open semantics)

---

## T-03: Define pipeline-layer capability interfaces

- [ ] Create `src/core/pipeline/pipeline-capability.ts` (new file)
- [ ] Define `RoundEgressParams` interface (domain-neutral DTO):
  - `synthesizedCommits: readonly string[]`
  - `pushCapability?: PushCapability | null`
  - `excludeWorktreePatterns?: string[]`
- [ ] Define `TerminalStateCapability` interface:
  - `commitFinalState(cwd: string, slug: string, state: JobState): Promise<void>`
- [ ] Define `RoundGitEffectsCapability` interface with required methods:
  - `captureHeadSha(cwd: string): Promise<string | null>`
  - `listWorktreeChanges(cwd: string): Promise<WorktreeInspectionResult>`
  - `commitRoundArtifacts(stagePaths: string[], cwd: string, branch: string, coordinatorName: string, slug: string, infra: CommitPushInfra, egressParams?: RoundEgressParams): Promise<void>`
  - `digestArtifacts(refs: { path: string }[], cwd: string, branch: string | null): Promise<ArtifactRef[]>`
  - `listChangedFiles(baseBranch: string, cwd: string, branch: string | null): Promise<ChangedFilesResult>`
- [ ] Import all necessary types from their source modules (`CommitPushInfra` from `../step/commit-push.js`, `PushCapability` from `../../git/push-capability.js`, `ArtifactRef` from port, `WorktreeInspectionResult` / `ChangedFilesResult` from port)
- [ ] Verify TypeScript compiles with the new file (`bun run typecheck`)

**Acceptance Criteria**:
- `TerminalStateCapability`, `RoundGitEffectsCapability`, `RoundEgressParams` compile without errors
- All method parameters are concretely typed — no `unknown` for domain payloads
- `commitRoundArtifacts` accepts `infra: CommitPushInfra` and `egressParams?: RoundEgressParams` (not `unknown`)

---

## T-04: Update PipelineDeps — remove runtimeStrategy, add capability fields

- [ ] Open `src/core/types.ts`
- [ ] Remove the `runtimeStrategy?: RuntimeStrategy` field from `PipelineDeps`
- [ ] Remove the `import type { RuntimeStrategy } from "./port/runtime-strategy.js"` import (if RuntimeStrategy is no longer referenced elsewhere in the file; check first)
- [ ] Add typed capability fields to `PipelineDeps`:
  - `stepArtifact?: StepArtifactLifecycleCapability` — import from `./step/step-capability.js`
  - `stepIo?: StepIoValidationCapability` — import from `./step/step-capability.js`
  - `terminalState?: TerminalStateCapability` — import from `./pipeline/pipeline-capability.js`
  - `roundGitEffects?: RoundGitEffectsCapability` — import from `./pipeline/pipeline-capability.js`
  - `changedFiles?: ChangedFilesCapability` — import from `./port/runtime-strategy.js` (already in port, R2a)
  - `commitInspection?: CommitInspectionCapability` — import from `./port/runtime-strategy.js` (R2a)
  - `revisionContent?: RevisionContentCapability` — import from `./port/runtime-strategy.js` (R2a)
- [ ] Add JSDoc comments for each field explaining its use case and which consumers inject it
- [ ] Run `bun run typecheck` — expect compile errors from consumers still using `deps.runtimeStrategy`; those are fixed in subsequent tasks

**Acceptance Criteria**:
- `PipelineDeps` no longer has `runtimeStrategy?: RuntimeStrategy`
- `types.ts` no longer imports `RuntimeStrategy` (unless the import is still needed for another reason — verify)
- Seven capability fields are correctly typed in PipelineDeps with appropriate optionality

---

## T-05: Update RuntimeStrategy port — buildDeps return type + remove unknown methods

- [ ] Open `src/core/port/runtime-strategy.ts`
- [ ] Import `PipelineDeps` from `../types.js` (cycle is now broken since types.ts no longer imports runtime-strategy.ts)
- [ ] Change `buildDeps(config, request, slug, workspace): unknown` to `buildDeps(config, request, slug, workspace): PipelineDeps`
- [ ] Remove `finalizeStepArtifacts` method from the `RuntimeStrategy` interface (consumers now use `StepArtifactLifecycleCapability`)
- [ ] Remove `commitFinalState` method from the `RuntimeStrategy` interface (consumers now use `TerminalStateCapability`)
- [ ] Remove `commitRoundArtifacts` method from the `RuntimeStrategy` interface (consumers now use `RoundGitEffectsCapability`)
- [ ] Update `RealRuntimeStrategy` intersection type: remove `commitRoundArtifacts` override, update to reflect current method set
- [ ] Update the file-level doc comment to no longer mention the `unknown` param rationale for removed methods
- [ ] Run `bun run typecheck` — expect LocalRuntime/ManagedRuntime method mismatch errors for the removed port methods; resolve by updating the runtime implementations in T-06/T-07

**Acceptance Criteria**:
- `buildDeps` returns `PipelineDeps` in the port interface
- `finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` are removed from `RuntimeStrategy` and `RealRuntimeStrategy`
- Zero domain-payload `unknown` remain in the four target signatures (3 methods removed, 1 method return type fixed)
- The file still compiles (or has only the expected downstream errors in runtime implementations)

---

## T-06: Implement capabilities in LocalRuntime + inject into buildDeps

- [ ] Open `src/core/runtime/local.ts`
- [ ] Update `finalizeStepArtifacts` method signature to typed: `(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra): Promise<void>`
  - Remove `const cwd = deps.cwd ?? process.cwd()` extraction (cwd now passed directly)
  - Adapt the `cleanupOutputTemplates(cwd, slug, step.name, state)` call accordingly
  - Adapt `commitAndPush(step, state, ...)` call — assemble a temporary PipelineDeps-like object inline or refactor commitAndPush to accept primitives (see sub-task below)
  - Remove the `as CommitPushInfra` cast (line 931); `infra` is now typed
- [ ] Update `commitFinalState` method signature to typed: `(cwd: string, slug: string, state: JobState): Promise<void>`
  - Remove `const cwd = deps.cwd ?? process.cwd()` and `const slug = deps.slug` extraction
  - Use the directly passed `cwd` and `slug` parameters
  - Remove `deps: unknown` parameter
- [ ] Update `commitRoundArtifacts` method signature to typed: `(stagePaths, cwd, branch, coordinatorName, slug, infra: CommitPushInfra, egressParams?: RoundEgressParams): Promise<void>`
  - Remove `const infra = commitPushInfra as CommitPushInfra` cast (line 931)
  - Remove `const egress = egressParams as ...` cast (line 932)
  - Type `egressParams` as `RoundEgressParams | undefined` directly
- [ ] Update `buildDeps` to:
  - Explicitly return type `PipelineDeps` (not `unknown` via port — already typed in concrete class)
  - Inject all capability fields into the returned object:
    - `stepArtifact: deriveStepArtifactLifecycleCapability(this)`
    - `stepIo: deriveStepIoValidationCapability(this)`
    - `terminalState: deriveTerminalStateCapability(this)`
    - `roundGitEffects: deriveRoundGitEffectsCapability(this)`
    - `changedFiles: deriveChangedFilesCapability(this)` (existing R2a helper pattern)
    - `commitInspection: deriveCommitInspectionCapability(this)` (existing R2a helper)
    - `revisionContent: deriveRevisionContentCapability(this)` (existing R2a helper)
- [ ] Add `derive*Capability` helper functions for each new capability. Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`. Import the helpers into `local.ts`:
  - `deriveStepArtifactLifecycleCapability(runtime)` → defined in `step-capability.ts`; binds `captureHeadSha`, `prepareStepArtifacts`, `finalizeStepArtifacts`, `snapshotMainCheckoutGuard`, `digestArtifacts`
  - `deriveStepIoValidationCapability(runtime)` → defined in `step-capability.ts`; binds `validateStepInputs`, `validateStepOutputs`, `verifyFindingRefs`
  - `deriveTerminalStateCapability(runtime)` → defined in `pipeline-capability.ts`; binds `commitFinalState`
  - `deriveRoundGitEffectsCapability(runtime)` → defined in `pipeline-capability.ts`; binds `captureHeadSha`, `listWorktreeChanges`, `commitRoundArtifacts`, `digestArtifacts`, `listChangedFiles`
- [ ] Verify that `commitAndPush` signature in `commit-push.ts` can be called from the updated `finalizeStepArtifacts`. If `commitAndPush` requires a full `PipelineDeps`, either: (a) extract `cwd`, `slug`, `config`, `pushCapability` and assemble a minimal object, or (b) refactor `commitAndPush` to accept a narrow params interface. Prefer option (a) to minimize scope; document if option (b) is required.
- [ ] Run `bun run typecheck` — fix any resulting type errors in local.ts

**Acceptance Criteria**:
- `LocalRuntime.finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` compile with typed (not `unknown`) parameters
- `as CommitPushInfra` cast removed (was line 931)
- Egress params restore cast removed (was line 932)
- `buildDeps` returns `PipelineDeps` with all seven capability fields populated
- `bun run typecheck` passes for local.ts

---

## T-07: Implement capabilities in ManagedRuntime

- [ ] Open `src/core/runtime/managed.ts`
- [ ] Add or update `finalizeStepArtifacts` with typed signature matching `StepArtifactLifecycleCapability` (existing no-op body preserved)
- [ ] Add or update `commitFinalState` with typed signature `(cwd: string, slug: string, state: JobState)` (existing no-op body preserved)
- [ ] Add or update `commitRoundArtifacts` with typed signature using `CommitPushInfra` and `RoundEgressParams` (existing no-op body preserved)
- [ ] Update `buildDeps` to inject all capability fields into the returned `PipelineDeps`:
  - For managed runtime: inject no-op capability implementations that preserve existing semantics
  - `changedFiles`: inject managed's existing `ChangedFilesCapability` (canDeriveChangedFiles=false)
  - `commitInspection`: inject `deriveCommitInspectionCapability(this)` (existing, returns undefined for managed)
  - `revisionContent`: inject `deriveRevisionContentCapability(this)` (existing, returns null for managed)
  - `roundGitEffects`: inject no-op round effects (listWorktreeChanges returns `{kind:"success", paths:[]}`, commitRoundArtifacts is no-op)
- [ ] Run `bun run typecheck` — fix any resulting type errors in managed.ts

**Acceptance Criteria**:
- `ManagedRuntime.finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` have typed signatures (not `unknown`)
- All existing managed runtime no-op semantics are preserved
- `bun run typecheck` passes for managed.ts

---

## T-08: Update StepExecutor to use capability fields

- [ ] Open `src/core/step/executor.ts`
- [ ] Replace all `deps.runtimeStrategy?.captureHeadSha(...)` with `deps.stepArtifact?.captureHeadSha(...)`
- [ ] Replace `deps.runtimeStrategy?.snapshotMainCheckoutGuard(...)` with `deps.stepArtifact?.snapshotMainCheckoutGuard?(...)`
- [ ] Replace `deps.runtimeStrategy?.prepareStepArtifacts(...)` with `deps.stepArtifact?.prepareStepArtifacts(...)`
- [ ] Replace `deps.runtimeStrategy?.validateStepInputs(...)` with `deps.stepIo?.validateStepInputs(...)`
- [ ] Replace `deps.runtimeStrategy?.validateStepOutputs(...)` with `deps.stepIo?.validateStepOutputs(...)`
- [ ] Replace `deps.runtimeStrategy?.canDeriveChangedFiles?.()` with `deps.changedFiles?.canDeriveChangedFiles?.()`
- [ ] Replace `deps.runtimeStrategy?.listChangedFiles(...)` with `deps.changedFiles?.listChangedFiles(...)`
- [ ] Replace `deps.runtimeStrategy?.finalizeStepArtifacts(step, state, deps, headBeforeStep, this.commitPushInfra)` with `deps.stepArtifact?.finalizeStepArtifacts(step, stateForFinalize, cwd, deps.slug, headForFinalize, this.commitPushInfra)` — extract `cwd = deps.cwd ?? process.cwd()` once at the top of `runAgentStep`
- [ ] Update the `detectNoOp` call: replace `deps.runtimeStrategy` argument with `deps.changedFiles` (already typed as `ChangedFilesCapability` in no-op-detect.ts)
- [ ] Replace `deps.runtimeStrategy` check in the `commitOid` capture after finalize with `deps.stepArtifact`
- [ ] Update `validateRequiredInputs`: replace `deps.runtimeStrategy` guard and call with `deps.stepIo`
- [ ] Remove the `import type { RequiredInput } from "../port/runtime-strategy.js"` if it becomes unused (check if moved to step-capability.ts)
- [ ] Run `bun run typecheck` — fix any remaining type errors

**Acceptance Criteria**:
- `executor.ts` contains no reference to `deps.runtimeStrategy`
- All capability calls use `deps.stepArtifact`, `deps.stepIo`, `deps.changedFiles` as appropriate
- `finalizeStepArtifacts` call passes typed `cwd: string` and `slug: string` (no `deps: unknown`)
- `bun run test` passes for executor unit tests

---

## T-09: Update step-completion.ts, no-op-detect.ts, and commit-orchestrator.ts

- [ ] **step-completion.ts**: Replace `deps.runtimeStrategy.verifyFindingRefs(...)` (lines 256, 274) with `deps.stepIo?.verifyFindingRefs(...) ?? []` — use the `stepIo` capability field. Update the guard condition from `if (deps.runtimeStrategy)` to `if (deps.stepIo)`. Note: only a single `?.` is needed because `verifyFindingRefs` is a required method on `StepIoValidationCapability` (no second `?.` on the method itself).
- [ ] **commit-orchestrator.ts**: Replace `deps.runtimeStrategy.digestArtifacts(...)` (lines 323–324) with `deps.stepArtifact?.digestArtifacts(...)`. Update the guard condition accordingly.
- [ ] **commit-orchestrator.ts**: Replace `deriveRevisionContentCapability(deps.runtimeStrategy)` (line 366) with `deps.revisionContent` (directly from the injected capability field).
- [ ] **adr-gen.ts** (line 183): Replace `runtimeStrategy: RuntimeStrategy | undefined` parameter type with `commitInspection: CommitInspectionCapability | undefined`. Update the body to use `commitInspection` directly instead of calling `deriveCommitInspectionCapability(runtimeStrategy)`.
- [ ] **custom-reviewer.ts** (line 147): Same replacement as adr-gen.ts.
- [ ] **spec-review.ts** (line 105): Same replacement as adr-gen.ts.
- [ ] Update all callers of adr-gen, custom-reviewer, spec-review that pass `runtimeStrategy` to pass `deps.commitInspection` instead (search for call sites via the build step factory / step construction code)
- [ ] Run `bun run typecheck` to verify

**Acceptance Criteria**:
- `step-completion.ts`, `commit-orchestrator.ts` reference `deps.stepArtifact` / `deps.stepIo` / `deps.revisionContent` — no `deps.runtimeStrategy`
- `adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts` accept `CommitInspectionCapability | undefined` — no `RuntimeStrategy` parameter type
- `bun run typecheck` passes

---

## T-10: Update Pipeline terminal commit to use TerminalStateCapability

- [ ] Open `src/core/pipeline/pipeline.ts`
- [ ] Replace line 399: `await deps.runtimeStrategy?.commitFinalState(deps, state)` → `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)`
- [ ] Replace line 623 (second occurrence): same replacement
- [ ] Run `bun run typecheck` and `bun run test` on pipeline tests

**Acceptance Criteria**:
- `pipeline.ts` contains no reference to `deps.runtimeStrategy`
- `commitFinalState` is called with `(cwd: string, slug: string, state: JobState)` — no `deps: PipelineDeps` forwarded
- Existing pipeline tests pass

---

## T-11: Update ParallelReviewRound to use RoundGitEffectsCapability

- [ ] Open `src/core/pipeline/parallel-review-round.ts`
- [ ] Replace all `deps.runtimeStrategy?.captureHeadSha(...)` with `deps.roundGitEffects?.captureHeadSha(...)`
- [ ] Replace `deps.runtimeStrategy?.digestArtifacts(...)` with `deps.roundGitEffects?.digestArtifacts(...)`
- [ ] Replace `deps.runtimeStrategy?.listChangedFiles(...)` with `deps.roundGitEffects?.listChangedFiles(...)`
- [ ] Replace `deps.runtimeStrategy?.listWorktreeChanges(...)` with `deps.roundGitEffects?.listWorktreeChanges(...)`
- [ ] Replace `deps.runtimeStrategy?.commitRoundArtifacts?.(stagePaths, cwd, branch, coordinatorName, deps.slug, infra, { synthesizedCommits: ..., pushCapability: ..., excludeWorktreePatterns: ... })` with `deps.roundGitEffects?.commitRoundArtifacts(stagePaths, cwd, branch, coordinatorName, deps.slug, infra, egressParams)` where `egressParams: RoundEgressParams` is constructed inline
- [ ] Replace `if (deps.runtimeStrategy?.listWorktreeChanges)` guard with `if (deps.roundGitEffects?.listWorktreeChanges)` or simply `if (deps.roundGitEffects)`
- [ ] Ensure `CommitPushInfra` import remains in `parallel-review-round.ts` (it's still used for the local `infra` construction)
- [ ] Import `RoundEgressParams` from `./pipeline-capability.js`
- [ ] Run `bun run typecheck` and parallel-review-round tests

**Acceptance Criteria**:
- `parallel-review-round.ts` contains no reference to `deps.runtimeStrategy`
- `commitRoundArtifacts` call passes typed `infra: CommitPushInfra` and `egressParams: RoundEgressParams` (no `unknown`)
- All parallel-review-round tests pass

---

## T-12: Update CommandRunner and PipelineRunCommand

- [ ] Open `src/core/command/runner.ts`
- [ ] Remove the `as PipelineDeps` cast (line 222): `deps = this.runtime.buildDeps(...) as PipelineDeps` → `deps = this.runtime.buildDeps(...)` (return type is now `PipelineDeps`)
- [ ] Replace gate-halt path (line ~322): `await deps.runtimeStrategy?.commitFinalState(deps, haltState)` → `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, haltState)`
- [ ] Open `src/core/command/pipeline-run.ts`
- [ ] Verify that `pipeline-run.ts` uses `this.runtime.assertNoDuplicateLiveJob` and `this.runtime.bootstrapJob` via the full RuntimeStrategy interface (these are expected to remain on RuntimeStrategy — no change needed)
- [ ] Run `bun run typecheck`

**Acceptance Criteria**:
- `runner.ts` has no `as PipelineDeps` cast
- `runner.ts` gate-halt path uses `deps.terminalState?.commitFinalState(cwd, slug, state)` — not `deps.runtimeStrategy?.commitFinalState`
- `bun run typecheck` passes

---

## T-13: Update all test fakes from runtimeStrategy to capability fields

- [ ] Search for `runtimeStrategy:` in all test files under `src/core/**/__tests__/`
- [ ] For each test file, identify which capability the fake is testing:
  - `{ captureHeadSha, prepareStepArtifacts, finalizeStepArtifacts, ... }` → migrate to `stepArtifact: { ... }`
  - `{ validateStepInputs, validateStepOutputs, verifyFindingRefs }` → migrate to `stepIo: { ... }`
  - `{ commitFinalState }` → migrate to `terminalState: { ... }`
  - `{ listWorktreeChanges, commitRoundArtifacts, ... }` → migrate to `roundGitEffects: { ... }`
  - `{ listChangedFiles, canDeriveChangedFiles }` → migrate to `changedFiles: { ... }`
  - `{ digestArtifacts }` + coordinator use → migrate to `roundGitEffects: { ... }` or `stepArtifact: { ... }` as appropriate
- [ ] Key test files to update (non-exhaustive; TypeScript errors will guide):
  - `src/core/step/__tests__/executor-oid-capture.test.ts`
  - `src/core/step/__tests__/executor-commit-mutex.test.ts`
  - `src/core/step/__tests__/executor-drift-detection.test.ts`
  - `src/core/step/__tests__/executor-no-op.test.ts`
  - `src/core/step/__tests__/step-completion-missing-file-finding.test.ts`
  - `src/core/step/__tests__/lineage-output-attribution.test.ts`
  - `src/core/pipeline/__tests__/parallel-review-round-git-effects.test.ts`
  - `src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts`
  - `src/core/pipeline/__tests__/parallel-review-round-canon.test.ts`
  - Any pipeline.test.ts / pipeline integration tests that mock runtimeStrategy
- [ ] Remove `as unknown as PipelineDeps["runtimeStrategy"]` / `as RuntimeStrategy` casts in test fakes after migration
- [ ] Do NOT change the 4 `as unknown as RuntimeStrategy` occurrences in full-pipeline e2e tests (pipeline-integration.test.ts, custom-reviewers-e2e.test.ts, pipeline-sole-committer-e2e.test.ts) — these are out of scope per the request
- [ ] Run `bun run test` to verify all test suites pass

**Acceptance Criteria**:
- All test fakes that previously used `runtimeStrategy: { ... }` now use the appropriate capability field(s)
- No `as unknown as PipelineDeps["runtimeStrategy"]` or similar test-fake casts remain (other than the 4 out-of-scope e2e tests)
- `bun run test` passes

---

## T-14: Add capability contract tests for LocalRuntime and ManagedRuntime

- [ ] Create `src/core/runtime/__tests__/local-runtime-capabilities.test.ts`:
  - Verify `LocalRuntime` satisfies `StepArtifactLifecycleCapability` (all required methods present and typed)
  - Verify `LocalRuntime` satisfies `StepIoValidationCapability`
  - Verify `LocalRuntime` satisfies `TerminalStateCapability`
  - Verify `LocalRuntime` satisfies `RoundGitEffectsCapability`
  - At minimum: compile-time proof via `const _: StepArtifactLifecycleCapability = localRuntime`-style assignment, or a small runtime test that calls each method stub
- [ ] Create `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts`:
  - Same shape as local test, covering ManagedRuntime
  - Include tests that verify no-op semantics: `prepareStepArtifacts` resolves without side effects, `commitFinalState` resolves without side effects, `listWorktreeChanges` returns `{kind:"success", paths:[]}`
- [ ] Ensure negative test or compile-time proof for capability absence: verify that a PipelineDeps with `terminalState: undefined` compiles and that the consumer guard (`deps.terminalState?.commitFinalState`) evaluates correctly

**Acceptance Criteria**:
- Contract test files compile and pass
- Each capability interface is proven to be satisfied by both LocalRuntime and ManagedRuntime
- Managed no-op semantics are verified with at least one assertion per no-op method

---

## T-15: Add executable lifecycle ordering tests

Per Acceptance Criteria of the request: command lifecycle, step finalize, terminal commit, round-owned git effects ordering must be fixed in executable tests.

- [ ] **Command lifecycle ordering** — add tests or verify existing tests cover:
  - Provider readiness check fires before workspace setup (no worktree created on readiness failure)
  - Duplicate-job guard fires before bootstrapJob
  - `buildDeps` result is typed `PipelineDeps` (no cast needed)
  - `reloadJobState` fires after setupWorkspace on the run path, skipped on resume path
- [ ] **Step finalize ordering** — add/verify tests:
  - `prepareStepArtifacts` called before agent run (via `deps.stepArtifact`)
  - `finalizeStepArtifacts` NOT called when `deps.roundOwnsGitEffects === true`
  - `finalizeStepArtifacts` called with `cwd`, `slug` as string primitives (not `deps: unknown`)
- [ ] **Terminal commit ordering** — add/verify tests:
  - `deps.terminalState?.commitFinalState` called after `awaiting-archive` transition persisted to store
  - `deps.terminalState` called in gate-halt path with correct `cwd` and `slug`
- [ ] **Round git effects ordering** — verify existing parallel-review-round tests cover:
  - `captureHeadSha` before fan-out (via `deps.roundGitEffects`)
  - `listWorktreeChanges` after fan-out
  - `commitRoundArtifacts` called only when `toStage` is non-empty

**Acceptance Criteria**:
- At least one executable test per lifecycle boundary listed above
- Tests use the new capability field pattern (not `deps.runtimeStrategy`)
- `bun run test` passes

---

## T-16: Full typecheck + test run

- [ ] Run `bun run typecheck` — must pass with zero errors
- [ ] Run `bun run build` — must pass
- [ ] Run `bun run test` — must pass
- [ ] Run `bun run lint` — must pass
- [ ] If any failures: fix and iterate

**Acceptance Criteria**:
- All four verification commands pass
- No `unknown` cast patterns for domain payloads introduced in this change
- No regression in existing test coverage

---

## T-17: Update architecture/components.md and collect PR metrics

- [ ] Open `architecture/components.md`
- [ ] Update the `RuntimeStrategy` section to reflect:
  - `RuntimeStrategy` is a composition-root facade (not a service locator for domain consumers)
  - Read-only leaf capabilities (R2a): `ChangedFilesCapability`, `CommitInspectionCapability`, `RevisionContentCapability`
  - Mutation/lifecycle capabilities (R2b): `StepArtifactLifecycleCapability`, `StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability`
- [ ] Update the `PipelineDeps` section to reflect:
  - `PipelineDeps` is not a runtime facade service locator
  - Capability fields replace the former `runtimeStrategy` field
- [ ] Document that Local/Managed behavioral differences are confined to concrete runtime / adapter implementations
- [ ] Collect after-state metrics for the PR body (mirror the T-01 before-state):
  - `src/core/port/runtime-strategy.ts` line count and `unknown` token count (expect significant reduction)
  - `RuntimeStrategy` method count (after removing 3 methods)
  - Production `RuntimeStrategy` import count (may decrease slightly from capability migrations)
  - Mutation/lifecycle full-interface consumer count (should be 0)
  - `PipelineDeps.runtimeStrategy` call sites in production (should be 0)
  - Domain-payload `unknown` in 4 target signatures (should be 0)
  - `as PipelineDeps` / `as CommitPushInfra` / egress-params restore casts (should be 0)
  - Capability-level: production consumer count per capability, test fake count per capability

**Acceptance Criteria**:
- `architecture/components.md` accurately describes the post-R2b responsibility and dependency model
- All before/after metrics are documented in the PR body
- Monotone decrease confirmed: no new domain-payload `unknown`, no new broad facade casts added
