# Delta Spec: pipeline-orchestrator

## MODIFIED Requirements

### Requirement: Pipeline is Driven by a Declarative Transition Table

以下を既存 Requirement の transition table 定義に追加・変更する:

---

The standard transition table SHALL include the `adr-gen` step between `code-review` and `pr-create`. The existing row `code-review --approved→ pr-create` SHALL be **replaced** by `code-review --approved→ adr-gen`. The full table SHALL be:

- `design --success→ delta-spec-validation`
- `design --error→ escalate`
- `delta-spec-validation --approved→ spec-review`
- `delta-spec-validation --needs-fix→ delta-spec-fixer`
- `delta-spec-validation --escalation→ escalate`
- `delta-spec-fixer --approved→ delta-spec-validation`
- `delta-spec-fixer --error→ escalate`
- `spec-review --approved→ test-case-gen`
- `spec-review --needs-fix→ spec-fixer`
- `spec-review --escalation→ escalate`
- `spec-fixer --approved→ delta-spec-validation`
- `spec-fixer --error→ escalate`
- `test-case-gen --success→ implementer`
- `test-case-gen --error→ escalate`
- `implementer --success→ verification`
- `implementer --error→ escalate`
- `verification --passed→ code-review`
- `verification --failed→ build-fixer`
- `verification --escalation→ escalate`
- `build-fixer --success→ verification`
- `build-fixer --error→ escalate`
- `code-review --approved→ adr-gen`
- `code-review --needs-fix→ code-fixer`
- `code-review --escalation→ escalate`
- `code-fixer --approved→ code-review`
- `code-fixer --error→ escalate`
- `adr-gen --success→ pr-create`
- `adr-gen --error→ escalate`
- `pr-create --success→ end`
- `pr-create --error→ escalate`

The prior row `code-review --approved→ pr-create` SHALL NOT be present in the table after this change. `adr-gen` is interposed between `code-review` approval and `pr-create`.

`adr-gen` は `STANDARD_LOOP_NAMES` に含めない (= loop 対象外、単発実行)。`LOOP_ERROR_CODES` にも登録しない。`STANDARD_LOOP_FIXER_PAIRS` にも登録しない。

#### Scenario: code-review approved routes to adr-gen instead of pr-create

- **GIVEN** the standard pipeline
- **WHEN** `code-review` returns `approved`
- **THEN** `Pipeline.run` selects the `code-review --approved→ adr-gen` row
- **AND** the next step executed is `adr-gen`
- **AND** the prior row `code-review --approved→ pr-create` is NOT present in the table

#### Scenario: adr-gen success routes to pr-create

- **GIVEN** the standard pipeline
- **WHEN** `adr-gen` returns `success`
- **THEN** `Pipeline.run` selects the `adr-gen --success→ pr-create` row
- **AND** the next step executed is `pr-create`

#### Scenario: adr-gen error routes to escalate

- **GIVEN** the standard pipeline
- **WHEN** `adr-gen` returns `error`
- **THEN** `Pipeline.run` selects the `adr-gen --error→ escalate` row
- **AND** the pipeline terminates with escalation

#### Scenario: code-fixer → code-review loop is maintained (regression guard)

- **GIVEN** the standard pipeline
- **WHEN** `code-fixer` returns `approved`
- **THEN** `Pipeline.run` selects `code-fixer --approved→ code-review`
- **AND** the code-review ↔ code-fixer loop operates identically to before this change

### Requirement: AgentStepName accepts only agent-resident steps (whitelist)

以下を既存 Requirement に追加する:

---

`AGENT_STEP_NAMES` 配列に `"adr-gen"` を追加する。`AgentStepName` 型は `typeof AGENT_STEP_NAMES[number]` から derive されるため自動的に `"adr-gen"` を含む。

`STEP_NAMES` オブジェクトに `ADR_GEN: "adr-gen"` を追加する。

#### Scenario: AgentStepName accepts "adr-gen"

- **WHEN** `AgentStepName` is inspected via TypeScript type checking
- **THEN** `"design"`, `"spec-review"`, `"spec-fixer"`, `"delta-spec-fixer"`, `"test-case-gen"`, `"implementer"`, `"build-fixer"`, `"code-review"`, `"code-fixer"`, `"adr-gen"` ARE assignable to `AgentStepName`
- **AND** `"verification"`, `"pr-create"`, `"delta-spec-validation"` are NOT assignable to `AgentStepName`
