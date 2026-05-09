## MODIFIED Requirements

### Requirement: JobStateStore is the single persistence authority

The JobStateStore class SHALL be the sole persistence path for job state. Free functions in state/store.ts MUST delegate to JobStateStore static methods.

#### Scenario: createJobState delegates to JobStateStore.create
- WHEN `createJobState(params)` is called
- THEN it delegates to `JobStateStore.create(params)` internally
- AND the function is marked as `@deprecated`

#### Scenario: loadJobState delegates to JobStateStore
- WHEN `loadJobState(jobId)` is called
- THEN it delegates to `JobStateStore` load path with `validateJobState`
- AND the function is marked as `@deprecated`

#### Scenario: deleteJobState delegates to JobStateStore.delete
- WHEN `deleteJobState(jobId)` is called
- THEN it delegates to `JobStateStore.delete(jobId)` internally
- AND the function is marked as `@deprecated`

### Requirement: Legacy normalization is unified through validateJobState

The schema.ts `normalizeSteps` function SHALL be the only normalization path. Duplicate normalization in job-state-store.ts MUST be removed.

#### Scenario: JobStateStore.load uses validateJobState
- WHEN `JobStateStore.load()` is called
- THEN it uses `validateJobState(parsed)` for validation and normalization
- AND the removed functions include `normalizeStepsToStepRuns`, `isLegacySingleResult`, `isStepResultShape`, `isStepRunShape`, `normalizeSingleResultToStepRun`, `normalizeStepResultToStepRun`
