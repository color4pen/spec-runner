## ADDED Requirements

### Requirement: design step SHALL self-check a type-specific completion checklist before end_turn

The design step system prompt MUST include a "Completion Checklist" section that the agent evaluates before ending its session. The checklist MUST be type-specific:

- For `type: spec-change` or `type: new-feature`: the agent SHALL verify that at least one delta spec file exists under `<change>/<slug>/specs/<capability>/spec.md`. This item is REQUIRED — the agent MUST NOT end_turn while the delta spec item is unchecked.
- For `type: bug-fix` or `type: refactoring`: delta spec is not required; the checklist SHALL only verify that `design.md` and `tasks.md` are created.

If any checklist item is ✗, the agent MUST continue work and MUST NOT call end_turn until all items are ✓.

#### Scenario: type=spec-change with delta spec created

- **GIVEN** the design agent receives a request with `Request type: spec-change`
- **WHEN** the agent creates `design.md`, `tasks.md`, and at least one `specs/<capability>/spec.md`
- **THEN** all Completion Checklist items are ✓ and the agent MAY end_turn

#### Scenario: type=spec-change without delta spec — end_turn blocked

- **GIVEN** the design agent receives a request with `Request type: spec-change`
- **WHEN** the agent has created `design.md` and `tasks.md` but no delta spec
- **THEN** the delta spec checklist item is ✗ and the agent MUST NOT end_turn; it SHALL create the required delta spec first

#### Scenario: type=bug-fix without delta spec

- **GIVEN** the design agent receives a request with `Request type: bug-fix`
- **WHEN** the agent has created `design.md` and `tasks.md`
- **THEN** all Completion Checklist items are ✓ and the agent MAY end_turn (delta spec not required)

### Requirement: design initial message SHALL carry the request type as an explicit field

The initial message sent to the design agent MUST include a `Request type: <type>` line derived from `request.md`'s Meta `type:` field. The `buildInitialMessage` function SHALL accept an optional `requestType` parameter and inject it into the `{{REQUEST_TYPE}}` placeholder in the template. When `requestType` is omitted the placeholder SHALL be replaced with an empty string (backward-compatible).

#### Scenario: requestType injected into initial message

- **GIVEN** `buildInitialMessage` is called with `requestType = "spec-change"`
- **WHEN** the message is rendered
- **THEN** the output contains `Request type: \`spec-change\``

#### Scenario: requestType omitted — no placeholder leakage

- **GIVEN** `buildInitialMessage` is called without a `requestType` argument
- **WHEN** the message is rendered
- **THEN** the output does NOT contain the literal string `{{REQUEST_TYPE}}`
