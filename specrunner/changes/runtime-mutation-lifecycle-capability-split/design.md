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
stepArtifact:        StepArtifactLifecycleCapability    // StepExecutor + CommitOrchestrator (required)
stepIo:              StepIoValidationCapability         // StepExecutor validation (required)
terminalState:       TerminalStateCapability            // Pipeline + CommandRunner gate (required)
roundGitEffects:     RoundGitEffectsCapability          // ParallelReviewRound (required)
changedFiles?:       ChangedFilesCapability             // Activation gate + no-op detect (R2a, port layer)
commitInspection?:   CommitInspectionCapability         // adr-gen / custom-reviewer / spec-review (R2a)
revisionContent?:    RevisionContentCapability          // finding-recency / commit-orchestrator (R2a)
```

The four mutation/lifecycle capability fields are **required non-nullable**: both production runtimes always inject real (or explicit no-op) implementations, so there is no legitimate capability-absent production state. Making them optional would let a composition omission pass the type checker while optional chaining silently skips validation, commit/push, terminal checkpoint publication, and parallel-round inspection (fail-open). Test fakes inject the explicit no-op implementations from `src/core/step/noop-capabilities.ts` or custom stubs. Only the three R2a read-only capabilities remain optional/`undefined`-able.

**Rationale**: `PipelineDeps` holds `runtimeStrategy?: RuntimeStrategy`, creating the `types.ts → runtime-strategy.ts` dependency. Removing this field eliminates that edge, but it does **not** make a reverse import legal: `types.ts` still imports the R2a capability types (`ChangedFilesCapability` etc.) from `runtime-strategy.ts`, so any `runtime-strategy.ts → types.ts` import — even `import type` — forms a two-file compile-time cycle and a ports→domain edge. The DSM ratchet over ports→domain is delete-only; no new allowlist entry may be added for this. Typing `buildDeps` therefore moves out of the port entirely (see D3).

The R2a capabilities (`ChangedFilesCapability`, `CommitInspectionCapability`, `RevisionContentCapability`) are already in the port layer and safe to add to `PipelineDeps`. Adding them as explicit fields also closes the "still deriving from `deps.runtimeStrategy`" pattern in `step-completion.ts` and `commit-orchestrator.ts`.

**Step implementations that accepted `runtimeStrategy: RuntimeStrategy | undefined`** (adr-gen, custom-reviewer, spec-review) currently call `deriveCommitInspectionCapability(runtimeStrategy)`. After D2, they receive `commitInspection?: CommitInspectionCapability` directly — no derivation needed, no RuntimeStrategy parameter.

---

### D3 — `buildDeps` moves off the port to a domain-owned `PipelineDepsBuilder` contract

`buildDeps` cannot be typed on the `RuntimeStrategy` port: importing `PipelineDeps` from `../types.js` creates a ports→domain compile-time cycle (see D2 rationale) and would require a new DSM allowlist entry, which the delete-only ratchet forbids.

Instead:
- Declare a `PipelineDepsBuilder` interface in the domain layer (`src/core/types.ts` or an adjacent domain module): `buildDeps(config, request, slug, workspace): PipelineDeps`. The domain layer may import port capability types, so this direction is legal.
- Remove `buildDeps` from the `RuntimeStrategy` port interface entirely. `src/core/port/runtime-strategy.ts` has no import from `../types.js` and no reference to `PipelineDeps`.
- `LocalRuntime` and `ManagedRuntime` implement `PipelineDepsBuilder` in addition to `RuntimeStrategy` (their existing `buildDeps` methods already match the signature).
- The composition root types the runtime as `RuntimeStrategy & PipelineDepsBuilder` (e.g. via `RealRuntimeStrategy` or the factory return type), so `CommandRunner.execute` assigns `deps = this.runtime.buildDeps(...)` without any cast.
- The DSM allowlist entry for `src/core/port/runtime-strategy.ts` in `tests/unit/architecture/arch-allowlist.ts` is deleted.

---

### D4 — Remove `finalizeStepArtifacts`, `commitFinalState`, `commitRoundArtifacts` from `RuntimeStrategy`

These three methods carry `unknown` parameters that cannot be eliminated in the port layer (domain types). After D1 defines typed capability interfaces, these methods are no longer called directly from consumers via `PipelineDeps.runtimeStrategy`. They are removed from the `RuntimeStrategy` interface and from the `RealRuntimeStrategy` intersection type.

`LocalRuntime` and `ManagedRuntime` implement the capabilities via duck typing — their method names match the capability interfaces without requiring an explicit `implements` declaration. This is consistent with the existing TypeScript-bivariant approach used in R2a.

**Rationale**: Removing domain-payload `unknown` from the port requires either (a) domain-neutral DTOs or (b) moving the typed interfaces to the consumer layer. Option (b) is cleaner. The methods remain on the concrete runtimes; only the port declaration is removed. Consumers no longer see them via `RuntimeStrategy`.

**Risk mitigation**: `RealRuntimeStrategy` is tightened to include only methods that remain on the port. Compile-time enforcement of the capability implementations shifts to the capability contract tests (T-16) and the new capability interfaces themselves.

---

### D5 — Derive helpers follow the R2a `bind`-based pattern

For each new capability, a `derive*Capability(runtime)` helper is defined alongside the capability interface (in the same consumer-domain file). The helper binds methods from `LocalRuntime` (or any `RealRuntimeStrategy`-typed value) to the capability interface. For the four required mutation/lifecycle capabilities the helper always yields a capability (real or explicit no-op — see D6); `undefined` is returned only for the optional R2a read-only capabilities when the runtime does not support them.

`LocalRuntime.buildDeps` and `ManagedRuntime.buildDeps` call these helpers to construct and inject all capability fields into the returned `PipelineDeps`.

---

### D6 — Required lifecycle capabilities; `undefined` absence only for read-only capabilities

Capability method signatures are **required** (no `?`), including `snapshotMainCheckoutGuard`: both production runtimes implement it, and "cannot perform the check" is expressed by returning `null` (a runtime result), not by omitting the method. A no-op implementation explicitly returns `null`. Making the method optional would let a structurally valid capability silently skip drift detection.

The four mutation/lifecycle capability fields (`stepArtifact`, `stepIo`, `terminalState`, `roundGitEffects`) are **required non-nullable** in `PipelineDeps` (see D2). Consumers call them directly — no field-presence checks, no optional chaining on these fields. "This runtime has no local worktree" is expressed by injecting an explicit no-op implementation (`src/core/step/noop-capabilities.ts`), which preserves the legacy absent-capability behavior observably.

`undefined`-field absence semantics apply only to the three R2a read-only capabilities (`changedFiles`, `commitInspection`, `revisionContent`), where consumers check field presence (`deps.commitInspection ? ... : undefined`).

---

### D7 — Consumer-owned composite deps types

Splitting capabilities into `PipelineDeps` fields is necessary but not sufficient: if every consumer still receives the full `PipelineDeps` aggregate, each consumer can reach every dependency and the use-case split is not enforced by types. Each major consumer therefore declares a consumer-owned composite deps type listing **only the fields it uses**:

- **`StepExecutionDeps`** (`src/core/step/` — owned by `StepExecutor`): the subset of `PipelineDeps` that `StepExecutor` actually reads (e.g. `stepArtifact`, `stepIo`, `changedFiles`, agent runner, store, logging/config fields it touches).
- **`ParallelReviewRoundDeps`** (`src/core/pipeline/` or the round's module — owned by `ParallelReviewRound`): e.g. `roundGitEffects` plus the fields the round reads.
- **`PipelineOrchestrationDeps`** (`src/core/pipeline/` — owned by `Pipeline`): what `Pipeline` itself reads (e.g. `terminalState`, transition/store fields) plus the composites it forwards.

Rules:
- Each composite is defined structurally so that `PipelineDeps` is assignable to it **without casts** (subset-of-fields pattern, e.g. `Pick<PipelineDeps, ...>` or an explicit interface that `PipelineDeps` satisfies).
- `StepExecutor`, `ParallelReviewRound`, and `Pipeline` public entry signatures accept their composite type, not `PipelineDeps`.
- A consumer MUST NOT reach a capability outside its composite; adding a field to a composite is an explicit, reviewable act.
- Exact field membership is determined at implementation time from actual usage; the contract is "only fields the consumer reads", enforced by the narrowed signatures compiling without casts.

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
