## ADDED Requirements

### Requirement: JobState.pullRequest holds the GitHub PR reference after pr-create

`JobState` SHALL include an optional `pullRequest` field with the shape:

```ts
pullRequest?: {
  url: string;        // full GitHub PR URL (e.g. https://github.com/owner/repo/pull/42)
  number: number;     // PR number (positive integer)
  createdAt: string;  // ISO 8601 timestamp at PR creation or detection
};
```

The field SHALL be set by `PrCreateStep.run` via `JobStateStore` (no direct file I/O) when the runner returns either `status: "created"` or `status: "existing-open"`. When the runner returns `status: "error"`, `pullRequest` SHALL remain at its prior value (undefined for the first attempt).

`pullRequest` SHALL be persisted by `JobStateStore.persist()` alongside the existing fields. Legacy state files lacking the field SHALL load successfully with `pullRequest === undefined`.

`specrunner ps` MAY consult `state.pullRequest.url` for display purposes, but the display layer is out of scope for this requirement (covered separately).

#### Scenario: PR creation persists url, number, createdAt

- **GIVEN** `PrCreateStep.run` invokes the runner and the runner returns `{ status: "created", url: "https://github.com/owner/repo/pull/42", number: 42 }`
- **WHEN** `run` finishes
- **THEN** `state.pullRequest.url === "https://github.com/owner/repo/pull/42"`
- **AND** `state.pullRequest.number === 42`
- **AND** `state.pullRequest.createdAt` is an ISO 8601 timestamp

#### Scenario: Existing OPEN PR detection persists pullRequest

- **GIVEN** `PrCreateStep.run` invokes the runner and the runner returns `{ status: "existing-open", url: "<u>", number: 12 }`
- **WHEN** `run` finishes
- **THEN** `state.pullRequest` is set as if the PR had been newly created
- **AND** subsequent `JobStateStore.load()` reads back the same `pullRequest` object

#### Scenario: PR creation failure does not modify pullRequest

- **GIVEN** `state.pullRequest` is undefined and `PrCreateStep.run` is invoked
- **WHEN** the runner returns `{ status: "error", reason: "gh-failure" }`
- **THEN** `state.pullRequest` is still undefined after `run` returns

#### Scenario: Legacy state files load with pullRequest undefined

- **GIVEN** a state file written by a prior CLI version that lacks the `pullRequest` field
- **WHEN** `JobStateStore.load()` is invoked
- **THEN** the loaded state has `pullRequest === undefined`
- **AND** no error is thrown

### Requirement: JobStateStore.appendStepRun supports pr-create step name

`JobStateStore.appendStepRun` SHALL accept `"pr-create"` as a valid `StepName`. The `state.steps["pr-create"]` array SHALL store `StepRun[]` for pr-create attempts in the same shape as other steps.

Because pr-create is a single-shot step (no retry loop), the array typically contains exactly one element on success and one element on failure. The cardinality is not enforced by `JobStateStore` itself; enforcement is the pipeline's responsibility (no `pr-create ↔ fixer` transition exists).

#### Scenario: appendStepRun records pr-create attempts

- **GIVEN** an empty `state.steps["pr-create"]`
- **WHEN** `JobStateStore.appendStepRun(state, "pr-create", { attempt: 1, sessionId: "(none)", outcome: { verdict: "success", ... }, startedAt, endedAt })` is invoked
- **THEN** `state.steps["pr-create"]` is `[{ attempt: 1, ... }]`
- **AND** the on-disk file is updated atomically
