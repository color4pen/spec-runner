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

### Requirement: Resume step resolution SHALL fall back to state.step when resumePoint is absent

When `resumePoint` is null and `--from` is not specified, `resolveResumeStep` MUST derive the
resume step from `state.step` if `state.step` is a valid pipeline step name.
The resolution order SHALL be: `--from` → `resumePoint.step` → `state.step`.

#### Scenario: Hard-crash job resumes from state.step

**Given** a job with `status=running`, `step="design"`, `resumePoint=null`, and a dead process
**When** `specrunner job resume <slug>` is invoked
**Then** the job transitions to running and the pipeline starts from `"design"`

#### Scenario: Job with no progress cannot be resumed

**Given** a job with `status=running`, `step="init"`, `resumePoint=null`, and a dead process
**When** `specrunner job resume <slug>` is invoked
**Then** the command exits with code 1 and logs "Cannot resolve resume step"

### Requirement: Existing resumePoint-based resume SHALL be unaffected

When `resumePoint` is present, the resume step MUST be derived from `resumePoint.step` exactly
as before, regardless of what `state.step` contains.

#### Scenario: Normal escalation resume uses resumePoint

**Given** a job with `status=awaiting-resume`, `resumePoint.step="spec-review"`, and `state.step="implementer"`
**When** `specrunner job resume <slug>` is invoked
**Then** the pipeline starts from `"spec-review"` (resumePoint wins over state.step)

### Requirement: Inbox auto-recovery SHALL succeed for stale running jobs without resumePoint

The inbox orchestrator MUST recover a stale running job that has `resumePoint=null` within
a single inbox cycle without entering the crash-loop escalation path.

#### Scenario: Inbox recovers stale running job with no resumePoint in one cycle

**Given** a job with `status=running`, `step="implementer"`, `resumePoint=null`, and a dead process
**When** the inbox orchestrator runs
**Then** the job is recovered (`resumeJob` called once) and appears in `summary.recovered`; `summary.escalated` is empty

