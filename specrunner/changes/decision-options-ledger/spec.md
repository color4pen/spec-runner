# Spec: Decision Options Ledger

## Requirements

### Requirement: decision-needed findings SHALL include structured options

New judge report tool input SHALL reject any `resolution: "decision-needed"` finding that does not include at least two options. Each option MUST include a non-empty `label` and `consequence`.

#### Scenario: decision-needed without options is invalid

**Given** a judge step calls `report_result` with `ok: true`
**When** a finding has `resolution: "decision-needed"` and no `options`
**Then** the tool input is treated as invalid and the retry path reports missing or invalid decision options

#### Scenario: decision-needed with two options is valid

**Given** a judge step calls `report_result` with `ok: true`
**When** every `decision-needed` finding has at least two `{ label, consequence }` options
**Then** the tool result parses successfully

### Requirement: legacy persisted findings SHALL remain readable

Persisted state and historical tool results MUST remain readable when they contain old-format `decision-needed` findings without options.

#### Scenario: old state with optionless decision-needed finding loads

**Given** an existing `state.json` contains a prior step outcome with a `decision-needed` finding that has no `options`
**When** job state is read
**Then** the state is accepted without migration failure

### Requirement: escalation notifications SHALL render open decision choices

When a job stops awaiting resume due to open `decision-needed` findings, the escalation comment SHALL render each undecided finding and its options using one-based numbering.

#### Scenario: escalation comment lists options

**Given** the latest escalated judge step reported one undecided `decision-needed` finding with two options
**When** the issue notifier builds the escalation comment
**Then** the comment includes the finding title, rationale, both option labels and consequences, and a `/resume 1=...` instruction

### Requirement: resume comments SHALL accept structured selections and preserve prose

The inbox resume parser SHALL accept selection tokens in the form `N=M`, where `N` is the one-based finding number from the notification and `M` is the one-based option number. Non-selection text after `/resume` MUST remain available as the prose resume prompt.

#### Scenario: selections and prose are parsed together

**Given** a comment body `/resume 1=2 2=1 prefer lower scope`
**When** the inbox parser handles the comment
**Then** it returns selections for finding 1 option 2 and finding 2 option 1
**And** it returns `prefer lower scope` as the resume prompt

### Requirement: selected decisions SHALL be recorded before resume

When a valid `/resume` selection resolves all open decisions for the latest escalation, the system MUST append decision records to `JobState.decisions` before resuming execution.

#### Scenario: valid selections create ledger records

**Given** a job is awaiting resume with two open decision-needed findings
**When** a collaborator comments `/resume 1=2 2=1 rationale text`
**Then** the job state records two decisions with finding keys, selected option snapshots, and a timestamp
**And** the resume action preserves `rationale text` as the prose prompt

### Requirement: decided matching findings SHALL not block verdicts

Judge verdict derivation MUST ignore `decision-needed` findings whose step and deterministic finding key match an existing decision record.

#### Scenario: repeated decided finding does not escalate

**Given** `JobState.decisions` contains a decision for a prior `decision-needed` finding
**When** a later judge step reports the same matching finding again
**Then** verdict derivation does not count that finding as blocking
**And** the verdict is derived from only the remaining undecided findings

### Requirement: undecided decision-needed findings SHALL still escalate

Filtering decided findings MUST NOT suppress new or changed `decision-needed` findings that do not match the ledger.

#### Scenario: changed decision-needed finding still escalates

**Given** `JobState.decisions` contains a decision for one finding key
**When** a judge step reports a `decision-needed` finding with a different key
**Then** the finding remains verdict-affecting
**And** the verdict is escalation

### Requirement: prompt rules SHALL define decision-needed by options

Judge prompt guidance MUST state that a `decision-needed` finding requires at least two viable options with consequences, and that an issue without such options is `fixable`, not `decision-needed`.

#### Scenario: shared decision-needed definition mentions options

**Given** judge prompts import the shared decision-needed definition
**When** prompt tests inspect the rendered prompts
**Then** each judge prompt includes the options requirement and the fallback-to-fixable rule
