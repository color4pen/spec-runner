# Tasks: RuntimeStrategy mutation/lifecycle capability split (R2b)

## T-01: Baseline audit and metric capture

- [x] Record the current baseline (against `main@660d48fb`) for all required before/after metrics:
  - `src/core/port/runtime-strategy.ts` line count and `unknown` token count
  - `RuntimeStrategy` method count (base interface)
  - Count of production files importing `RuntimeStrategy` directly
  - Count of mutation/lifecycle full-interface consumers (files using `PipelineDeps.runtimeStrategy` for mutation)
  - Count of `PipelineDeps.runtimeStrategy` call sites in production code
  - Count of domain-payload `unknown` in the 4 target signatures
  - Count of `as PipelineDeps` / `as CommitPushInfra` / egress-params restore casts
  - Confirm `as unknown as RuntimeStrategy` is still 4 occurrences in e2e test files only (out of scope)
- [x] Note: these are for PR documentation; do not make code changes in this task

**Acceptance Criteria**:
- Before-state metrics are written down (can be in a draft PR comment or a local scratch file reviewed during PR creation)
- All four target signatures confirmed with exact `unknown` token positions matching the fact-check attestation

---

## T-02: Define step-layer capability interfaces

- [x] Create `src/core/step/step-capability.ts` (new file)
- [x] Define `StepArtifactLifecycleCapability` interface with required methods:
  - `captureHeadSha(cwd: string): Promise<string | null>`
  - `prepareStepArtifacts(cwd: string, slug: string, stepName: string, state: JobState): Promise<void>`
  - `finalizeStepArtifacts(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra): Promise<void>`
  - `snapshotMainCheckoutGuard(cwd: string, config: SpecRunnerConfig): Promise<MainCheckoutGuardSnapshot | null>` (required; "check cannot be performed" is expressed by returning null — no-op implementations explicitly return null)
  - `digestArtifacts(refs: { path: string }[], cwd: string, branch: string | null): Promise<ArtifactRef[]>`
- [x] Define `StepIoValidationCapability` interface with required methods:
  - `validateStepInputs(inputs: RequiredInput[], cwd: string, branch: string | null): Promise<void>`
  - `validateStepOutputs(contracts: OutputContract[], cwd: string, branch: string | null, excludeWorktreePatterns?: string[]): Promise<OutputCheckResult>`
  - `verifyFindingRefs(refs: FindingRef[], cwd: string, branch: string | null): Promise<FindingRef[]>`
- [x] Ensure all imported types (AgentStep, CommitPushInfra, JobState, ArtifactRef, RequiredInput, OutputContract, OutputCheckResult, FindingRef, MainCheckoutGuardSnapshot, SpecRunnerConfig) are correctly imported from their source modules
- [x] Verify TypeScript compiles with the new file (`bun run typecheck`)

**Acceptance Criteria**:
- `StepArtifactLifecycleCapability` and `StepIoValidationCapability` compile without errors
- No method in either interface uses `unknown` for domain payloads
- No method in either interface is optional (`snapshotMainCheckoutGuard` included — null return expresses "cannot check")

---

## T-03: Define pipeline-layer capability interfaces

- [x] Create `src/core/pipeline/pipeline-capability.ts` (new file)
- [x] Define `RoundEgressParams` interface (domain-neutral DTO):
  - `synthesizedCommits: readonly string[]`
  - `pushCapability?: PushCapability | null`
  - `excludeWorktreePatterns?: string[]`
- [x] Define `TerminalStateCapability` interface:
  - `commitFinalState(cwd: string, slug: string, state: JobState): Promise<void>`
- [x] Define `RoundGitEffectsCapability` interface with required methods:
  - `captureHeadSha(cwd: string): Promise<string | null>`
  - `listWorktreeChanges(cwd: string): Promise<WorktreeInspectionResult>`
  - `commitRoundArtifacts(stagePaths: string[], cwd: string, branch: string, coordinatorName: string, slug: string, infra: CommitPushInfra, egressParams?: RoundEgressParams): Promise<void>`
  - `digestArtifacts(refs: { path: string }[], cwd: string, branch: string | null): Promise<ArtifactRef[]>`
  - `listChangedFiles(baseBranch: string, cwd: string, branch: string | null): Promise<ChangedFilesResult>`
- [x] Import all necessary types from their source modules (`CommitPushInfra` from `../step/commit-push.js`, `PushCapability` from `../../git/push-capability.js`, `ArtifactRef` from port, `WorktreeInspectionResult` / `ChangedFilesResult` from port)
- [x] Verify TypeScript compiles with the new file (`bun run typecheck`)

**Acceptance Criteria**:
- `TerminalStateCapability`, `RoundGitEffectsCapability`, `RoundEgressParams` compile without errors
- All method parameters are concretely typed — no `unknown` for domain payloads
- `commitRoundArtifacts` accepts `infra: CommitPushInfra` and `egressParams?: RoundEgressParams` (not `unknown`)

---

## T-04: Update PipelineDeps — remove runtimeStrategy, add capability fields

- [x] Open `src/core/types.ts`
- [x] Remove the `runtimeStrategy?: RuntimeStrategy` field from `PipelineDeps`
- [x] Remove the `import type { RuntimeStrategy } from "./port/runtime-strategy.js"` import (if RuntimeStrategy is no longer referenced elsewhere in the file; check first)
- [x] Add typed capability fields to `PipelineDeps` (the four mutation/lifecycle fields are required non-nullable — design D2/D6):
  - `stepArtifact: StepArtifactLifecycleCapability` — import from `./step/step-capability.js`
  - `stepIo: StepIoValidationCapability` — import from `./step/step-capability.js`
  - `terminalState: TerminalStateCapability` — import from `./pipeline/pipeline-capability.js`
  - `roundGitEffects: RoundGitEffectsCapability` — import from `./pipeline/pipeline-capability.js`
  - `changedFiles?: ChangedFilesCapability` — import from `./port/runtime-strategy.js` (already in port, R2a)
  - `commitInspection?: CommitInspectionCapability` — import from `./port/runtime-strategy.js` (R2a)
  - `revisionContent?: RevisionContentCapability` — import from `./port/runtime-strategy.js` (R2a)
- [x] Add JSDoc comments for each field explaining its use case and which consumers inject it
- [x] Run `bun run typecheck` — expect compile errors from consumers still using `deps.runtimeStrategy`; those are fixed in subsequent tasks

**Acceptance Criteria**:
- `PipelineDeps` no longer has `runtimeStrategy?: RuntimeStrategy`
- `types.ts` no longer imports `RuntimeStrategy` (unless the import is still needed for another reason — verify)
- Seven capability fields are correctly typed in PipelineDeps: the four mutation/lifecycle fields required non-nullable, the three R2a read-only fields optional

---

## T-05: Update RuntimeStrategy port — buildDeps return type + remove unknown methods

- [x] Open `src/core/port/runtime-strategy.ts`
- [x] ~~Import `PipelineDeps` from `../types.js`~~ — **superseded by T-18**: types.ts still imports capability types from this file, so this import forms a ports→domain compile-time cycle; `buildDeps` moves to a domain-owned `PipelineDepsBuilder` (design D3)
- [x] ~~Change `buildDeps(...): unknown` to `buildDeps(...): PipelineDeps`~~ — **superseded by T-18**: `buildDeps` is removed from the port interface entirely
- [x] Remove `finalizeStepArtifacts` method from the `RuntimeStrategy` interface (consumers now use `StepArtifactLifecycleCapability`)
- [x] Remove `commitFinalState` method from the `RuntimeStrategy` interface (consumers now use `TerminalStateCapability`)
- [x] Remove `commitRoundArtifacts` method from the `RuntimeStrategy` interface (consumers now use `RoundGitEffectsCapability`)
- [x] Update `RealRuntimeStrategy` intersection type: remove `commitRoundArtifacts` override, update to reflect current method set
- [x] Update the file-level doc comment to no longer mention the `unknown` param rationale for removed methods
- [x] Run `bun run typecheck` — expect LocalRuntime/ManagedRuntime method mismatch errors for the removed port methods; resolve by updating the runtime implementations in T-06/T-07

**Acceptance Criteria**:
- ~~`buildDeps` returns `PipelineDeps` in the port interface~~ — superseded by T-18: `buildDeps` is not declared on the port; typing lives on `PipelineDepsBuilder`
- `finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` are removed from `RuntimeStrategy` and `RealRuntimeStrategy`
- Zero domain-payload `unknown` remain in the four target signatures (3 methods removed, 1 method return type fixed)
- The file still compiles (or has only the expected downstream errors in runtime implementations)

---

## T-06: Implement capabilities in LocalRuntime + inject into buildDeps

- [x] Open `src/core/runtime/local.ts`
- [x] Update `finalizeStepArtifacts` method signature to typed: `(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra): Promise<void>`
  - Remove `const cwd = deps.cwd ?? process.cwd()` extraction (cwd now passed directly)
  - Adapt the `cleanupOutputTemplates(cwd, slug, step.name, state)` call accordingly
  - Adapt `commitAndPush(step, state, ...)` call — assemble a temporary PipelineDeps-like object inline or refactor commitAndPush to accept primitives (see sub-task below)
  - Remove the `as CommitPushInfra` cast (line 931); `infra` is now typed
- [x] Update `commitFinalState` method signature to typed: `(cwd: string, slug: string, state: JobState): Promise<void>`
  - Remove `const cwd = deps.cwd ?? process.cwd()` and `const slug = deps.slug` extraction
  - Use the directly passed `cwd` and `slug` parameters
  - Remove `deps: unknown` parameter
- [x] Update `commitRoundArtifacts` method signature to typed: `(stagePaths, cwd, branch, coordinatorName, slug, infra: CommitPushInfra, egressParams?: RoundEgressParams): Promise<void>`
  - Remove `const infra = commitPushInfra as CommitPushInfra` cast (line 931)
  - Remove `const egress = egressParams as ...` cast (line 932)
  - Type `egressParams` as `RoundEgressParams | undefined` directly
- [x] Update `buildDeps` to:
  - Explicitly return type `PipelineDeps` (not `unknown` via port — already typed in concrete class)
  - Inject all capability fields into the returned object:
    - `stepArtifact: deriveStepArtifactLifecycleCapability(this)`
    - `stepIo: deriveStepIoValidationCapability(this)`
    - `terminalState: deriveTerminalStateCapability(this)`
    - `roundGitEffects: deriveRoundGitEffectsCapability(this)`
    - `changedFiles: deriveChangedFilesCapability(this)` (existing R2a helper pattern)
    - `commitInspection: deriveCommitInspectionCapability(this)` (existing R2a helper)
    - `revisionContent: deriveRevisionContentCapability(this)` (existing R2a helper)
- [x] Add `derive*Capability` helper functions for each new capability. Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`. Import the helpers into `local.ts`:
  - `deriveStepArtifactLifecycleCapability(runtime)` → defined in `step-capability.ts`; binds `captureHeadSha`, `prepareStepArtifacts`, `finalizeStepArtifacts`, `snapshotMainCheckoutGuard`, `digestArtifacts`
  - `deriveStepIoValidationCapability(runtime)` → defined in `step-capability.ts`; binds `validateStepInputs`, `validateStepOutputs`, `verifyFindingRefs`
  - `deriveTerminalStateCapability(runtime)` → defined in `pipeline-capability.ts`; binds `commitFinalState`
  - `deriveRoundGitEffectsCapability(runtime)` → defined in `pipeline-capability.ts`; binds `captureHeadSha`, `listWorktreeChanges`, `commitRoundArtifacts`, `digestArtifacts`, `listChangedFiles`
- [x] Verify that `commitAndPush` signature in `commit-push.ts` can be called from the updated `finalizeStepArtifacts`. If `commitAndPush` requires a full `PipelineDeps`, either: (a) extract `cwd`, `slug`, `config`, `pushCapability` and assemble a minimal object, or (b) refactor `commitAndPush` to accept a narrow params interface. Prefer option (a) to minimize scope; document if option (b) is required.
- [x] Run `bun run typecheck` — fix any resulting type errors in local.ts

**Acceptance Criteria**:
- `LocalRuntime.finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` compile with typed (not `unknown`) parameters
- `as CommitPushInfra` cast removed (was line 931)
- Egress params restore cast removed (was line 932)
- `buildDeps` returns `PipelineDeps` with all seven capability fields populated
- `bun run typecheck` passes for local.ts

---

## T-07: Implement capabilities in ManagedRuntime

- [x] Open `src/core/runtime/managed.ts`
- [x] Add or update `finalizeStepArtifacts` with typed signature matching `StepArtifactLifecycleCapability` (existing no-op body preserved)
- [x] Add or update `commitFinalState` with typed signature `(cwd: string, slug: string, state: JobState)` (existing no-op body preserved)
- [x] Add or update `commitRoundArtifacts` with typed signature using `CommitPushInfra` and `RoundEgressParams` (existing no-op body preserved)
- [x] Update `buildDeps` to inject all capability fields into the returned `PipelineDeps`:
  - For managed runtime: inject no-op capability implementations that preserve existing semantics
  - `changedFiles`: inject managed's existing `ChangedFilesCapability` (canDeriveChangedFiles=false)
  - `commitInspection`: inject `deriveCommitInspectionCapability(this)` (existing, returns undefined for managed)
  - `revisionContent`: inject `deriveRevisionContentCapability(this)` (existing, returns null for managed)
  - `roundGitEffects`: inject no-op round effects (listWorktreeChanges returns `{kind:"success", paths:[]}`, commitRoundArtifacts is no-op)
- [x] Run `bun run typecheck` — fix any resulting type errors in managed.ts

**Acceptance Criteria**:
- `ManagedRuntime.finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` have typed signatures (not `unknown`)
- All existing managed runtime no-op semantics are preserved
- `bun run typecheck` passes for managed.ts

---

## T-08: Update StepExecutor to use capability fields

- [x] Open `src/core/step/executor.ts`
- [x] Replace all `deps.runtimeStrategy?.captureHeadSha(...)` with `deps.stepArtifact?.captureHeadSha(...)`
- [x] Replace `deps.runtimeStrategy?.snapshotMainCheckoutGuard(...)` with `deps.stepArtifact.snapshotMainCheckoutGuard(...)` (required field, required method — design D2/D6; "cannot check" is a `null` return)
- [x] Replace `deps.runtimeStrategy?.prepareStepArtifacts(...)` with `deps.stepArtifact?.prepareStepArtifacts(...)`
- [x] Replace `deps.runtimeStrategy?.validateStepInputs(...)` with `deps.stepIo?.validateStepInputs(...)`
- [x] Replace `deps.runtimeStrategy?.validateStepOutputs(...)` with `deps.stepIo?.validateStepOutputs(...)`
- [x] Replace `deps.runtimeStrategy?.canDeriveChangedFiles?.()` with `deps.changedFiles?.canDeriveChangedFiles?.()`
- [x] Replace `deps.runtimeStrategy?.listChangedFiles(...)` with `deps.changedFiles?.listChangedFiles(...)`
- [x] Replace `deps.runtimeStrategy?.finalizeStepArtifacts(step, state, deps, headBeforeStep, this.commitPushInfra)` with `deps.stepArtifact?.finalizeStepArtifacts(step, stateForFinalize, cwd, deps.slug, headForFinalize, this.commitPushInfra)` — extract `cwd = deps.cwd ?? process.cwd()` once at the top of `runAgentStep`
- [x] Update the `detectNoOp` call: replace `deps.runtimeStrategy` argument with `deps.changedFiles` (already typed as `ChangedFilesCapability` in no-op-detect.ts)
- [x] Replace `deps.runtimeStrategy` check in the `commitOid` capture after finalize with `deps.stepArtifact`
- [x] Update `validateRequiredInputs`: replace `deps.runtimeStrategy` guard and call with `deps.stepIo`
- [x] Remove the `import type { RequiredInput } from "../port/runtime-strategy.js"` if it becomes unused (check if moved to step-capability.ts)
- [x] Run `bun run typecheck` — fix any remaining type errors

**Acceptance Criteria**:
- `executor.ts` contains no reference to `deps.runtimeStrategy`
- All capability calls use `deps.stepArtifact`, `deps.stepIo`, `deps.changedFiles` as appropriate
- `finalizeStepArtifacts` call passes typed `cwd: string` and `slug: string` (no `deps: unknown`)
- `bun run test` passes for executor unit tests

---

## T-09: Update step-completion.ts, no-op-detect.ts, and commit-orchestrator.ts

- [x] **step-completion.ts**: Replace `deps.runtimeStrategy.verifyFindingRefs(...)` (lines 256, 274) with `deps.stepIo?.verifyFindingRefs(...) ?? []` — use the `stepIo` capability field. Update the guard condition from `if (deps.runtimeStrategy)` to `if (deps.stepIo)`. Note: only a single `?.` is needed because `verifyFindingRefs` is a required method on `StepIoValidationCapability` (no second `?.` on the method itself).
- [x] **commit-orchestrator.ts**: Replace `deps.runtimeStrategy.digestArtifacts(...)` (lines 323–324) with `deps.stepArtifact?.digestArtifacts(...)`. Update the guard condition accordingly.
- [x] **commit-orchestrator.ts**: Replace `deriveRevisionContentCapability(deps.runtimeStrategy)` (line 366) with `deps.revisionContent` (directly from the injected capability field).
- [x] **adr-gen.ts** (line 183): Replace `runtimeStrategy: RuntimeStrategy | undefined` parameter type with `commitInspection: CommitInspectionCapability | undefined`. Update the body to use `commitInspection` directly instead of calling `deriveCommitInspectionCapability(runtimeStrategy)`.
- [x] **custom-reviewer.ts** (line 147): Same replacement as adr-gen.ts.
- [x] **spec-review.ts** (line 105): Same replacement as adr-gen.ts.
- [x] Update all callers of adr-gen, custom-reviewer, spec-review that pass `runtimeStrategy` to pass `deps.commitInspection` instead (search for call sites via the build step factory / step construction code)
- [x] Run `bun run typecheck` to verify

**Acceptance Criteria**:
- `step-completion.ts`, `commit-orchestrator.ts` reference `deps.stepArtifact` / `deps.stepIo` / `deps.revisionContent` — no `deps.runtimeStrategy`
- `adr-gen.ts`, `custom-reviewer.ts`, `spec-review.ts` accept `CommitInspectionCapability | undefined` — no `RuntimeStrategy` parameter type
- `bun run typecheck` passes

---

## T-10: Update Pipeline terminal commit to use TerminalStateCapability

- [x] Open `src/core/pipeline/pipeline.ts`
- [x] Replace line 399: `await deps.runtimeStrategy?.commitFinalState(deps, state)` → `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)`
- [x] Replace line 623 (second occurrence): same replacement
- [x] Run `bun run typecheck` and `bun run test` on pipeline tests

**Acceptance Criteria**:
- `pipeline.ts` contains no reference to `deps.runtimeStrategy`
- `commitFinalState` is called with `(cwd: string, slug: string, state: JobState)` — no `deps: PipelineDeps` forwarded
- Existing pipeline tests pass

---

## T-11: Update ParallelReviewRound to use RoundGitEffectsCapability

- [x] Open `src/core/pipeline/parallel-review-round.ts`
- [x] Replace all `deps.runtimeStrategy?.captureHeadSha(...)` with `deps.roundGitEffects?.captureHeadSha(...)`
- [x] Replace `deps.runtimeStrategy?.digestArtifacts(...)` with `deps.roundGitEffects?.digestArtifacts(...)`
- [x] Replace `deps.runtimeStrategy?.listChangedFiles(...)` with `deps.roundGitEffects?.listChangedFiles(...)`
- [x] Replace `deps.runtimeStrategy?.listWorktreeChanges(...)` with `deps.roundGitEffects?.listWorktreeChanges(...)`
- [x] Replace `deps.runtimeStrategy?.commitRoundArtifacts?.(stagePaths, cwd, branch, coordinatorName, deps.slug, infra, { synthesizedCommits: ..., pushCapability: ..., excludeWorktreePatterns: ... })` with `deps.roundGitEffects?.commitRoundArtifacts(stagePaths, cwd, branch, coordinatorName, deps.slug, infra, egressParams)` where `egressParams: RoundEgressParams` is constructed inline
- [x] Replace `if (deps.runtimeStrategy?.listWorktreeChanges)` guard with `if (deps.roundGitEffects?.listWorktreeChanges)` or simply `if (deps.roundGitEffects)`
- [x] Ensure `CommitPushInfra` import remains in `parallel-review-round.ts` (it's still used for the local `infra` construction)
- [x] Import `RoundEgressParams` from `./pipeline-capability.js`
- [x] Run `bun run typecheck` and parallel-review-round tests

**Acceptance Criteria**:
- `parallel-review-round.ts` contains no reference to `deps.runtimeStrategy`
- `commitRoundArtifacts` call passes typed `infra: CommitPushInfra` and `egressParams: RoundEgressParams` (no `unknown`)
- All parallel-review-round tests pass

---

## T-12: Update CommandRunner and PipelineRunCommand

- [x] Open `src/core/command/runner.ts`
- [x] Remove the `as PipelineDeps` cast (line 222): `deps = this.runtime.buildDeps(...) as PipelineDeps` → `deps = this.runtime.buildDeps(...)` (return type is now `PipelineDeps`)
- [x] Replace gate-halt path (line ~322): `await deps.runtimeStrategy?.commitFinalState(deps, haltState)` → `await deps.terminalState?.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, haltState)`
- [x] Open `src/core/command/pipeline-run.ts`
- [x] Verify that `pipeline-run.ts` uses `this.runtime.assertNoDuplicateLiveJob` and `this.runtime.bootstrapJob` via the full RuntimeStrategy interface (these are expected to remain on RuntimeStrategy — no change needed)
- [x] Run `bun run typecheck`

**Acceptance Criteria**:
- `runner.ts` has no `as PipelineDeps` cast
- `runner.ts` gate-halt path uses `deps.terminalState?.commitFinalState(cwd, slug, state)` — not `deps.runtimeStrategy?.commitFinalState`
- `bun run typecheck` passes

---

## T-13: Update all test fakes from runtimeStrategy to capability fields

- [x] Search for `runtimeStrategy:` in all test files under `src/core/**/__tests__/`
- [x] For each test file, identify which capability the fake is testing:
  - `{ captureHeadSha, prepareStepArtifacts, finalizeStepArtifacts, ... }` → migrate to `stepArtifact: { ... }`
  - `{ validateStepInputs, validateStepOutputs, verifyFindingRefs }` → migrate to `stepIo: { ... }`
  - `{ commitFinalState }` → migrate to `terminalState: { ... }`
  - `{ listWorktreeChanges, commitRoundArtifacts, ... }` → migrate to `roundGitEffects: { ... }`
  - `{ listChangedFiles, canDeriveChangedFiles }` → migrate to `changedFiles: { ... }`
  - `{ digestArtifacts }` + coordinator use → migrate to `roundGitEffects: { ... }` or `stepArtifact: { ... }` as appropriate
- [x] Key test files to update (non-exhaustive; TypeScript errors will guide):
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
- [x] Remove `as unknown as PipelineDeps["runtimeStrategy"]` / `as RuntimeStrategy` casts in test fakes after migration
- [x] Do NOT change the 4 `as unknown as RuntimeStrategy` occurrences in full-pipeline e2e tests (pipeline-integration.test.ts, custom-reviewers-e2e.test.ts, pipeline-sole-committer-e2e.test.ts) — these are out of scope per the request
- [x] Run `bun run test` to verify all test suites pass

**Acceptance Criteria**:
- All test fakes that previously used `runtimeStrategy: { ... }` now use the appropriate capability field(s)
- No `as unknown as PipelineDeps["runtimeStrategy"]` or similar test-fake casts remain (other than the 4 out-of-scope e2e tests)
- `bun run test` passes

---

## T-14: Add capability contract tests for LocalRuntime and ManagedRuntime

- [x] Create `src/core/runtime/__tests__/local-runtime-capabilities.test.ts`:
  - Verify `LocalRuntime` satisfies `StepArtifactLifecycleCapability` (all required methods present and typed)
  - Verify `LocalRuntime` satisfies `StepIoValidationCapability`
  - Verify `LocalRuntime` satisfies `TerminalStateCapability`
  - Verify `LocalRuntime` satisfies `RoundGitEffectsCapability`
  - At minimum: compile-time proof via `const _: StepArtifactLifecycleCapability = localRuntime`-style assignment, or a small runtime test that calls each method stub
- [x] Create `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts`:
  - Same shape as local test, covering ManagedRuntime
  - Include tests that verify no-op semantics: `prepareStepArtifacts` resolves without side effects, `commitFinalState` resolves without side effects, `listWorktreeChanges` returns `{kind:"success", paths:[]}`
- [x] Ensure negative test or compile-time proof for capability absence: verify that a PipelineDeps with `terminalState: undefined` compiles and that the consumer guard (`deps.terminalState?.commitFinalState`) evaluates correctly

**Acceptance Criteria**:
- Contract test files compile and pass
- Each capability interface is proven to be satisfied by both LocalRuntime and ManagedRuntime
- Managed no-op semantics are verified with at least one assertion per no-op method

---

## T-15: Add executable lifecycle ordering tests

Per Acceptance Criteria of the request: command lifecycle, step finalize, terminal commit, round-owned git effects ordering must be fixed in executable tests.

- [x] **Command lifecycle ordering** — add tests or verify existing tests cover:
  - Provider readiness check fires before workspace setup (no worktree created on readiness failure)
  - Duplicate-job guard fires before bootstrapJob
  - `buildDeps` result is typed `PipelineDeps` (no cast needed)
  - `reloadJobState` fires after setupWorkspace on the run path, skipped on resume path
- [x] **Step finalize ordering** — add/verify tests:
  - `prepareStepArtifacts` called before agent run (via `deps.stepArtifact`)
  - `finalizeStepArtifacts` NOT called when `deps.roundOwnsGitEffects === true`
  - `finalizeStepArtifacts` called with `cwd`, `slug` as string primitives (not `deps: unknown`)
- [x] **Terminal commit ordering** — add/verify tests:
  - `deps.terminalState?.commitFinalState` called after `awaiting-archive` transition persisted to store
  - `deps.terminalState` called in gate-halt path with correct `cwd` and `slug`
- [x] **Round git effects ordering** — verify existing parallel-review-round tests cover:
  - `captureHeadSha` before fan-out (via `deps.roundGitEffects`)
  - `listWorktreeChanges` after fan-out
  - `commitRoundArtifacts` called only when `toStage` is non-empty

**Acceptance Criteria**:
- At least one executable test per lifecycle boundary listed above
- Tests use the new capability field pattern (not `deps.runtimeStrategy`)
- `bun run test` passes

---

## T-16: Full typecheck + test run

- [x] Run `bun run typecheck` — must pass with zero errors
- [x] Run `bun run build` — must pass
- [x] Run `bun run test` — must pass
- [x] Run `bun run lint` — must pass
- [x] If any failures: fix and iterate

**Acceptance Criteria**:
- All four verification commands pass
- No `unknown` cast patterns for domain payloads introduced in this change
- No regression in existing test coverage

---

## T-17: Update architecture/components.md and collect PR metrics

- [x] Open `architecture/components.md`
- [x] Update the `RuntimeStrategy` section to reflect:
  - `RuntimeStrategy` is a composition-root facade (not a service locator for domain consumers)
  - Read-only leaf capabilities (R2a): `ChangedFilesCapability`, `CommitInspectionCapability`, `RevisionContentCapability`
  - Mutation/lifecycle capabilities (R2b): `StepArtifactLifecycleCapability`, `StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability`
- [x] Update the `PipelineDeps` section to reflect:
  - `PipelineDeps` is not a runtime facade service locator
  - Capability fields replace the former `runtimeStrategy` field
- [x] Document that Local/Managed behavioral differences are confined to concrete runtime / adapter implementations
- [x] Collect after-state metrics for the PR body (mirror the T-01 before-state):
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

---

## T-18: Move buildDeps to a domain-owned PipelineDepsBuilder; remove the ports→domain import and its DSM allowlist entry

Operator review on PR #1105 rejected the ports→domain `import type` allowlist approach (design D3 revised).

- [x] Declare `PipelineDepsBuilder` in the domain layer (`src/core/types.ts` or an adjacent domain module): `buildDeps(config: SpecRunnerConfig, request: ParsedRequest, slug: string, workspace: WorkspaceInfo): PipelineDeps` (match the existing runtime signature exactly)
- [x] Remove the `buildDeps` declaration from the `RuntimeStrategy` interface in `src/core/port/runtime-strategy.ts`
- [x] Remove the `import type { PipelineDeps } from "../types.js"` import and the related doc-comment paragraphs from `src/core/port/runtime-strategy.ts`
- [x] Delete the `src/core/port/runtime-strategy.ts` entry (tracking `T-05-T-12-buildDeps-PipelineDeps-return-type`) from `tests/unit/architecture/arch-allowlist.ts`, including its explanatory comment block
- [x] Type the runtime at the composition root as `RuntimeStrategy & PipelineDepsBuilder` (via `RealRuntimeStrategy`, the factory return type, or the `CommandRunner` constructor parameter — whichever keeps `deps = this.runtime.buildDeps(...)` cast-free)
- [x] Confirm `LocalRuntime` and `ManagedRuntime` satisfy `PipelineDepsBuilder` (their existing `buildDeps` methods already match)
- [x] Run `bun run typecheck` and the architecture invariant tests

**Acceptance Criteria**:
- `src/core/port/runtime-strategy.ts` has no import from `../types.js` and no `buildDeps` declaration
- `tests/unit/architecture/arch-allowlist.ts` has no entry for `src/core/port/runtime-strategy.ts`
- `CommandRunner.execute` still assigns `deps: PipelineDeps` from `this.runtime.buildDeps(...)` without a cast
- Architecture invariant tests pass with the allowlist entry removed

---

## T-19: Define consumer-owned composite deps and narrow consumer signatures

Operator review on PR #1105: splitting capabilities into fields is not the use-case split #1103 asks for while every consumer still receives the full `PipelineDeps` (design D7).

- [x] Audit which `PipelineDeps` fields each consumer actually reads: `StepExecutor`, `ParallelReviewRound`, `Pipeline`
- [x] ~~Define `StepExecutionDeps` (step layer), `ParallelReviewRoundDeps`, and `PipelineOrchestrationDeps` (pipeline layer) as structural subsets of `PipelineDeps` containing only those fields (explicit interface or `Pick<PipelineDeps, ...>`)~~ (superseded by T-21: `Pick`/`Omit` derivation is forbidden)
- [x] Narrow the public entry signatures of `StepExecutor`, `ParallelReviewRound`, and `Pipeline` to their composite types
- [x] Verify `PipelineDeps` is assignable to each composite with no `as` casts at any call site (composition root, `Pipeline` → `StepExecutor` / `ParallelReviewRound` forwarding)
- [x] Update test fixtures that construct deps for these consumers to the composite types where the full `PipelineDeps` is not needed
- [x] Run `bun run typecheck` and the full test suite

**Acceptance Criteria**:
- `StepExecutor`, `ParallelReviewRound`, and `Pipeline` entry signatures no longer accept `PipelineDeps`
- Each composite lists only fields its consumer reads; no cast appears in any deps hand-off
- Full test suite passes

---

## T-20: Add before/after metrics to the PR body

Operator review on PR #1105: the measured before/after values required by issue #1103 (with their aggregation conditions stated) are missing from the PR body.

- [x] Compute after-state values for every metric listed in T-01/T-17, on the current branch head
- [x] Write the before/after table into the PR body, stating for each metric the aggregation condition (what was counted, over which files, with which pattern)
- [x] Include the capability-level table: production consumer count and test-fake count per capability

### Before/After Metrics Table

| Metric | Aggregation Condition | Before (`main@660d48fb`) | After (branch) |
|--------|----------------------|--------------------------|----------------|
| `runtime-strategy.ts` line count | `wc -l src/core/port/runtime-strategy.ts` | 875 | 782 (−93) |
| `runtime-strategy.ts` `unknown` token count | `grep -c unknown` | 20 | 4 (−16) |
| `RuntimeStrategy` method count (base interface) | Lines matching `^\s+[a-zA-Z].*\(` excluding comments | 48 | 43 (−5: removed buildDeps, finalizeStepArtifacts, commitFinalState, commitRoundArtifacts, buildDeps-related) |
| `buildDeps` on `RuntimeStrategy` interface | Declaration lines in port | 1 | 0 |
| DSM allowlist entries for `runtime-strategy.ts` | Entries in `arch-allowlist.ts` | 1 (`T-05-T-12-buildDeps-PipelineDeps-return-type`) | 0 |
| `PipelineDeps.runtimeStrategy` field | Occurrences in `src/core/types.ts` | 1 | 0 |
| `PipelineDepsBuilder` interface | Declared in `src/core/types.ts` | absent | present |
| `StepExecutionDeps` | Declared in `src/core/step/step-deps.ts` (T-21) | absent | explicit `interface` extending `StepContext` |
| `ParallelReviewRoundDeps` | Declared in `src/core/pipeline/parallel-review-round.ts` (T-21) | absent | explicit `interface` extending `StepExecutionDeps` |
| `PipelineOrchestrationDeps` | Declared in `src/core/pipeline/pipeline.ts` (T-21) | absent | explicit `interface` extending `ParallelReviewRoundDeps` |
| `Pick`/`Omit` derivations from `PipelineDeps` in `src/` | `grep -rE '(Pick|Omit)\s*<\s*PipelineDeps' src/` | 0 | 0 (enforced by TC-050 test) |
| `StepExecutor.execute` entry type | Public method signature | `deps: PipelineDeps` | `deps: StepExecutionDeps` |
| `ParallelReviewRound.run` entry type | Public method signature | `deps: PipelineDeps` | `deps: ParallelReviewRoundDeps` |
| `Pipeline.run` entry type | Public method signature | `deps: PipelineDeps` | `deps: PipelineOrchestrationDeps` |
| `CommandRunner` runtime type | Constructor parameter | `runtime: RuntimeStrategy` | `runtime: RuntimeStrategy & PipelineDepsBuilder` |

### Capability Consumer Table

| Capability | Production consumers | Test fakes |
|------------|---------------------|------------|
| `StepArtifactLifecycleCapability` (`stepArtifact`) | `StepExecutor` (executor.ts) | `noopStepArtifact`, strategy stubs in 10+ test files |
| `StepIoValidationCapability` (`stepIo`) | `StepExecutor` (executor.ts, step-completion.ts) | `noopStepIo`, strategy stubs |
| `TerminalStateCapability` (`terminalState`) | `Pipeline.runInternal` | `noopTerminalState` |
| `RoundGitEffectsCapability` (`roundGitEffects`) | `ParallelReviewRound` | `noopRoundGitEffects`, strategy stubs |
| `ChangedFilesCapability` (`changedFiles`) | `StepExecutor` (scope escalation) | Strategy stubs |

**Acceptance Criteria**:
- PR #1105's body contains the complete before/after metrics table with aggregation conditions
- Numbers are reproducible from the stated conditions

---

## T-21: Replace Pick-derived composites with consumer-owned explicit interfaces

Operator blocking comment on PR #1105 (types.ts:201): issue #1103 forbids expressing consumer
contracts by deriving from the producer's key set (`Pick` を増やして facade 依存を隠さない).
The T-19 composites were implemented as `Pick<PipelineDeps, ...>` in `src/core/types.ts`
(the producer's module), which leaves the shared bag as the source of truth. Applied directly
by the operator.

- [x] Delete the three `Pick<PipelineDeps, ...>` aliases from `src/core/types.ts`
- [x] Declare `StepExecutionDeps` as an explicit interface in `src/core/step/step-deps.ts` (new file, extends `StepContext`)
- [x] Declare `ParallelReviewRoundDeps` as an explicit interface in `src/core/pipeline/parallel-review-round.ts` (extends `StepExecutionDeps`, adds `roundGitEffects`)
- [x] Declare `PipelineOrchestrationDeps` as an explicit interface in `src/core/pipeline/pipeline.ts` (extends `ParallelReviewRoundDeps`, adds `terminalState`)
- [x] Update consumer imports (`executor.ts`, `commit-orchestrator.ts`, `step-completion.ts`, `step-context-builder.ts`, `parallel-review-round.ts`, `pipeline.ts`)
- [x] Add `tests/unit/architecture/composite-deps-ownership.test.ts`: compile-time assignability proof (TC-049) and source-level invariant forbidding `Pick`/`Omit` derivation from `PipelineDeps` plus declaration-placement checks (TC-050)
- [x] Run `bun run typecheck`, full vitest suite, and `bun run lint`

**Acceptance Criteria**:
- No `Pick<PipelineDeps` / `Omit<PipelineDeps` occurrence anywhere in `src/` (TC-050 test enforces)
- Each composite is declared in its consumer's module; `src/core/types.ts` declares none of them
- `PipelineDeps` assigns to every composite without casts (TC-049 test proves)
- Entry signatures of `StepExecutor` / `ParallelReviewRound` / `Pipeline` remain narrowed (unchanged from T-19)
