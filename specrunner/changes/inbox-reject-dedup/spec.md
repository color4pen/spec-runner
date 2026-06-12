# Spec:

<!-- SPEC WRITING GUIDANCE

This file is the self-contained spec for this change.
Write Layer-1 behaviors — choices the structure/types/FSM do not enforce automatically.

════════════════════════════════════════════════════════
REQUIREMENT FORMAT
════════════════════════════════════════════════════════

### Requirement: <name>

Each requirement describes a behavior this change introduces or modifies.
The body MUST contain a normative keyword: SHALL or MUST (English).

At least one Scenario per Requirement (Given/When/Then format):

#### Scenario: <name>

**Given** <preconditions>
**When** <action>
**Then** <expected result>

════════════════════════════════════════════════════════
EXAMPLE
════════════════════════════════════════════════════════

## Requirements

### Requirement: The system shall place spec.md before the design step

The system SHALL place a spec.md scaffold in the change folder before the design
agent runs, so the agent has a pre-structured output destination.

#### Scenario: spec.md exists before design agent starts

**Given** the pipeline is about to execute the design step
**When** the executor calls writeOutputTemplates for the design step
**Then** spec.md exists in the change folder at specrunner/changes/<slug>/spec.md

-->

## Requirements

### Requirement: Reject removes the approval label

When the inbox orchestrator rejects an issue, it SHALL remove the approval label from that issue after posting the reject comment, so the issue is excluded from future approved-issues searches until the user re-applies the label.

#### Scenario: Label removed after successful reject

**Given** an issue has the approval label and its body fails `parseRequestMdContent` validation
**When** the inbox orchestrator executes the reject action
**Then** the approval label is removed from the issue and the issue no longer appears in `searchOpenIssuesByLabel` on the next tick

#### Scenario: Label removal failure does not fail the reject

**Given** an issue has the approval label and its body fails validation
**When** the orchestrator posts the reject comment successfully but `removeLabel` throws a network error
**Then** the reject is still recorded in `summary.rejected`, no entry is added to `summary.errors`, and a warn message is written to stderr

---

### Requirement: Planner deduplicates reject notifications

The planner SHALL suppress a new `RejectAction` for an issue when the most recent specrunner notification comment on that issue is already `kind="reject"` for that issue number, preventing duplicate reject comments from accumulating.

#### Scenario: Dedup suppresses re-reject when label is still present

**Given** an issue has the approval label, its body is still invalid, and its latest notification comment is `kind="reject"` for that issue
**When** `planStarts` evaluates the issue
**Then** no `RejectAction` and no `StartAction` is produced for that issue

#### Scenario: Dedup does not suppress when latest notification is a different kind

**Given** an issue has the approval label, its body is invalid, and its latest notification comment is `kind="escalation"` (not reject)
**When** `planStarts` evaluates the issue
**Then** a `RejectAction` is produced for the issue

#### Scenario: Dedup does not suppress a start when body becomes valid

**Given** an issue has the approval label, its latest notification comment is `kind="reject"`, but its body is now valid
**When** `planStarts` evaluates the issue
**Then** a `StartAction` is produced and no `RejectAction` is produced

---

### Requirement: Re-approved issue with valid body is planned for start

After a rejection and label removal, when the user fixes the issue body and re-applies the approval label, the orchestrator MUST plan a `StartAction` for the issue on the next tick.

#### Scenario: Start planned after label re-application with valid body

**Given** an issue was previously rejected (reject comment present) and the approval label was removed
**When** the user fixes the issue body and re-applies the approval label, and the next inbox tick runs
**Then** `planStarts` produces a `StartAction` for the issue

