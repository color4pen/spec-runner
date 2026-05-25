## Requirements

### Requirement: Pipeline is Driven by a Declarative Transition Table

以下を既存 Requirement の transition table 定義に追加・変更する:

---

The `Transition` interface SHALL support an optional `when?: (state: JobState) => boolean` predicate を追加する。既存の `step`, `on`, `to` フィールドは変更しない。

`Pipeline.runInternal()` の transition lookup SHALL `when` predicate を評価する:
- `when` が undefined → 常にマッチ（既存挙動維持）
- `when` が定義 → `when(state)` が true の場合のみマッチ
- `Array.find()` の first-match 特性により、conditional transition を fallback の前に配置すること

The standard transition table SHALL include the following changes:

**Replaced row:**
- `code-review --approved→ adr-gen` → `code-review --approved→ delta-spec-validation`

**Added conditional row:**
- `delta-spec-validation --approved→ adr-gen` (when: `state.steps["code-review"]` に attempt が存在する場合のみ)

**Existing row retained as fallback:**
- `delta-spec-validation --approved→ spec-review` (when なし — 1st phase のデフォルト)

The full table SHALL be:

- `design --success→ delta-spec-validation`
- `design --error→ escalate`
- `delta-spec-validation --approved→ adr-gen` (when: code-review 実行済み)
- `delta-spec-validation --approved→ spec-review` (fallback)
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
- `code-review --approved→ delta-spec-validation`
- `code-review --needs-fix→ code-fixer`
- `code-review --escalation→ escalate`
- `code-fixer --approved→ code-review`
- `code-fixer --error→ escalate`
- `adr-gen --success→ pr-create`
- `adr-gen --error→ escalate`
- `pr-create --success→ end`
- `pr-create --error→ escalate`

#### Scenario: 1st phase delta-spec-validation approved routes to spec-review

- **GIVEN** pipeline is in 1st phase (code-review has NOT run)
- **WHEN** `delta-spec-validation` returns `approved`
- **THEN** the next step is `spec-review`

#### Scenario: 2nd phase delta-spec-validation approved routes to adr-gen

- **GIVEN** pipeline is in 2nd phase (code-review HAS run with at least one attempt)
- **WHEN** `delta-spec-validation` returns `approved`
- **THEN** the next step is `adr-gen`

#### Scenario: code-review approved routes to delta-spec-validation

- **GIVEN** `code-review` returns `approved`
- **WHEN** the transition table is consulted
- **THEN** the next step is `delta-spec-validation`

#### Scenario: delta-spec-validation needs-fix routes to delta-spec-fixer in both phases

- **GIVEN** `delta-spec-validation` returns `needs-fix` in either 1st or 2nd phase
- **WHEN** the transition table is consulted
- **THEN** the next step is `delta-spec-fixer`

#### Scenario: existing transitions without when predicate are unaffected

- **GIVEN** a transition without `when` predicate (e.g., `design --success→ delta-spec-validation`)
- **WHEN** the transition is evaluated
- **THEN** it matches regardless of pipeline state (backward compatible)
