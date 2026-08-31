# Test Cases: RuntimeStrategy mutation/lifecycle capability split (R2b)

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual | gate
  **Priority**: must | should | could
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
    **GIVEN** <preconditions>
    **WHEN** <action>
    **THEN** <expected result>
  gate TC:
    GWT は記述しない。充足を担う verification phase 名（または verification.commands の command 名）を本文に記録する。

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  所有権と書込時点: Result YAML は test-case-gen によるテストケース生成の結果記録である。
  生成時に一度だけ書かれ、後続ステップは更新しない。

  `result` の値の意味:
  - completed = 全 TC の設計が完了し blocked_reasons が空
  - partial   = 一部 TC が設計不能で blocked_reasons に記録あり
  - failed    = 生成自体が成立しなかった
-->

## Summary

- **Total**: 46 cases
- **Automated** (unit/integration/gate): 45
- **Manual**: 1
- **Priority**: must: 41, should: 5, could: 0

---

## Step Artifact Lifecycle Capability

### TC-001: StepExecutor calls finalizeStepArtifacts with typed parameters

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Step artifact lifecycle capability is consumer-owned and typed > Scenario: StepExecutor calls finalizeStepArtifacts with typed parameters

---

### TC-002: StepExecutor skips finalize when capability is absent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Step artifact lifecycle capability is consumer-owned and typed > Scenario: StepExecutor skips finalize when capability is absent

---

### TC-003: StepIoValidationCapability has only required methods

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `StepIoValidationCapability` is defined in `src/core/step/step-capability.ts`
**WHEN** the TypeScript compiler checks the interface
**THEN** all three methods (`validateStepInputs`, `validateStepOutputs`, `verifyFindingRefs`) are required (no `?` modifier), and the file compiles without errors

---

### TC-004: snapshotMainCheckoutGuard is the sole optional method on StepArtifactLifecycleCapability

**Category**: unit
**Priority**: should
**Source**: design.md > D6; tasks.md > T-02

**GIVEN** `StepArtifactLifecycleCapability` is defined in `src/core/step/step-capability.ts`
**WHEN** the interface declaration is inspected
**THEN** exactly one method — `snapshotMainCheckoutGuard?` — carries the optional modifier; all other methods (`captureHeadSha`, `prepareStepArtifacts`, `finalizeStepArtifacts`, `digestArtifacts`) are required

---

### TC-005: executor.ts contains no reference to deps.runtimeStrategy

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** `src/core/step/executor.ts` is updated to use capability fields
**WHEN** the source file is scanned for `deps.runtimeStrategy`
**THEN** zero occurrences are found; all former calls route through `deps.stepArtifact`, `deps.stepIo`, or `deps.changedFiles` as appropriate

---

### TC-006: finalizeStepArtifacts call in executor passes typed cwd and slug

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** `StepExecutor.runAgentStep` is updated and `deps.roundOwnsGitEffects` is `false`
**WHEN** the agent run succeeds and the output gate passes
**THEN** `deps.stepArtifact.finalizeStepArtifacts` is invoked with `cwd: string` and `slug: string` as explicit string arguments (not `deps: unknown`); no `unknown` cast appears at the call site

---

### TC-007: finalizeStepArtifacts is skipped for roundOwnsGitEffects members

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Step finalize lifecycle ordering is preserved > Scenario: finalizeStepArtifacts is skipped for roundOwnsGitEffects members

---

### TC-008: prepareStepArtifacts is called before the agent session

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-15

**GIVEN** `StepExecutor.runAgentStep` is called with a step that has a `deps.stepArtifact` capability
**WHEN** execution proceeds
**THEN** `deps.stepArtifact.prepareStepArtifacts` is invoked before the agent session starts; a test spy confirms the ordering

---

---

## Terminal State Capability

### TC-009: Pipeline calls commitFinalState with extracted primitives

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Terminal state capability carries typed parameters > Scenario: Pipeline calls commitFinalState with extracted primitives

---

### TC-010: CommandRunner gate-halt uses terminalState capability

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Terminal state capability carries typed parameters > Scenario: CommandRunner gate-halt uses terminalState capability

---

### TC-011: TerminalStateCapability is defined with typed signature

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** `TerminalStateCapability` is defined in `src/core/pipeline/pipeline-capability.ts`
**WHEN** the TypeScript compiler checks the interface
**THEN** the single method `commitFinalState(cwd: string, slug: string, state: JobState): Promise<void>` is required and compiles without errors; no `unknown` parameter appears

---

### TC-012: pipeline.ts contains no reference to deps.runtimeStrategy

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-10

**GIVEN** `src/core/pipeline/pipeline.ts` is updated to use `TerminalStateCapability`
**WHEN** both terminal-transition call sites are inspected
**THEN** both former `deps.runtimeStrategy?.commitFinalState(deps, state)` calls are replaced with `deps.terminalState?.commitFinalState(cwd, deps.slug, state)`; no `deps.runtimeStrategy` reference remains

---

### TC-013: terminalState.commitFinalState receives correct cwd and slug in gate-halt path

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-15

**GIVEN** `CommandRunner.execute` is called and the issue-fidelity gate returns `halt`
**WHEN** `deps.terminalState?.commitFinalState` is invoked
**THEN** the first argument is the resolved `cwd` string (not `deps` object), and the second argument is `deps.slug` — verified by a test spy

---

---

## Round Git Effects Capability

### TC-014: ParallelReviewRound calls commitRoundArtifacts with typed infra

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Round git effects capability is consumer-owned and typed > Scenario: ParallelReviewRound calls commitRoundArtifacts with typed infra

---

### TC-015: RoundEgressParams is a plain domain-neutral DTO with expected fields

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03; design.md > D1

**GIVEN** `RoundEgressParams` is defined in `src/core/pipeline/pipeline-capability.ts`
**WHEN** the interface declaration is inspected
**THEN** it contains exactly `synthesizedCommits: readonly string[]`, `pushCapability?: PushCapability | null`, and `excludeWorktreePatterns?: string[]`; no domain entity type (`AgentStep`, `PipelineDeps`) is referenced

---

### TC-016: parallel-review-round.ts contains no reference to deps.runtimeStrategy

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-11

**GIVEN** `src/core/pipeline/parallel-review-round.ts` is updated to use `RoundGitEffectsCapability`
**WHEN** the source file is scanned for `deps.runtimeStrategy`
**THEN** zero occurrences are found; all calls route through `deps.roundGitEffects`

---

### TC-017: commitRoundArtifacts called only when toStage is non-empty

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-15

**GIVEN** `ParallelReviewRound` has completed its fan-out phase
**WHEN** `listWorktreeChanges` returns an empty paths array
**THEN** `deps.roundGitEffects.commitRoundArtifacts` is NOT called; a test spy confirms zero invocations

---

### TC-018: captureHeadSha is called before round fan-out

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-15

**GIVEN** `ParallelReviewRound` is started with a `deps.roundGitEffects` capability
**WHEN** the round begins execution
**THEN** `deps.roundGitEffects.captureHeadSha` is called before any member step fan-out begins; a test spy confirms the ordering

---

---

## buildDeps Type Safety

### TC-019: CommandRunner assigns buildDeps result without cast

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: buildDeps returns typed PipelineDeps without a cast > Scenario: CommandRunner assigns buildDeps result without cast

---

### TC-020: buildDeps returns typed PipelineDeps without observable ordering change

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Command lifecycle ordering is preserved after capability split > Scenario: buildDeps returns PipelineDeps without observable ordering change

---

### TC-021: runner.ts has no as PipelineDeps cast

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-12

**GIVEN** `src/core/command/runner.ts` is updated per T-12
**WHEN** the line that calls `this.runtime.buildDeps(...)` is inspected
**THEN** the result is assigned directly to `deps: PipelineDeps` without `as PipelineDeps`; the TypeScript compiler accepts the assignment without a cast

---

### TC-022: RuntimeStrategy.buildDeps port signature returns PipelineDeps

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** `src/core/port/runtime-strategy.ts` is updated
**WHEN** the `buildDeps` signature is inspected
**THEN** the return type is `PipelineDeps` (not `unknown`), and the file imports `PipelineDeps` from `../types.js` without creating a circular dependency

---

---

## PipelineDeps Restructuring

### TC-023: PipelineDeps capability fields are narrow

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: PipelineDeps does not hold a full RuntimeStrategy facade field > Scenario: PipelineDeps capability fields are narrow

---

### TC-024: PipelineDeps no longer imports or references RuntimeStrategy

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `src/core/types.ts` is updated per T-04
**WHEN** the file's imports and `PipelineDeps` field declarations are inspected
**THEN** `runtimeStrategy?: RuntimeStrategy` is absent and `import type { RuntimeStrategy }` from the port is absent (unless still needed for another purpose); seven typed capability fields are present

---

### TC-025: Capability absence expressed via undefined field, not optional methods

**Category**: unit
**Priority**: must
**Source**: design.md > D6; tasks.md T-04, T-08, T-10, T-11

**GIVEN** a consumer calls a lifecycle method on an optional capability (e.g. `deps.stepArtifact?.finalizeStepArtifacts(...)`)
**WHEN** `deps.stepArtifact` is `undefined`
**THEN** the call evaluates to `undefined` (optional chain short-circuits), and no `TypeError` is thrown; the capability interface method itself has no `?` modifier

---

### TC-026: Compile-time enforcement of complete capability fake

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Capability methods are required; absence is expressed via undefined field > Scenario: Compile-time enforcement of complete capability fake

---

---

## Runtime Capability Injection

### TC-027: LocalRuntime provides all capabilities via buildDeps

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: LocalRuntime.buildDeps injects all capabilities into PipelineDeps > Scenario: LocalRuntime provides all capabilities via buildDeps

---

### TC-028: ManagedRuntime capability no-ops match prior behavior

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: ManagedRuntime preserves existing no-op semantics in capabilities > Scenario: ManagedRuntime capability no-ops match prior behavior

---

### TC-029: LocalRuntime satisfies all four new capability interfaces

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-14

**GIVEN** `LocalRuntime` implements `StepArtifactLifecycleCapability`, `StepIoValidationCapability`, `TerminalStateCapability`, and `RoundGitEffectsCapability`
**WHEN** a compile-time assignment proof is evaluated (e.g. `const _: StepArtifactLifecycleCapability = localRuntime`)
**THEN** TypeScript accepts all four assignments without error — each capability is satisfied

---

### TC-030: ManagedRuntime satisfies all four new capability interfaces

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-14

**GIVEN** `ManagedRuntime` implements typed no-op versions of `StepArtifactLifecycleCapability`, `StepIoValidationCapability`, `TerminalStateCapability`, and `RoundGitEffectsCapability`
**WHEN** a compile-time assignment proof is evaluated
**THEN** TypeScript accepts all four assignments without error

---

### TC-031: ManagedRuntime.listWorktreeChanges returns success with empty paths

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-14

**GIVEN** a `ManagedRuntime` instance
**WHEN** `roundGitEffects.listWorktreeChanges(cwd)` is called
**THEN** it resolves with `{ kind: "success", paths: [] }` — matching the pre-refactoring managed no-op semantics

---

### TC-032: LocalRuntime.finalizeStepArtifacts has typed CommitPushInfra parameter

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `LocalRuntime.finalizeStepArtifacts` is updated per T-06
**WHEN** the method signature is inspected
**THEN** the parameter `infra` is typed as `CommitPushInfra` (not `unknown`); no `as CommitPushInfra` cast appears in the method body

---

### TC-033: as CommitPushInfra and egress-params restore casts are removed from LocalRuntime

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `src/core/runtime/local.ts` is updated per T-06
**WHEN** the file is scanned for `as CommitPushInfra` and egress-params restore casts
**THEN** zero occurrences are found in the target methods (`finalizeStepArtifacts`, `commitRoundArtifacts`)

---

---

## Consumer Migration

### TC-034: step-completion uses injected CommitInspection capability

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: R2a read-only capabilities are injected directly, not re-derived from facade > Scenario: step-completion uses injected CommitInspection capability

---

### TC-035: adr-gen, custom-reviewer, spec-review parameter types are narrowed

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: R2a read-only capabilities are injected directly, not re-derived from facade > Scenario: adr-gen, custom-reviewer, spec-review parameter types are narrowed

---

### TC-036: step-completion.ts uses deps.stepIo not deps.runtimeStrategy

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** `src/core/step/step-completion.ts` is updated per T-09
**WHEN** the file is scanned for `deps.runtimeStrategy`
**THEN** zero occurrences are found; `verifyFindingRefs` calls route through `deps.stepIo?.verifyFindingRefs`

---

### TC-037: commit-orchestrator.ts uses deps.revisionContent directly

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09

**GIVEN** `commit-orchestrator.ts` is updated per T-09
**WHEN** the line that previously called `deriveRevisionContentCapability(deps.runtimeStrategy)` is inspected
**THEN** it uses `deps.revisionContent` directly — no derivation from a facade occurs at the call site

---

### TC-038: No new as unknown as RuntimeStrategy cast introduced

**Category**: unit
**Priority**: must
**Source**: request.md > Acceptance Criteria; tasks.md > T-13

**GIVEN** all test fakes previously using `runtimeStrategy: { ... }` are migrated per T-13
**WHEN** the entire `src/` tree is scanned for `as unknown as RuntimeStrategy`
**THEN** exactly the 2 pre-existing occurrences in `tests/pipeline-sole-committer-e2e.test.ts` remain; no new occurrences are present

---

---

## Command Lifecycle Ordering

### TC-039: Provider readiness failure creates no job state, worktree, or branch

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-15; request.md > Requirement 5

**GIVEN** `CommandRunner.execute` is called and the provider readiness check fails
**WHEN** the failure is observed
**THEN** no job state is persisted, no worktree is created, and no branch is set up — confirmed by verifying that `bootstrapJob`, `setupWorkspace`, and `persistJobState` are not called

---

### TC-040: Duplicate-job guard fires before bootstrapJob

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-15; request.md > Requirement 5

**GIVEN** an existing live job with the same slug is running
**WHEN** `CommandRunner.execute` is called for the same slug
**THEN** `assertNoDuplicateLiveJob` throws before `bootstrapJob` is called — confirmed by test spy ordering

---

### TC-041: reloadJobState fires after setupWorkspace on run path and is skipped on resume path

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-15; request.md > Requirement 5

**GIVEN** two separate code paths: (a) a new run and (b) a resume with an existing worktree
**WHEN** (a) setupWorkspace completes on a new run, and (b) the resume path executes
**THEN** (a) `reloadJobState` is called once after `setupWorkspace` completes; (b) `reloadJobState` is NOT called on the resume path

---

---

## Architecture and Documentation

### TC-042: architecture/components.md accurately describes post-R2b model

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-17; request.md > Requirement 8

Review `architecture/components.md` and confirm:
- `RuntimeStrategy` is described as a composition-root facade (not a service locator)
- R2a read-only capabilities (`ChangedFilesCapability`, `CommitInspectionCapability`, `RevisionContentCapability`) and R2b mutation/lifecycle capabilities (`StepArtifactLifecycleCapability`, `StepIoValidationCapability`, `TerminalStateCapability`, `RoundGitEffectsCapability`) are listed with their owning consumer layers
- `PipelineDeps` is documented as not a runtime facade service locator
- Local/Managed behavioral differences are described as confined to concrete runtime/adapter implementations

---

## Gate: Full Verification

### TC-043: typecheck passes with zero errors

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-16

`bun run typecheck` — must complete with exit code 0 and zero diagnostic errors.

---

### TC-044: build passes

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-16

`bun run build` — must complete with exit code 0.

---

### TC-045: full test suite passes

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-16

`bun run test` — must complete with exit code 0; no test regressions from the capability migration.

---

### TC-046: lint passes

**Category**: gate
**Priority**: must
**Source**: tasks.md > T-16

`bun run lint` — must complete with exit code 0; no new lint violations introduced.

---

## Result

```yaml
result: completed
total: 46
automated: 45
manual: 1
must: 41
should: 5
could: 0
blocked_reasons: []
```
