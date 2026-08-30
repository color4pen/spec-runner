# Design: RuntimeStrategy mutation/lifecycle capability split (R2b)

## Context

R2a (PR #1102, merged at `main@660d48fb`) split **read-only leaf** consumers of `RuntimeStrategy` into narrow capability interfaces: `ChangedFilesCapability`, `CommitInspectionCapability`, and `RevisionContentCapability`. Mutation and lifecycle consumers were deferred.

After R2a, the following consumers still hold a dependency on the full `RuntimeStrategy` facade via `PipelineDeps.runtimeStrategy`:

| Consumer | Methods used |
|---|---|
| `StepExecutor` | `captureHeadSha`, `snapshotMainCheckoutGuard`, `prepareStepArtifacts`, `validateStepInputs`, `validateStepOutputs`, `finalizeStepArtifacts`, `canDeriveChangedFiles`, `listChangedFiles`, `digestArtifacts` |
| `step-completion.ts` | `verifyFindingRefs` |
| `commit-orchestrator.ts` | `digestArtifacts`, (via `deriveRevisionContentCapability`) |
| `Pipeline` | `commitFinalState` |
| `ParallelReviewRound` | `captureHeadSha`, `digestArtifacts`, `listChangedFiles`, `listWorktreeChanges`, `commitRoundArtifacts` |

Additionally, `CommandRunner` (composition-root adjacent) calls `this.runtime.buildDeps(...)` whose port return type is `unknown`, requiring the cast `as PipelineDeps` at the call site (runner.ts line 222).

Four signatures in `src/core/port/runtime-strategy.ts` use `unknown` for domain-typed payloads to avoid port→domain import cycles:
- `buildDeps(...): unknown` — returns domain `PipelineDeps`
- `finalizeStepArtifacts(step: unknown, deps: unknown, commitPushInfra: unknown)` — domain `AgentStep`, `PipelineDeps`, `CommitPushInfra`
- `commitFinalState(deps: unknown, state: unknown)` — domain `PipelineDeps`, `JobState` (only `cwd`/`slug` used at runtime)
- `commitRoundArtifacts(..., commitPushInfra: unknown, egressParams?: unknown)` — domain `CommitPushInfra`, egress DTO

The root cause for `buildDeps`'s `unknown` is a circular dependency:
- `runtime-strategy.ts` (port) → cannot import `types.ts` (domain)
- `types.ts` imports `RuntimeStrategy` from the port (for `PipelineDeps.runtimeStrategy`)
- This cycle forces `buildDeps` to return `unknown` at the port level

## Goals / Non-Goals

**Goals**:
- Replace `PipelineDeps.runtimeStrategy?: RuntimeStrategy` with typed, use-case-specific capability fields
- Remove all domain-payload `unknown` from the four target signatures
- Remove `as PipelineDeps`, `as CommitPushInfra`, and egress-params restore casts
- Keep `LocalRuntime` / `ManagedRuntime` as composition-root facades
- Maintain all command lifecycle, step lifecycle, and commit lifecycle behavioral semantics
- Provide executable tests that pin lifecycle ordering and failure boundaries

**Non-Goals**:
- `RuntimeStrategy` facade abolition (R2c)
- Removing all production `RuntimeStrategy` imports (R2c)
- Runtime class physical split
- Redesigning R2a capabilities (`ChangedFilesCapability`, etc.)
- Agent runner session/retry lifecycle changes
- `query(): AsyncGenerator<unknown>` and other non-mutation `unknown` signatures

## Decisions

### D1 — Consumer-owned capability interfaces in the domain layer

Define four new capability interfaces, each owned by the consumer module that requires it:

**`StepArtifactLifecycleCapability`** (`src/core/step/step-capability.ts`):
- Owned by `StepExecutor` use case (step artifact prepare/finalize, HEAD capture, guard snapshot, digest)
- Methods: `captureHeadSha`, `prepareStepArtifacts`, `finalizeStepArtifacts(step: AgentStep, state, cwd, slug, headBeforeStep, infra: CommitPushInfra)`, `snapshotMainCheckoutGuard?`, `digestArtifacts`

**`StepIoValidationCapability`** (`src/core/step/step-capability.ts`):
- Owned by `StepExecutor` I/O contract enforcement use case
- Methods: `validateStepInputs`, `validateStepOutputs`, `verifyFindingRefs`

**`TerminalStateCapability`** (`src/core/pipeline/pipeline-capability.ts`):
- Owned by `Pipeline` terminal-commit use case and `CommandRunner` gate-halt path
- Methods: `commitFinalState(cwd: string, slug: string, state: JobState): Promise<void>`

**`RoundGitEffectsCapability`** (`src/core/pipeline/pipeline-capability.ts`):
- Owned by `ParallelReviewRound` coordinator use case
- Methods: `captureHeadSha`, `listWorktreeChanges`, `commitRoundArtifacts(stagePaths, cwd, branch, coordinatorName, slug, infra: CommitPushInfra, egressParams?: RoundEgressParams)`, `digestArtifacts`, `listChangedFiles`
- `RoundEgressParams` DTO: `{ synthesizedCommits: readonly string[]; pushCapability?: PushCapability | null; excludeWorktreePatterns?: string[] }`

**Rationale**: Capabilities placed in consumer domain layers can freely import domain types (`AgentStep`, `CommitPushInfra`, `JobState`), bypassing the port→domain restriction that forces `unknown`. This follows the same consumer-owned pattern as R2a. Port-layer capabilities with domain-neutral DTOs would require defining wrapper types (e.g. for `AgentStep`, `CommitPushInfra`) which adds unnecessary indirection.

**Alternatives considered**:
- Single `MutationRuntimeStrategy`: Explicitly rejected by requirements — creates another broad facade.
- `Pick<RuntimeStrategy, ...>` trick: Explicitly rejected by requirements — hides facade dependency without resolving it.
- Domain-neutral DTOs in port layer: Feasible for some params (cwd, slug, config) but not for `AgentStep`/`CommitPushInfra` (structurally domain types). Hybrid approach would be inconsistent.

---

### D2 — Break the PipelineDeps ↔ RuntimeStrategy import cycle

Remove `runtimeStrategy?: RuntimeStrategy` from `PipelineDeps` (`src/core/types.ts`). Replace with typed capability fields:

```
stepArtifact?:       StepArtifactLifecycleCapability   // StepExecutor + CommitOrchestrator
stepIo?:             StepIoValidationCapability         // StepExecutor validation
terminalState?:      TerminalStateCapability            // Pipeline + CommandRunner gate
roundGitEffects?:    RoundGitEffectsCapability          // ParallelReviewRound
changedFiles?:       ChangedFilesCapability             // Activation gate + no-op detect (R2a, port layer)
commitInspection?:   CommitInspectionCapability         // adr-gen / custom-reviewer / spec-review (R2a)
revisionContent?:    RevisionContentCapability          // finding-recency / commit-orchestrator (R2a)
```

**Rationale**: `PipelineDeps` holds `runtimeStrategy?: RuntimeStrategy`, creating the `types.ts → runtime-strategy.ts` dependency. Removing this field eliminates the cycle. Without the cycle, `runtime-strategy.ts` can import `PipelineDeps` and type `buildDeps` with a concrete return type.

The R2a capabilities (`ChangedFilesCapability`, `CommitInspectionCapability`, `RevisionContentCapability`) are already in the port layer and safe to add to `PipelineDeps`. Adding them as explicit fields also closes the "still deriving from `deps.runtimeStrategy`" pattern in `step-completion.ts` and `commit-orchestrator.ts`.

**Step implementations that accepted `runtimeStrategy: RuntimeStrategy | undefined`** (adr-gen, custom-reviewer, spec-review) currently call `deriveCommitInspectionCapability(runtimeStrategy)`. After D2, they receive `commitInspection?: CommitInspectionCapability` directly — no derivation needed, no RuntimeStrategy parameter.

---

### D3 — `buildDeps` returns typed `PipelineDeps`

After D2 breaks the cycle, `RuntimeStrategy.buildDeps(config, request, slug, workspace)` can declare its return type as `PipelineDeps` instead of `unknown`. The `as PipelineDeps` cast at runner.ts line 222 is eliminated.

`LocalRuntime.buildDeps` already returns `PipelineDeps` via bivariant method checking. After D3, the port interface formally matches. `ManagedRuntime.buildDeps` is updated identically.

---

### D4 — Remove `finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` from `RuntimeStrategy`

These three methods carry `unknown` parameters that cannot be eliminated in the port layer (domain types). After D1 defines typed capability interfaces, these methods are no longer called directly from consumers via `PipelineDeps.runtimeStrategy`. They are removed from the `RuntimeStrategy` interface and from the `RealRuntimeStrategy` intersection type.

`LocalRuntime` and `ManagedRuntime` implement the capabilities via duck typing — their method names match the capability interfaces without requiring an explicit `implements` declaration. This is consistent with the existing TypeScript-bivariant approach used in R2a.

**Rationale**: Removing domain-payload `unknown` from the port requires either (a) domain-neutral DTOs or (b) moving the typed interfaces to the consumer layer. Option (b) is cleaner. The methods remain on the concrete runtimes; only the port declaration is removed. Consumers no longer see them via `RuntimeStrategy`.

**Risk mitigation**: `RealRuntimeStrategy` is tightened to include only methods that remain on the port. Compile-time enforcement of the capability implementations shifts to the capability contract tests (T-16) and the new capability interfaces themselves.

---

### D5 — Derive helpers follow the R2a `bind`-based pattern

For each new capability, a `derive*Capability(runtime)` helper is defined alongside the capability interface (in the same consumer-domain file). The helper binds methods from `LocalRuntime` (or any `RealRuntimeStrategy`-typed value) to the capability interface. `undefined` is returned when the runtime does not have the required method.

`LocalRuntime.buildDeps` and `ManagedRuntime.buildDeps` call these helpers to construct and inject all capability fields into the returned `PipelineDeps`.

---

### D6 — Capability absence uses `undefined` injection, not optional methods

Capability method signatures are **required** (no `?`). Consumers check `deps.stepArtifact ? ... : undefined` (field presence), not `deps.stepArtifact?.captureHeadSha?.()` (method presence). This preserves the existing semantics of optional capability injection while keeping capability contracts strict.

`snapshotMainCheckoutGuard` is an exception: it remains optional on `StepArtifactLifecycleCapability` because fail-open semantics (return null) are structurally meaningful — null is not an absence of capability but a runtime result.

## Risks / Trade-offs

**[Risk] Large test-fake surface area** → Mitigation: All existing `runtimeStrategy: { ... } as RuntimeStrategy` fakes in tests are updated to use the specific capability field(s). Since each capability is narrower, test fakes become simpler and more focused. The migration is mechanical.

**[Risk] Missed callsites (runtimeStrategy references)** → Mitigation: After removing `PipelineDeps.runtimeStrategy`, the TypeScript compiler will flag every remaining reference. All callsites are addressed as part of T-08 through T-14.

**[Risk] Step implementations that directly accepted `runtimeStrategy: RuntimeStrategy | undefined`** (adr-gen, custom-reviewer, spec-review) must be updated → Mitigation: These steps receive their capability directly via `deps.commitInspection` (T-14), which is simpler than the current derive-from-facade pattern.

**[Risk] `commitRoundArtifacts` egress DTO** → `RoundEgressParams` is a new DTO in the pipeline capability file. Its `PushCapability` dependency pulls `src/git/push-capability.ts` into the domain layer. This is acceptable: `PushCapability` is a utility type, not a domain entity.

**[Risk] ManagedRuntime no-op semantics** → Mitigation: T-07 verifies that managed runtime capability implementations preserve all existing no-op / unavailable / fail-closed semantics. Contract tests (T-16) pin the semantics.

## Open Questions

None at design time. Stop conditions from the request apply if implementation reveals:
- Lifecycle ordering or persistence authority cannot be preserved without restructuring (report to Issue).
- Domain-neutral DTO is insufficient for egress params (escalate to Issue).
