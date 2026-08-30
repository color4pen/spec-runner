# Spec: RuntimeStrategy mutation/lifecycle capability split (R2b)

## Requirements

### Requirement: Step artifact lifecycle capability is consumer-owned and typed

`StepArtifactLifecycleCapability` SHALL be defined in the step-domain layer with fully typed method signatures for `finalizeStepArtifacts`. The method SHALL accept `step: AgentStep`, `state: JobState`, `cwd: string`, `slug: string`, `headBeforeStep: string | null`, and `infra: CommitPushInfra` — no `unknown` parameters at the call site.

#### Scenario: StepExecutor calls finalizeStepArtifacts with typed parameters

**Given** `deps.stepArtifact` is an injected `StepArtifactLifecycleCapability`
**When** `StepExecutor` calls `finalizeStepArtifacts` after a successful agent run
**Then** the call passes `step: AgentStep`, `cwd: string`, `slug: string`, and `infra: CommitPushInfra` as typed arguments — no cast to `unknown` or from `unknown` at the call site

#### Scenario: StepExecutor skips finalize when capability is absent

**Given** `deps.stepArtifact` is `undefined`
**When** `StepExecutor` reaches the finalize step in `runAgentStep`
**Then** `finalizeStepArtifacts` is not called and execution continues as if no git commit occurred (same behavior as before when `deps.runtimeStrategy` was absent)

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

`RuntimeStrategy.buildDeps` SHALL declare its return type as `PipelineDeps`. No `as PipelineDeps` cast SHALL appear in `CommandRunner.execute`.

#### Scenario: CommandRunner assigns buildDeps result without cast

**Given** `this.runtime` is a `RuntimeStrategy` implementation
**When** `CommandRunner.execute` calls `this.runtime.buildDeps(config, request, slug, workspace)`
**Then** the result is assigned to `deps: PipelineDeps` without a type cast — the assignment is type-safe at the TypeScript level

---

### Requirement: PipelineDeps does not hold a full RuntimeStrategy facade field

`PipelineDeps` SHALL NOT have a field typed as `RuntimeStrategy` (or equivalent broad facade). The removed `runtimeStrategy?: RuntimeStrategy` field SHALL be replaced by typed capability fields.

#### Scenario: PipelineDeps capability fields are narrow

**Given** the updated `PipelineDeps` type
**When** a test fake injects step artifact lifecycle behavior
**Then** the fake implements only `StepArtifactLifecycleCapability` — it does not need to provide unrelated methods such as `bootstrapJob`, `persistJobState`, or `setupWorkspace`

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

All methods in a capability interface SHALL be required (no `?` modifier). The ability to inject no capability SHALL be expressed by assigning `undefined` to the capability field in `PipelineDeps`, not by making the methods optional.

**Exception**: `StepArtifactLifecycleCapability.snapshotMainCheckoutGuard` SHALL be the sole optional method (`?` modifier is permitted). This exception exists because the method's fail-open semantics require a `null` return value (not capability absence) when the check cannot be performed — omitting the method entirely is a valid expression of "this runtime does not support snapshot guard" without needing to inject a separate undefined field.

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
