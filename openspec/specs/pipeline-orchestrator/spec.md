# pipeline-orchestrator Specification

## Purpose
TBD - created by archiving change 2026-04-29-spec-review-pipeline. Update Purpose after archive.
## Requirements
### Requirement: Pipeline is Driven by a Declarative Transition Table
The `Pipeline` class SHALL drive step execution as a state machine using a declarative `Transition[]` table provided at construction time.

A `Transition` SHALL have the shape:

```ts
type Transition = {
  step: StepName;
  on: Verdict;            // "approved" | "needs-fix" | "escalation"
  to: StepName | "end" | "escalate";
};
```

Inline `if`-chains for verdict-based step routing in `pipeline.ts` SHALL be replaced by table lookup.

#### Scenario: Standard pipeline transitions are expressed as table rows
- **GIVEN** the standard pipeline (propose → spec-review ↔ spec-fixer)
- **WHEN** `Pipeline` is constructed
- **THEN** the transition table contains rows equivalent to:
  - `propose --approved→ spec-review`
  - `spec-review --approved→ end`
  - `spec-review --needs-fix→ spec-fixer`
  - `spec-fixer --approved→ spec-review`
  - `spec-review --escalation→ escalate`

#### Scenario: Unknown transition triggers escalation
- **GIVEN** a step produces a verdict that has no matching `Transition` row
- **WHEN** `Pipeline.run` evaluates the routing
- **THEN** the run terminates as `escalate`
- **AND** the failure surfaces via `pipeline:fail` event with a diagnostic payload

### Requirement: Pipeline Enforces Loop Guard via maxIterations
`Pipeline` SHALL accept a `maxIterations` parameter and SHALL terminate cycles (e.g., spec-review ↔ spec-fixer) when the cycle count reaches the limit.

The `SPEC_REVIEW_RETRIES_EXHAUSTED` error shape is preserved verbatim from the pre-refactor behavior.

#### Scenario: spec-review ↔ spec-fixer cycle terminates at maxIterations
- **GIVEN** `maxIterations = 3`
- **AND** `spec-review` returns `needs-fix` for 3 consecutive iterations
- **WHEN** the loop guard fires
- **THEN** `Pipeline.run` raises an error with code `SPEC_REVIEW_RETRIES_EXHAUSTED`
- **AND** `state.error` is set to `{ code: "SPEC_REVIEW_RETRIES_EXHAUSTED", message: "spec-review did not approve after <N> iterations", hint: "Review spec-review-result-<NNN>.md and adjust the request manually." }` — identical to the pre-refactor format
- **AND** `state.steps["spec-review"]` 末尾要素の verdict is rewritten to `escalation`
- **AND** the error code matches the pre-refactor behavior verbatim

### Requirement: Pipeline Emits Lifecycle Events
`Pipeline.run` SHALL emit lifecycle events through the injected `EventBus`:

- `pipeline:start` at the beginning of `run`
- `pipeline:complete` when the run terminates with verdict `end`
- `pipeline:fail` when the run terminates with verdict `escalate` or by exception

#### Scenario: Successful run emits start and complete
- **GIVEN** a pipeline that ends in `spec-review --approved→ end`
- **WHEN** `Pipeline.run` is invoked and completes
- **THEN** `pipeline:start` is emitted exactly once at the beginning
- **AND** `pipeline:complete` is emitted exactly once at the end
- **AND** `pipeline:fail` is NOT emitted

#### Scenario: Escalation emits pipeline:fail
- **WHEN** `Pipeline.run` terminates due to escalation or loop-guard exhaustion
- **THEN** `pipeline:fail` is emitted with the failure reason in the payload

### Requirement: step implementations are located in src/core/step/
Step implementations SHALL be located at `src/core/step/<step>.ts` (singular `step/`), replacing the prior layout `src/core/steps/<step>.ts` (plural `steps/`).

`Pipeline` itself SHALL be located at `src/core/pipeline/pipeline.ts`.

#### Scenario: File layout
- **WHEN** the change is applied
- **THEN** `src/core/step/propose.ts`, `src/core/step/spec-review.ts`, `src/core/step/spec-fixer.ts` exist
- **AND** `src/core/pipeline/pipeline.ts` exists
- **AND** `src/core/steps/` directory does not exist

### Requirement: Pipeline Emits Iteration Progress to Stdout

`Pipeline.run` SHALL emit iteration progress to stdout in the same format previously produced by `runLoopUntil`. This Requirement is the authoritative (single source of truth) definition of these format strings, superseding `pipeline-loop-primitive` spec which is REMOVED by this change.

The canonical format strings are:

- Iteration start: `[iter <N>] <loopName> starting`
- Iteration verdict approved: `[iter <N>/<max>] <loopName> verdict: approved → done`
- Iteration verdict escalation: `[iter <N>/<max>] <loopName> verdict: escalation → halt`
- Iteration verdict needs-fix (not last): `[iter <N>/<max>] <loopName> verdict: needs-fix → spawning fixer`
- Iterations exhausted: `[iter <N>/<max>] retries exhausted, escalating`

These strings MUST be reproduced bit-for-bit by `Pipeline.run`. Any future change to these format strings MUST be made in this Requirement only.

#### Scenario: Iteration progress format — approved

- **WHEN** `Pipeline.run` completes an iteration and the step returns `approved`
- **THEN** stdout contains `[iter 1/<max>] <loopName> verdict: approved → done`

#### Scenario: Iteration progress format — needs-fix continuation

- **GIVEN** `maxIterations = 2`
- **WHEN** iter=1 step returns `needs-fix` and iter < maxIterations
- **THEN** stdout contains `[iter 1/2] <loopName> verdict: needs-fix → spawning fixer`

#### Scenario: Iteration progress format — exhausted

- **GIVEN** `maxIterations = 2`
- **WHEN** iter=2 step returns `needs-fix` and the loop guard fires
- **THEN** stdout contains `[iter 2/2] retries exhausted, escalating`

