# pipeline-orchestrator — Delta Spec

## Requirements

### Requirement: Pipeline は deps.storeFactory 経由で JobStateStore を取得する

`Pipeline` SHALL obtain `JobStateStore` instances exclusively via `deps.storeFactory(jobId)` (where `deps: PipelineDeps` is passed to `run` / `runInternal`). `Pipeline` SHALL NOT import or inline-construct `JobStateStore` via `new`.

This applies to all state persistence points within `Pipeline`:
- Error recovery in `run()` catch block
- Post-step state persistence in `runInternal()`
- Terminal state transitions (`end` → awaiting-merge, `escalate` → awaiting-resume)
- Transition history recording
- Loop exhaustion handling in `handleExhausted()`

`PipelineDeps` SHALL include a required `storeFactory: StoreFactory` field. `StoreFactory` is defined as `(jobId: string) => JobStateStore` and SHALL be exported from `src/core/types.ts`.

The `storeFactory` SHALL be injected at the composition root (`RuntimeStrategy.buildDeps()` in `local.ts` and `managed.ts`), alongside the existing `spawn: spawnCommand` injection.

#### Scenario: Pipeline does not import JobStateStore for construction

- **WHEN** `src/core/pipeline/pipeline.ts` is grepped for `new JobStateStore`
- **THEN** zero matches are returned

#### Scenario: storeFactory is required on PipelineDeps

- **WHEN** a `PipelineDeps` object is constructed without `storeFactory`
- **THEN** TypeScript compilation fails

#### Scenario: Pipeline and StepExecutor share the same injected storeFactory

- **GIVEN** `RuntimeStrategy.buildDeps()` returns a `PipelineDeps` with `storeFactory: (id) => new JobStateStore(id)`
- **WHEN** `createStandardPipeline(deps)` constructs the `StepExecutor` and the pipeline runs
- **THEN** both `Pipeline` and `StepExecutor` use the same `deps.storeFactory` reference
- **AND** replacing `storeFactory` in deps replaces store creation for both components

#### Scenario: buildDeps injects storeFactory in both runtimes

- **WHEN** `LocalRuntime.buildDeps()` or `ManagedRuntime.buildDeps()` is invoked
- **THEN** the returned `PipelineDeps` includes `storeFactory` that creates `JobStateStore` instances
