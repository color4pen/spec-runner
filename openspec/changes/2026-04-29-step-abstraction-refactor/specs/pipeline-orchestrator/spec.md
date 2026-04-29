## MODIFIED Requirements

This delta modifies the existing `pipeline-orchestrator` capability. The following Requirements are MODIFIED or REMOVED as part of introducing the `Pipeline` class and declarative transition table (D3).

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

This MODIFIED Requirement replaces `Requirement: runPipeline は step 関数を順次実行する上位オーケストレーターである` and `Requirement: runPipeline は verdict に応じて以降の step を skip する` from the existing spec. The `runLoopUntil` delegation model is superseded by the transition table (see REMOVED below).

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

This MODIFIED Requirement replaces `Requirement: runPipeline は retry 上限到達時に escalation verdict と SPEC_REVIEW_RETRIES_EXHAUSTED を記録する` and `Requirement: runPipeline は spec-review needs-fix で spec-fixer → spec-review iteration loop を起動する` from the existing spec. The `SPEC_REVIEW_RETRIES_EXHAUSTED` error shape is preserved verbatim (see below).

#### Scenario: spec-review ↔ spec-fixer cycle terminates at maxIterations
- **GIVEN** `maxIterations = 3`
- **AND** `spec-review` returns `needs-fix` for 3 consecutive iterations
- **WHEN** the loop guard fires
- **THEN** `Pipeline.run` raises an error with code `SPEC_REVIEW_RETRIES_EXHAUSTED`
- **AND** `state.error` is set to `{ code: "SPEC_REVIEW_RETRIES_EXHAUSTED", message: "spec-review did not approve after <N> iterations", hint: "Review spec-review-result-<NNN>.md and adjust the request manually." }` — identical to the pre-refactor format
- **AND** `state.steps["spec-review"]`末尾要素の verdict is rewritten to `escalation`
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

### Requirement: step implementations are located in src/core/step/ (MODIFIED layout)
Step implementations SHALL be located at `src/core/step/<step>.ts` (singular `step/`), replacing the prior layout `src/core/steps/<step>.ts` (plural `steps/`).

`Pipeline` itself SHALL be located at `src/core/pipeline/pipeline.ts`.

This MODIFIED Requirement replaces `Requirement: step 関数は src/core/steps/ 配下に配置される` and `Requirement: PipelineDeps の正規ロケーションは src/core/types.ts である` from the existing spec. `PipelineDeps` is superseded by constructor-injected dependencies (`StepExecutor`, `EventBus`, `JobStateStore`) per the new class architecture.

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

## REMOVED Requirements

The following Requirements from the existing `pipeline-orchestrator` spec are REMOVED by this delta:

- `Requirement: runPipeline は iteration progress を stdout に逐次出力する` — superseded by `Requirement: Pipeline Emits Iteration Progress to Stdout` above, which is now the single source of truth for stdout format strings.
- `Requirement: runPipeline は state ファイルを single source of truth として扱う` — superseded by `JobStateStore` as the sole persistence authority (see `job-state-store` delta).

Note: the `runLoopUntil` function at `src/core/loop.ts` is absorbed into `Pipeline.run` internal logic. The `pipeline-loop-primitive` capability is REMOVED by this change (see `change-folder/specs/pipeline-loop-primitive/spec.md`). Stdout format ownership is transferred to this delta's `Requirement: Pipeline Emits Iteration Progress to Stdout`.
