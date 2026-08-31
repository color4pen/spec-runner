# Spec: RuntimeStrategy mutation/lifecycle capability split (R2b)

## Requirements

### Requirement: Step artifact lifecycle capability is consumer-owned and typed

`StepArtifactLifecycleCapability` SHALL be defined in the step-domain layer with fully typed method signatures for `finalizeStepArtifacts`. The method SHALL accept `step: AgentStep`, `state: JobState`, `cwd: string`, `slug: string`, `headBeforeStep: string | null`, and `infra: CommitPushInfra` — no `unknown` parameters at the call site.

#### Scenario: StepExecutor calls finalizeStepArtifacts with typed parameters

**Given** `deps.stepArtifact` is an injected `StepArtifactLifecycleCapability`
**When** `StepExecutor` calls `finalizeStepArtifacts` after a successful agent run
**Then** the call passes `step: AgentStep`, `cwd: string`, `slug: string`, and `infra: CommitPushInfra` as typed arguments — no cast to `unknown` or from `unknown` at the call site

#### Scenario: No-op step artifact capability preserves absent-runtime behavior

**Given** `deps.stepArtifact` is an explicit no-op `StepArtifactLifecycleCapability` (managed runtime, or `noopStepArtifact` in tests)
**When** `StepExecutor` reaches the finalize step in `runAgentStep`
**Then** `finalizeStepArtifacts` runs without git effects and execution continues as if no git commit occurred (observably the same behavior as the legacy path where `deps.runtimeStrategy` was absent)

---

### Requirement: Terminal state capability carries typed parameters

`TerminalStateCapability` SHALL declare `commitFinalState(cwd: string, slug: string, state: JobState): Promise<void>`. Consumers SHALL NOT pass a full `PipelineDeps` object — they SHALL extract `cwd` and `slug` before calling.

#### Scenario: Pipeline calls commitFinalState with extracted primitives

**Given** `deps.terminalState` is an injected `TerminalStateCapability`
**When** the pipeline reaches the `awaiting-archive` terminal transition
**Then** `deps.terminalState.commitFinalState(deps.cwd ?? process.cwd(), deps.slug, state)` is called with string primitives — the `deps` object is not forwarded as a parameter

#### Scenario: CommandRunner gate-halt uses terminalState capability

**Given** `deps.terminalState` is an injected `TerminalStateCapability`
**When** the issue-fidelity gate returns `halt`
**Then** `deps.terminalState.commitFinalState(cwd, deps.slug, haltState)` is called using the resolved `cwd` string — not `deps.runtimeStrategy?.commitFinalState(deps, haltState)`

---

### Requirement: Round git effects capability is consumer-owned and typed

`RoundGitEffectsCapability` SHALL declare `commitRoundArtifacts` with typed `infra: CommitPushInfra` and `egressParams?: RoundEgressParams` parameters. `RoundEgressParams` SHALL be a plain interface in the pipeline domain layer. No `unknown` parameters at the call site.

#### Scenario: ParallelReviewRound calls commitRoundArtifacts with typed infra

**Given** `deps.roundGitEffects` is an injected `RoundGitEffectsCapability`
**When** `ParallelReviewRound` stages and commits declared outputs
**Then** `commitRoundArtifacts(stagePaths, cwd, branch, coordinatorName, slug, infra, egressParams)` is called with `infra: CommitPushInfra` typed — no `as CommitPushInfra` cast at the call site

---

### Requirement: buildDeps returns typed PipelineDeps without a cast

A domain-owned `PipelineDepsBuilder` contract SHALL declare `buildDeps(config, request, slug, workspace): PipelineDeps` (design D3). `buildDeps` SHALL NOT be declared on the `RuntimeStrategy` port interface. `src/core/port/runtime-strategy.ts` SHALL NOT import from `../types.js` (not even `import type`), and `tests/unit/architecture/arch-allowlist.ts` SHALL contain no entry for `src/core/port/runtime-strategy.ts`. Both runtimes SHALL implement `PipelineDepsBuilder`; the composition root SHALL type the runtime so that `CommandRunner.execute` needs no `as PipelineDeps` cast.

#### Scenario: CommandRunner assigns buildDeps result without cast

**Given** `this.runtime` is typed to include `PipelineDepsBuilder` at the composition root
**When** `CommandRunner.execute` calls `this.runtime.buildDeps(config, request, slug, workspace)`
**Then** the result is assigned to `deps: PipelineDeps` without a type cast — the assignment is type-safe at the TypeScript level

#### Scenario: RuntimeStrategy port has no domain import

**Given** `src/core/port/runtime-strategy.ts` at the current revision
**When** its import statements and interface declarations are inspected
**Then** there is no import (type-only included) from `../types.js`, no `buildDeps` declaration on `RuntimeStrategy`, and no `src/core/port/runtime-strategy.ts` entry in `tests/unit/architecture/arch-allowlist.ts`

---

### Requirement: PipelineDeps does not hold a full RuntimeStrategy facade field

`PipelineDeps` SHALL NOT have a field typed as `RuntimeStrategy` (or equivalent broad facade). The removed `runtimeStrategy?: RuntimeStrategy` field SHALL be replaced by typed capability fields.

#### Scenario: PipelineDeps capability fields are narrow

**Given** the updated `PipelineDeps` type
**When** a test fake injects step artifact lifecycle behavior
**Then** the fake implements only `StepArtifactLifecycleCapability` — it does not need to provide unrelated methods such as `bootstrapJob`, `persistJobState`, or `setupWorkspace`

---

### Requirement: Major consumers accept consumer-owned composite deps, not the full PipelineDeps

`StepExecutor`, `ParallelReviewRound`, and `Pipeline` SHALL each declare a consumer-owned composite deps type (`StepExecutionDeps`, `ParallelReviewRoundDeps`, `PipelineOrchestrationDeps` — design D7) containing only the `PipelineDeps` fields that consumer reads. Their public entry signatures SHALL accept the composite type instead of `PipelineDeps`. `PipelineDeps` SHALL be structurally assignable to each composite without casts.

#### Scenario: StepExecutor signature is narrowed to StepExecutionDeps

**Given** the `StepExecutor` entry points (`runAgentStep` and related public methods)
**When** their parameter types are inspected
**Then** the deps parameter is typed `StepExecutionDeps` (not `PipelineDeps`), and `StepExecutionDeps` lists only fields `StepExecutor` reads

#### Scenario: ParallelReviewRound and Pipeline signatures are narrowed

**Given** the `ParallelReviewRound` and `Pipeline` entry points
**When** their deps parameter types are inspected
**Then** they are typed `ParallelReviewRoundDeps` and `PipelineOrchestrationDeps` respectively, and neither type exposes capability fields the consumer does not read

#### Scenario: PipelineDeps assigns to composites without casts

**Given** a fully built `PipelineDeps` value at the composition root
**When** it is passed to `Pipeline`, and by `Pipeline` onward to `StepExecutor` / `ParallelReviewRound`
**Then** every assignment is accepted by the TypeScript compiler with no `as` cast

---

### Requirement: LocalRuntime.buildDeps injects all capabilities into PipelineDeps

`LocalRuntime.buildDeps` SHALL inject `stepArtifact`, `stepIo`, `terminalState`, `roundGitEffects`, `changedFiles`, `commitInspection`, and `revisionContent` capability fields into the returned `PipelineDeps`. Each field SHALL be derived by a typed `derive*Capability` helper that binds methods from `this` (the LocalRuntime instance).

#### Scenario: LocalRuntime provides all capabilities via buildDeps

**Given** a `LocalRuntime` instance (composition root)
**When** `buildDeps(config, request, slug, workspace)` is called
**Then** the returned `PipelineDeps` has non-undefined values for all seven capability fields

---

### Requirement: ManagedRuntime preserves existing no-op semantics in capabilities

`ManagedRuntime.buildDeps` SHALL inject capability implementations that preserve the existing no-op / unavailable / fail-closed semantics for each method. Specifically:
- `stepArtifact.prepareStepArtifacts`: no-op (managed has no local worktree)
- `stepArtifact.finalizeStepArtifacts`: no-op (managed has no local commit/push)
- `terminalState.commitFinalState`: no-op (managed branch state managed independently)
- `roundGitEffects.listWorktreeChanges`: returns `{ kind: "success", paths: [] }` (managed Non-Goal)
- `roundGitEffects.commitRoundArtifacts`: no-op (managed Non-Goal)

#### Scenario: ManagedRuntime capability no-ops match prior behavior

**Given** a `ManagedRuntime` instance
**When** any no-op capability method is called
**Then** the result is identical to the pre-refactoring behavior of the corresponding `ManagedRuntime` method (no observable semantic change)

---

### Requirement: Capability methods are required; absence is expressed via undefined field

All methods in a capability interface SHALL be required (no `?` modifier), `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` included: "the check cannot be performed" SHALL be expressed by the method returning `null` (no-op implementations explicitly return `null`), never by omitting the method.

The four mutation/lifecycle capability fields in `PipelineDeps` (`stepArtifact`, `stepIo`, `terminalState`, `roundGitEffects`) SHALL be required non-nullable fields: every producer of a `PipelineDeps` (production runtimes and test fixtures alike) SHALL inject a real or explicit no-op implementation. Absence-as-`undefined` field semantics SHALL apply only to the R2a read-only capability fields (`changedFiles`, `commitInspection`, `revisionContent`).

#### Scenario: Compile-time enforcement of complete capability fake

**Given** a test fake that implements `StepArtifactLifecycleCapability`
**When** the fake omits any required method
**Then** TypeScript reports a compile-time error (not a runtime error)

---

### Requirement: R2a read-only capabilities are injected directly, not re-derived from facade

`CommitInspectionCapability`, `RevisionContentCapability`, and `ChangedFilesCapability` SHALL be injected as explicit fields in `PipelineDeps`. Consumers SHALL use `deps.commitInspection`, `deps.revisionContent`, and `deps.changedFiles` directly — they SHALL NOT derive the capability via `deriveCommitInspectionCapability(deps.runtimeStrategy)` at the consumer call site.

#### Scenario: step-completion uses injected CommitInspection capability

**Given** `deps.commitInspection` is an injected `CommitInspectionCapability | undefined`
**When** a step implementation (e.g. spec-review, custom-reviewer) needs to inspect commit-level changes
**Then** it uses `deps.commitInspection` directly — no `deriveCommitInspectionCapability(deps.runtimeStrategy)` call appears in the step implementation

#### Scenario: adr-gen, custom-reviewer, spec-review parameter types are narrowed

**Given** `adr-gen.ts`, `custom-reviewer.ts`, and `spec-review.ts` accept commit inspection capability
**When** the `runtimeStrategy: RuntimeStrategy | undefined` parameter is replaced with `commitInspection: CommitInspectionCapability | undefined`
**Then** the step implementations no longer hold a dependency on the full RuntimeStrategy facade

---

### Requirement: Command lifecycle ordering is preserved after capability split

The observable lifecycle ordering in `CommandRunner.execute` SHALL NOT change. Specifically:
- Provider readiness check fires before `prepare()` — before any job state or worktree is created
- Duplicate-job guard fires inside `prepare()` before `bootstrapJob`
- `setupWorkspace` failure triggers `persistJobState` with no cleanup handle created
- `buildDeps` and `registerCleanup` run together (dependency assembly before cleanup registration)
- `reloadJobState` fires after `setupWorkspace` completes on the run path (not on resume path)

#### Scenario: buildDeps returns PipelineDeps without observable ordering change

**Given** `CommandRunner.execute` is called for a new run
**When** `buildDeps` is called at the dependency assembly step
**Then** the returned `PipelineDeps` contains all injected capabilities, and subsequent steps (registerCleanup, runPipeline) receive the same deps as before the refactoring

---

### Requirement: Step finalize lifecycle ordering is preserved

The step artifact lifecycle ordering in `StepExecutor.runAgentStep` SHALL NOT change:
1. `prepareStepArtifacts` runs before the agent session
2. `finalizeStepArtifacts` (cleanup templates + commit/push) runs after agent success and output gate pass
3. `captureHeadSha` for the commit OID runs after `finalizeStepArtifacts`
4. `roundOwnsGitEffects` guard prevents `finalizeStepArtifacts` from running for coordinator members

#### Scenario: finalizeStepArtifacts is skipped for roundOwnsGitEffects members

**Given** `deps.roundOwnsGitEffects` is `true` (member step inside a coordinator round)
**When** `StepExecutor.runAgentStep` completes successfully
**Then** `deps.stepArtifact.finalizeStepArtifacts` is NOT called — the coordinator owns git effects for this round
