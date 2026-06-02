## Purpose

TBD
## Requirements

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

### Requirement: design system prompt SHALL include Layer-1 litmus for delta spec content

The design step system prompt MUST include a "Delta Spec Content Guidance (Layer-1 litmus)" section that instructs the agent to apply the following litmus before writing each Requirement / Scenario in a delta spec:

- **Litmus**: "Is this behavior forced by structure (type / state machine / invariant)?"
  - YES → Layer-0. The agent SHALL NOT write it as a Requirement or Scenario (structure enforces it).
  - NO → Layer-1. The agent SHALL write it as a Requirement or Scenario (intent-derived choice).

The section MUST appear in the design system prompt between the delta spec artifact guideline and the Delta Spec Format Rules section.

The section MUST include at least one concrete example of Layer-0 (behavior to omit) and one concrete example of Layer-1 (behavior to include).

The section MUST state that the agent MAY read `architecture/` files to determine whether a behavior is structurally enforced.

#### Scenario: litmus text present in design system prompt

**Given** the design step system prompt is assembled
**When** its content is inspected
**Then** it contains the string "Layer-1 litmus"

#### Scenario: litmus instructs to omit Layer-0

**Given** the design step system prompt is assembled
**When** its content is inspected
**Then** it contains guidance that structurally-enforced behavior (Layer-0) SHALL NOT be written as a Requirement or Scenario in delta specs

#### Scenario: architecture reference guidance present

**Given** the design step system prompt is assembled
**When** its content is inspected
**Then** it contains guidance that the agent MAY read `architecture/` to apply the litmus
