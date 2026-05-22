# step-execution-architecture — Delta Spec

## Requirements

### Requirement: StepExecutor は storeFactory 経由で JobStateStore を取得する

`StepExecutor` SHALL accept a `StoreFactory` (`(jobId: string) => JobStateStore`) via constructor injection. The `getStore(jobId)` method SHALL use the injected `storeFactory` instead of `new JobStateStore(jobId)`.

`StepExecutor` SHALL NOT import or inline-construct `JobStateStore` via `new`. All `JobStateStore` instances within `StepExecutor` SHALL be created through the injected `storeFactory`.

The `getStore(jobId)` caching mechanism (returning the same instance for the same `jobId` within a step execution) SHALL be preserved. The cache avoids redundant factory calls but does not bypass the injection seam.

`createStandardPipeline` and `runDesignPipeline` SHALL pass `deps.storeFactory` to the `StepExecutor` constructor.

#### Scenario: StepExecutor uses injected storeFactory

- **GIVEN** a `StepExecutor` constructed with a custom `storeFactory`
- **WHEN** `execute(step, state, deps)` is called
- **THEN** all `JobStateStore` instances are created via the injected `storeFactory`
- **AND** `new JobStateStore(...)` is NOT called directly

#### Scenario: getStore caching is preserved with injected factory

- **GIVEN** a `StepExecutor` with an injected `storeFactory`
- **WHEN** `getStore(jobId)` is called twice with the same `jobId`
- **THEN** the `storeFactory` is invoked only once
- **AND** the same `JobStateStore` instance is returned both times

#### Scenario: StepExecutor does not import JobStateStore for construction

- **WHEN** `src/core/step/executor.ts` is grepped for `new JobStateStore`
- **THEN** zero matches are returned
