## MODIFIED Requirements

### Requirement: Pipeline is Driven by a Declarative Transition Table
The `Pipeline` class SHALL drive step execution as a state machine using a declarative `Transition[]` table provided at construction time.

A `Transition` SHALL have the shape:

```ts
type Transition = {
  step: StepName;
  on: Verdict;            // "approved" | "needs-fix" | "escalation" | "passed" | "failed" | "success" | "error"
  to: StepName | "end" | "escalate";
};
```

Inline `if`-chains for verdict-based step routing in `pipeline.ts` SHALL be replaced by table lookup.

The standard transition table SHALL be extended to incorporate the `pr-create` step at the publish layer. The `code-review --approved→ end` row from the prior table SHALL be **replaced** by `code-review --approved→ pr-create`, and two new rows SHALL be added: `pr-create --success→ end` and `pr-create --error→ escalate`. The full table SHALL be:

- `propose --success→ spec-review`
- `spec-review --approved→ implementer`
- `spec-review --needs-fix→ spec-fixer`
- `spec-review --escalation→ escalate`
- `spec-fixer --approved→ spec-review`
- `implementer --success→ verification`
- `implementer --error→ escalate`
- `verification --passed→ code-review`
- `verification --failed→ build-fixer`
- `verification --escalation→ escalate`
- `build-fixer --success→ verification`
- `build-fixer --error→ escalate`
- `code-review --approved→ pr-create`
- `code-review --needs-fix→ code-fixer`
- `code-review --escalation→ escalate`
- `code-fixer --approved→ code-review`
- `code-fixer --error→ escalate`
- `pr-create --success→ end`
- `pr-create --error→ escalate`

The prior row `code-review --approved→ end` SHALL NOT be present in the table after this change. `pr-create` is a single-shot step (no loop) and SHALL NOT appear as both `step` and `to` in any transition row (no `pr-create ↔ <fixer>` cycle exists).

#### Scenario: Standard pipeline transitions are expressed as table rows
- **GIVEN** the standard pipeline (propose → spec-review ↔ spec-fixer → implementer → verification ↔ build-fixer → code-review ↔ code-fixer → pr-create → end)
- **WHEN** `Pipeline` is constructed
- **THEN** the transition table contains the rows enumerated in this Requirement (the full transition list defined above)

#### Scenario: code-review approved routes to pr-create
- **GIVEN** the standard pipeline
- **WHEN** `code-review` returns `approved`
- **THEN** `Pipeline.run` selects the `code-review --approved→ pr-create` row
- **AND** the next step executed is `pr-create`
- **AND** the prior row `code-review --approved→ end` is NOT present in the table

#### Scenario: pr-create success routes to end
- **GIVEN** the standard pipeline
- **WHEN** `pr-create` returns `success`
- **THEN** `Pipeline.run` selects the `pr-create --success→ end` row
- **AND** the run terminates with verdict `end`

#### Scenario: pr-create error routes to escalate
- **GIVEN** the standard pipeline
- **WHEN** `pr-create` returns `error`
- **THEN** `Pipeline.run` selects the `pr-create --error→ escalate` row
- **AND** the run terminates with verdict `escalate`
- **AND** `pipeline:fail` is emitted

#### Scenario: code-review approved does NOT route to end (regression guard)
- **WHEN** `STANDARD_TRANSITIONS` is inspected
- **THEN** there is NO row where `step === "code-review"` AND `on === "approved"` AND `to === "end"`
- **NOTE** The existing test TC-012 in `tests/unit/core/pipeline/pipeline.transitions.test.ts` MUST be updated to assert `to: "pr-create"` instead of `to: "end"`. The `pipeline-integration.test.ts` TC-050 assertion `expect(result.step).toBe("code-review")` will remain valid as `code-review` is still the last agent step before the CLI pr-create step.

#### Scenario: verification passed routes to code-review
- **GIVEN** the standard pipeline
- **WHEN** `verification` returns `passed`
- **THEN** `Pipeline.run` selects the `verification --passed→ code-review` row
- **AND** the next step executed is `code-review`
- **AND** the prior row `verification --passed→ end` is NOT present in the table

#### Scenario: Unknown transition triggers escalation
- **GIVEN** a step produces a verdict that has no matching `Transition` row
- **WHEN** `Pipeline.run` evaluates the routing
- **THEN** the run terminates as `escalate`
- **AND** the failure surfaces via `pipeline:fail` event with a diagnostic payload

## ADDED Requirements

### Requirement: pr-create is excluded from loopNames

`Pipeline.loopNames`既定値 SHALL `["spec-review", "verification", "code-review"]` のままとし、`pr-create` を含めない。pr-create は単発 step（loop なし）であり、iteration 進捗 stdout（`[iter <N>] <loopName> starting`）と loop guard の対象外である。

#### Scenario: pr-create は loopNames に含まれない

- **GIVEN** `Pipeline` constructor を `loopNames` 引数なしで呼ぶ
- **WHEN** インスタンスの `loopNames` を inspect する
- **THEN** `["spec-review", "verification", "code-review"]` を含み、`"pr-create"` を含まない

#### Scenario: pr-create 入場時に iteration 進捗は出力されない

- **GIVEN** loopNames 既定値で構築された pipeline
- **WHEN** `pr-create` step が実行される
- **THEN** stdout に `[iter <N>] pr-create starting` という行は出力されない（pr-create は loopNames に含まれないため）

### Requirement: pr-create は LOOP_ERROR_CODES に登録されない

`pr-create` は loop ではないため、`LOOP_ERROR_CODES` lookup table に entry を追加してはならない (MUST NOT)。`Pipeline.handleExhausted` は `pr-create` を考慮 SHALL NOT する。

#### Scenario: LOOP_ERROR_CODES に pr-create は存在しない

- **WHEN** `LOOP_ERROR_CODES` を inspect する
- **THEN** keys は `"spec-review"` / `"verification"` / `"code-review"` の 3 つのみで、`"pr-create"` は含まれない

### Requirement: StepName union includes "pr-create"

The `StepName` union (`src/state/schema.ts`) SHALL be extended to include the literal value `"pr-create"`, in addition to the 8 literals defined by prior changes (`propose`, `spec-review`, `spec-fixer`, `implementer`, `verification`, `build-fixer`, `code-review`, `code-fixer`).

#### Scenario: StepName union accepts "pr-create"

- **WHEN** the StepName union is inspected
- **THEN** it contains the 9 literals: `propose`, `spec-review`, `spec-fixer`, `implementer`, `verification`, `build-fixer`, `code-review`, `code-fixer`, `pr-create`

### Requirement: AgentStepName excludes "pr-create" from the Exclude clause

The `AgentStepName` type (`src/state/schema.ts`) SHALL be updated to:

```ts
export type AgentStepName = Exclude<StepName, "verification" | "pr-create">;
```

`pr-create` is a `kind: "cli"` step with no `agent` field, mirroring `verification`. Including `pr-create` in `AgentStepName` would cause `AgentRegistry`, `AgentSyncer`, and `config.agents` to treat it as an agent role, which is incorrect. The Exclude clause MUST enumerate both `"verification"` and `"pr-create"` simultaneously with this change.

#### Scenario: AgentStepName does not include "pr-create"

- **WHEN** `AgentStepName` is inspected (e.g., via TypeScript type checking or runtime assertion)
- **THEN** `"pr-create"` is NOT assignable to `AgentStepName`
- **AND** `"verification"` is NOT assignable to `AgentStepName`
- **AND** all agent-resident steps (`propose`, `spec-review`, `spec-fixer`, `implementer`, `build-fixer`, `code-review`, `code-fixer`) ARE assignable to `AgentStepName`
