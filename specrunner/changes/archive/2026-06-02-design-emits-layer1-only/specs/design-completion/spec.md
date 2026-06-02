## Requirements

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
